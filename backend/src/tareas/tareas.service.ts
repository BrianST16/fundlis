import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AnaliticaService } from '../analitica/analitica.service';
import { AsignacionesService } from '../asignaciones/asignaciones.service';
import { UsuarioActual } from '../auth/auth.types';
import { CalendarioService } from '../calendario/calendario.service';
import { fechaEnBogota, restarDiasHabiles, sumarDiasHabiles } from '../calendario/dias-habiles';
import { ASIGNACION_VIGENTE, EntidadHistorial, EstadoAsignacion } from '../common/enums';
import { ParametrosService } from '../common/parametros.service';
import { DecisionTarea, DestinoLocal, HistorialEstado, LoteFisico, OfertaXPeticion, Tarea } from '../entities';
import { LocalService } from '../local/local.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { calcularPlazo } from '../plazos/plazos';

const MOTIVOS: Record<string, string> = {
  FALLOS_REPETIDOS: 'fallos repetidos',
  REPUTACION_BAJA: 'reputación baja',
  TASA_BAJA: 'cumplimiento bajo',
};
const legibleMotivos = (m: string[]) => m.map((x) => MOTIVOS[x] ?? x).join(', ');

const recorte = (t: string, n = 60) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t);

export interface ResumenRevision {
  fecha: string;
  avisosProximos: number;
  avisosVencidos: number;
  tareasCreadas: number;
  tareasCerradasAutomaticamente: number;
  /** Personas que ENTRARON en alerta de incumplimiento en esta revision (D-55). */
  alertasNuevas: number;
}

/**
 * Pilar B: revisa plazos, crea tareas DEFINIR_ESTADO (D-23) y emite alertas
 * bilaterales (responsable + personal del LIS) por bandeja y correo.
 * Todo es IDEMPOTENTE: las claves unicas de TAREA y NOTIFICACION evitan
 * duplicados aunque la revision corra muchas veces. Se puede ejecutar con
 * una fecha simulada para probar los disparadores sin esperar dias reales.
 */
@Injectable()
export class TareasService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TareasService.name);
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Tarea) private readonly tareas: Repository<Tarea>,
    @InjectRepository(OfertaXPeticion) private readonly intentos: Repository<OfertaXPeticion>,
    @InjectRepository(DestinoLocal) private readonly destinos: Repository<DestinoLocal>,
    @InjectRepository(LoteFisico) private readonly lotes: Repository<LoteFisico>,
    private readonly asignaciones: AsignacionesService,
    private readonly local: LocalService,
    private readonly notificaciones: NotificacionesService,
    private readonly calendario: CalendarioService,
    private readonly parametros: ParametrosService,
    private readonly config: ConfigService,
    // Opcional para no acoplar las pruebas de plazos a la analitica.
    @Optional() private readonly analitica?: AnaliticaService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || this.config.get<string>('PLAZOS_REVISOR') === 'off') return;
    const minutos = await this.parametros.numero('PLAZOS_REVISION_MINUTOS', 15).catch(() => 15);
    const correr = () =>
      this.revisar().catch((e) => this.log.error(`Revisión de plazos fallo: ${e?.message}`));
    setTimeout(correr, 10_000);
    this.temporizador = setInterval(correr, Math.max(1, minutos) * 60_000);
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  // ------------------------------------------------------------------
  // Revision de vencimientos
  // ------------------------------------------------------------------
  async revisar(ahora = new Date()): Promise<ResumenRevision> {
    const [cfg, cierres] = await Promise.all([this.parametros.plazos(), this.calendario.cierres()]);
    const diasLocal = await this.parametros.numero('PLAZO_CUSTODIA_LOCAL_DIAS_HABILES', 3);
    const r: ResumenRevision = {
      fecha: fechaEnBogota(ahora),
      avisosProximos: 0,
      avisosVencidos: 0,
      tareasCreadas: 0,
      tareasCerradasAutomaticamente: 0,
      alertasNuevas: 0,
    };

    // 1) Intentos vigentes: plazo del donador o del estudiante.
    const vigentes = await this.intentos.find({
      where: { estado: In(ASIGNACION_VIGENTE) },
      relations: { oferta: true, peticion: true },
    });
    for (const a of vigentes) {
      const p = calcularPlazo(a, ahora, cfg, cierres);
      if (!p || p.estado === 'EN_PLAZO') continue;
      const responsableId = p.responsable === 'DONADOR' ? a.oferta?.donadorId : a.peticion?.estudianteId;
      const accion = p.responsable === 'DONADOR' ? `llevar "${recorte(a.oferta?.nombreProducto)}" al LIS` : `recoger "${recorte(a.oferta?.nombreProducto)}" en el LIS`;
      const base = `PLAZO:OXP:${a.id}:${p.fechaLimite}`;

      if (p.estado === 'POR_VENCER') {
        r.avisosProximos += await this.notificaciones.aUsuarios([responsableId], {
          tipo: 'PLAZO_PROXIMO',
          titulo: 'Tu plazo esta por vencer',
          mensaje: `Tu plazo para ${accion} vence el ${p.fechaLimite} (días hábiles).`,
          entidad: 'ASIGNACION',
          entidadId: a.id,
          clave: `${base}:PROXIMO`,
        });
        await this.notificaciones.aPersonalLis({
          tipo: 'PLAZO_PROXIMO',
          titulo: `Plazo por vencer: asignación ${a.id}`,
          mensaje: `El plazo del ${p.responsable.toLowerCase()} para la asignación ${a.id} vence el ${p.fechaLimite}.`,
          entidad: 'ASIGNACION',
          entidadId: a.id,
          clave: `${base}:PROXIMO`,
        });
        continue;
      }

      // VENCIDO -> tarea DEFINIR_ESTADO + alerta bilateral.
      if (await this.crearTarea({ clave: `VENCE:OXP:${a.id}:${p.fechaLimite}`, asignacionId: a.id, responsable: p.responsable, fechaLimite: p.fechaLimite })) {
        r.tareasCreadas++;
      }
      r.avisosVencidos += await this.notificaciones.aUsuarios([responsableId], {
        tipo: 'PLAZO_VENCIDO',
        titulo: 'Tu plazo vencio',
        mensaje: `Vencio tu plazo para ${accion} (límite ${p.fechaLimite}). El personal del LIS se comunicará contigo para definir el estado.`,
        entidad: 'ASIGNACION',
        entidadId: a.id,
        clave: `${base}:VENCIDO`,
      });
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `Decisión pendiente: asignación ${a.id}`,
        mensaje: `Vencio el plazo del ${p.responsable.toLowerCase()} (límite ${p.fechaLimite}). Decide: ${p.acciones.map((x) => x.codigo).join(', ')}.`,
        entidad: 'ASIGNACION',
        entidadId: a.id,
        clave: `${base}:VENCIDO`,
      });
    }

    // 2) LOCAL en espera de recepcion: el donador tiene el plazo normal.
    //    D-61: con UNA prorroga de PLAZO_APLAZAMIENTO_DONADOR_DIAS_HABILES (decision APLAZAR).
    const prorrogas = await this.configProrrogas();
    const enEspera = await this.destinos.find({ where: { estado: 'ESPERA_RECEPCION' }, relations: { oferta: true } });
    for (const d of enEspera) {
      const { limite } = await this.plazoConEsperas(
        { destinoLocalId: d.id }, new Date(d.seleccionadoEn), cfg.donador, prorrogas.diasAplazamiento, cierres, 'APLAZAR',
      );
      if (fechaEnBogota(ahora) <= limite) continue;
      if (await this.crearTarea({ clave: `VENCE:LOCAL:${d.id}:${limite}`, destinoLocalId: d.id, responsable: 'DONADOR', fechaLimite: limite })) r.tareasCreadas++;
      r.avisosVencidos += await this.notificaciones.aUsuarios([d.oferta?.donadorId], {
        tipo: 'PLAZO_VENCIDO',
        titulo: 'Tu plazo vencio',
        mensaje: `Vencio tu plazo para llevar "${recorte(d.oferta?.nombreProducto)}" al LIS (límite ${limite}).`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave: `PLAZO:LOCAL:${d.id}:${limite}:VENCIDO`,
      });
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `Decisión pendiente: destino Local ${d.id}`,
        mensaje: `El donador no llevo el producto destinado a Local (límite ${limite}). Decide: darle más tiempo (una vez) o cancelar.`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave: `PLAZO:LOCAL:${d.id}:${limite}:VENCIDO`,
      });
    }

    // 3) Custodia temporal LOCAL que supera su espera: el LIS decide destino.
    //    D-60: cada "esperar" decidido da un plazo nuevo (no queda indefinida).
    const esperaCfg = await this.configEsperas();
    const enCustodia = await this.destinos.find({ where: { estado: 'CUSTODIA_TEMPORAL' } });
    for (const d of enCustodia) {
      if (!d.custodiaDesde) continue;
      const { limite } = await this.plazoConEsperas({ destinoLocalId: d.id }, new Date(d.custodiaDesde), diasLocal, esperaCfg.dias, cierres);
      if (fechaEnBogota(ahora) <= limite) continue;
      if (await this.crearTarea({ clave: `CUSTODIA:LOCAL:${d.id}:${limite}`, destinoLocalId: d.id, loteId: d.loteId, responsable: 'LIS', fechaLimite: limite })) r.tareasCreadas++;
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `Decisión pendiente: custodia Local ${d.id}`,
        mensaje: `La custodia temporal del destino Local ${d.id} supero ${diasLocal} días hábiles (límite ${limite}). Decide: emparejar con un estudiante, devolver o (administrador) proponer al donador que quede para el LIS.`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave: `CUSTODIA:LOCAL:${d.id}:${limite}`,
      });
    }

    // 3b) D-50: propuesta LOCAL sin respuesta del donador. Nunca se acepta
    //     por silencio: al vencer se crea una tarea y se avisa a ambos.
    const propuestas = await this.destinos.find({ where: { estado: 'PROPUESTO_DONADOR' }, relations: { oferta: true } });
    const hoy = fechaEnBogota(ahora);
    for (const d of propuestas) {
      if (!d.propuestaLimite) continue;
      const limite = String(d.propuestaLimite).slice(0, 10);
      const producto = recorte(d.oferta?.nombreProducto);
      if (hoy <= limite) {
        if (hoy >= restarDiasHabiles(limite, cfg.avisoPrevio, cierres)) {
          r.avisosProximos += await this.notificaciones.aUsuarios([d.oferta?.donadorId], {
            tipo: 'PLAZO_PROXIMO',
            titulo: 'Responde la propuesta del LIS',
            mensaje: `Tienes hasta el ${limite} para aceptar o rechazar que "${producto}" quede para el LIS. Hazlo en "Mis donaciones".`,
            entidad: 'LOCAL',
            entidadId: d.id,
            clave: `PROPUESTA:LOCAL:${d.id}:${limite}:PROXIMO`,
          });
        }
        continue;
      }
      if (await this.crearTarea({ clave: `PROPUESTA:LOCAL:${d.id}:${limite}`, destinoLocalId: d.id, loteId: d.loteId, responsable: 'DONADOR', fechaLimite: limite })) r.tareasCreadas++;
      r.avisosVencidos += await this.notificaciones.aUsuarios([d.oferta?.donadorId], {
        tipo: 'PLAZO_VENCIDO',
        titulo: 'Vencio el plazo para responder al LIS',
        mensaje: `No recibimos tu respuesta sobre "${producto}" (límite ${limite}). El LIS se comunicará contigo; el producto NO queda para el LIS sin tu consentimiento.`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave: `PROPUESTA:LOCAL:${d.id}:${limite}:VENCIDO`,
      });
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `Decisión pendiente: propuesta Local ${d.id} sin respuesta`,
        mensaje: `El donador no respondió la propuesta del destino Local ${d.id} (límite ${limite}). Contáctalo y decide: darle más tiempo, retirar la propuesta o pasar a devolución.`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave: `PROPUESTA:LOCAL:${d.id}:${limite}:VENCIDO`,
      });
    }

    // 4) Lotes sin destino que superan la espera.
    const sinDestino = await this.lotes.find({ where: { ubicacion: 'EN_LIS' } });
    for (const l of sinDestino) {
      if (!l.sinDestinoDesde) continue;
      const { limite } = await this.plazoConEsperas(
        { loteId: l.id, destinoLocalId: IsNull() }, new Date(l.sinDestinoDesde), diasLocal, esperaCfg.dias, cierres,
      );
      if (fechaEnBogota(ahora) <= limite) continue;
      if (await this.crearTarea({ clave: `SINDESTINO:LOTE:${l.id}:${limite}`, loteId: l.id, responsable: 'LIS', fechaLimite: limite })) r.tareasCreadas++;
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `Decisión pendiente: lote ${l.id} sin destino`,
        mensaje: `El lote ${l.id} (${l.cantidad} u.) lleva más de ${diasLocal} días hábiles sin destino (límite ${limite}). Decide: reasignar o custodia Local.`,
        entidad: 'LOTE',
        entidadId: l.id,
        clave: `SINDESTINO:LOTE:${l.id}:${limite}`,
      });
    }

    // 4b) D-62: asignacion "en devolucion" cuyo producto sigue en el LIS.
    const enDevolucion = await this.intentos.find({ where: { estado: EstadoAsignacion.DEVOLUCION }, relations: { oferta: true } });
    for (const a of enDevolucion) {
      if (a.estado !== EstadoAsignacion.DEVOLUCION || !a.loteId || !a.cerradaEn) continue;
      const lote = await this.lotes.findOne({ where: { id: a.loteId } });
      if (lote?.ubicacion !== 'EN_LIS') continue; // ya se devolvio
      const { limite } = await this.plazoConEsperas({ asignacionId: a.id }, new Date(a.cerradaEn), esperaCfg.diasDevolver, esperaCfg.dias, cierres);
      if (fechaEnBogota(ahora) <= limite) continue;
      const producto = recorte(a.oferta?.nombreProducto);
      const clave = `DEVOLVER:OXP:${a.id}:${limite}`;
      if (await this.crearTarea({ clave, asignacionId: a.id, responsable: 'LIS', fechaLimite: limite })) r.tareasCreadas++;
      r.avisosVencidos += await this.notificaciones.aUsuarios([a.oferta?.donadorId], {
        tipo: 'PLAZO_VENCIDO',
        titulo: 'Coordina el retiro de tu donación',
        mensaje: `El LIS tiene pendiente devolverte "${producto}". Comunícate con el personal del LIS para coordinar el retiro.`,
        entidad: 'ASIGNACION',
        entidadId: a.id,
        clave,
      });
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `Decisión pendiente: devolución pendiente, asignación ${a.id}`,
        mensaje: `La devolución de "${producto}" al donador sigue pendiente (límite ${limite}). Registrala, da más tiempo una vez, pasala a custodia Local o (administrador) recibela para el LIS.`,
        entidad: 'ASIGNACION',
        entidadId: a.id,
        clave,
      });
    }

    // 5) D-60: devolucion pendiente al donador ("Por devolver") con plazo.
    const porDevolver = await this.destinos.find({ where: { estado: 'POR_DEVOLVER' }, relations: { oferta: true } });
    for (const d of porDevolver) {
      const inicio = await this.inicioPorDevolver(d);
      if (!inicio) continue;
      const { limite } = await this.plazoConEsperas({ destinoLocalId: d.id }, inicio, esperaCfg.diasDevolver, esperaCfg.dias, cierres);
      if (fechaEnBogota(ahora) <= limite) continue;
      const producto = recorte(d.oferta?.nombreProducto);
      const clave = `DEVOLVER:LOCAL:${d.id}:${limite}`;
      if (await this.crearTarea({ clave, destinoLocalId: d.id, loteId: d.loteId, responsable: 'LIS', fechaLimite: limite })) r.tareasCreadas++;
      r.avisosVencidos += await this.notificaciones.aUsuarios([d.oferta?.donadorId], {
        tipo: 'PLAZO_VENCIDO',
        titulo: 'Coordina el retiro de tu donación',
        mensaje: `El LIS tiene pendiente devolverte "${producto}". Comunícate con el personal del LIS para coordinar el retiro.`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave,
      });
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `Decisión pendiente: devolución pendiente Local ${d.id}`,
        mensaje: `La devolución de "${producto}" al donador sigue pendiente (límite ${limite}). Contáctalo y registra la devolución con foto, o espera con fecha nueva.`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave,
      });
    }

    r.tareasCerradasAutomaticamente = await this.cerrarObsoletas(ahora, cfg, cierres);
    r.alertasNuevas = await this.avisarAlertas();
    return r;
  }

  /**
   * D-55: cuando un estudiante o un donador ENTRA en alerta de incumplimiento
   * (misma regla que la pantalla de Analitica), se avisa al personal del LIS
   * (auxiliares y administradores activos). La clave incluye el numero de
   * fallos: un fallo NUEVO estando en alerta vuelve a avisar; mientras no
   * cambie, no se repite. Es informativo: no bloquea a nadie. Un fallo aqui
   * no tumba la revision de plazos.
   */
  async avisarAlertas(): Promise<number> {
    if (!this.analitica) return 0;
    try {
      const { estudiantes, donadores } = await this.analitica.alertas();
      let nuevas = 0;
      for (const e of estudiantes as any[]) {
        const n = await this.notificaciones.aPersonalLis({
          tipo: 'ALERTA_INCUMPLIMIENTO',
          titulo: `Estudiante en riesgo: ${e.nombre}`,
          mensaje:
            `${e.nombre} acumula ${e.incumplimientos} incumplimiento(s) ` +
            `(reputación ${Number(e.reputacion).toFixed(3)}). Motivos: ${legibleMotivos(e.motivos)}. ` +
            'Revisalo en Analítica antes de asignarle de nuevo. Es informativo: no lo bloquea.',
          entidad: 'USUARIO',
          entidadId: e.usuarioId,
          clave: `ALERTA:ESTUDIANTE:${e.usuarioId}:${e.incumplimientos}`,
          soloBandeja: true,
        });
        if (n > 0) nuevas++;
      }
      for (const d of donadores as any[]) {
        const n = await this.notificaciones.aPersonalLis({
          tipo: 'ALERTA_INCUMPLIMIENTO',
          titulo: `Donador con incumplimientos: ${d.nombre}`,
          mensaje:
            `${d.nombre} tiene ${d.fallidas} donación(es) fallida(s)` +
            (d.tasaCumplimiento !== null ? ` (cumplimiento ${Math.round(d.tasaCumplimiento * 100)} %)` : '') +
            `. Motivos: ${legibleMotivos(d.motivos)}. Es informativo: no lo bloquea.`,
          entidad: 'USUARIO',
          entidadId: d.usuarioId,
          clave: `ALERTA:DONADOR:${d.usuarioId}:${d.fallidas}`,
          soloBandeja: true,
        });
        if (n > 0) nuevas++;
      }
      return nuevas;
    } catch (e: any) {
      this.log.error(`No se pudieron evaluar las alertas de incumplimiento: ${e?.message}`);
      return 0;
    }
  }

  private async crearTarea(t: Partial<Tarea> & { clave: string }): Promise<boolean> {
    if (await this.tareas.findOne({ where: { clave: t.clave } })) return false;
    try {
      await this.tareas.save(this.tareas.create({ tipo: 'DEFINIR_ESTADO', estado: 'ABIERTA', ...t }));
      return true;
    } catch (e: any) {
      const n = e?.number ?? e?.originalError?.info?.number;
      if (n === 2601 || n === 2627) return false; // otra revision ya la creo
      throw e;
    }
  }

  /** Cierra tareas abiertas cuyo objeto ya se resolvio por otra via. */
  private async cerrarObsoletas(ahora: Date, cfg: any, cierres: any[]): Promise<number> {
    const abiertas = await this.tareas.find({ where: { estado: 'ABIERTA' } });
    let cerradas = 0;
    for (const t of abiertas) {
      let vigente = true;
      if (t.asignacionId && this.esDevolucion(t)) {
        // D-62: sigue pendiente mientras la asignacion este en devolucion y el producto en el LIS.
        const a = await this.intentos.findOne({ where: { id: t.asignacionId } });
        const lote = a?.loteId ? await this.lotes.findOne({ where: { id: a.loteId } }) : null;
        vigente = a?.estado === EstadoAsignacion.DEVOLUCION && lote?.ubicacion === 'EN_LIS';
      } else if (t.asignacionId) {
        const a = await this.intentos.findOne({ where: { id: t.asignacionId } });
        const p = a ? calcularPlazo(a, ahora, cfg, cierres) : null;
        vigente = !!p && p.estado === 'VENCIDO' && p.fechaLimite === t.fechaLimite;
      } else if (t.destinoLocalId) {
        const d = await this.destinos.findOne({ where: { id: t.destinoLocalId } });
        // Cada clave vigila un estado: si el destino ya salio de el, la tarea sobra.
        const estadoVigilado = t.clave.startsWith('PROPUESTA:')
          ? 'PROPUESTO_DONADOR'
          : t.clave.startsWith('DEVOLVER:')
            ? 'POR_DEVOLVER'
            : t.clave.startsWith('CUSTODIA:')
              ? 'CUSTODIA_TEMPORAL'
              : 'ESPERA_RECEPCION';
        vigente = !!d && d.estado === estadoVigilado;
      } else if (t.loteId) {
        const l = await this.lotes.findOne({ where: { id: t.loteId } });
        vigente = !!l && l.ubicacion === 'EN_LIS' && !!l.sinDestinoDesde;
      }
      if (!vigente) {
        await this.tareas.update({ id: t.id }, { estado: 'RESUELTA', decision: 'SIN_ACCION', resueltaEn: new Date(), motivo: 'Resuelta por otra via (el objeto cambio de estado o de plazo).' });
        cerradas++;
      }
    }
    return cerradas;
  }

  // ------------------------------------------------------------------
  // Consulta y resolucion
  // ------------------------------------------------------------------
  async listar(estado?: 'ABIERTA' | 'RESUELTA') {
    const lista = await this.tareas.find({ where: estado ? { estado } : {}, order: { estado: 'ASC', fechaLimite: 'ASC', id: 'ASC' } });
    // D-58: para las tareas de asignaciones, cuanto tiempo extra queda por dar
    // (la pantalla no ofrece una prorroga que el backend rechazaria).
    const ids = lista.filter((t) => t.asignacionId && t.estado === 'ABIERTA').map((t) => t.asignacionId!);
    const conEspera = await this.conEsperasDisponibles(lista);
    if (!ids.length) return conEspera;
    const [intentos, cfg] = await Promise.all([this.intentos.find({ where: { id: In(ids) } }), this.configProrrogas()]);
    const porId = new Map(intentos.map((a) => [a.id, a]));
    return conEspera.map((t) => {
      const a = t.asignacionId ? porId.get(t.asignacionId) : undefined;
      if (!a || ![EstadoAsignacion.ASIGNADO, EstadoAsignacion.EN_CUSTODIA].includes(a.estado)) return t;
      const donador = a.estado === EstadoAsignacion.ASIGNADO;
      const max = donador ? cfg.maxAplazamientos : cfg.maxExtensiones;
      return {
        ...t,
        prorroga: {
          dias: donador ? cfg.diasAplazamiento : cfg.diasExtension,
          restantes: Math.max(0, max - (a.aplazamientos ?? 0)),
        },
      };
    });
  }

  // ------------------------------------------------------------------
  // D-60: esperar siempre con fecha (Local y lotes)
  // ------------------------------------------------------------------
  private async configEsperas() {
    return {
      dias: await this.parametros.numero('PLAZO_ESPERA_LOCAL_DIAS_HABILES', 5),
      max: await this.parametros.numero('MAX_ESPERAS_LOCAL', 2),
      diasDevolver: await this.parametros.numero('PLAZO_POR_DEVOLVER_DIAS_HABILES', 5),
      // D-62: en una devolucion se da mas tiempo UNA vez (salvo el administrador).
      maxDevolucion: await this.parametros.numero('MAX_ESPERAS_DEVOLUCION', 1),
    };
  }

  /** D-62: las devoluciones pendientes (asignacion o Local) tienen su propio tope. */
  private esDevolucion(t: Tarea): boolean {
    return !!t.clave?.startsWith('DEVOLVER:');
  }

  /** Esperas (ESPERAR, o APLAZAR en la recepcion Local) tomadas sobre un objeto desde `inicio`, la mas reciente primero. */
  private async esperasDesde(filtro: Record<string, unknown>, inicio: Date, decision: DecisionTarea = 'ESPERAR'): Promise<Tarea[]> {
    const todas = await this.tareas.find({ where: { ...filtro, decision }, order: { resueltaEn: 'DESC' } });
    return (todas ?? []).filter((t) => t.resueltaEn && new Date(t.resueltaEn) >= inicio);
  }

  /**
   * Limite vigente: `diasIniciales` desde el inicio; tras una espera,
   * `diasEspera` desde la ultima. Asi la clave de la tarea cambia y el
   * revisor vuelve a crearla al vencer.
   */
  private async plazoConEsperas(
    filtro: Record<string, unknown>,
    inicio: Date,
    diasIniciales: number,
    diasEspera: number,
    cierres: any[],
    decision: DecisionTarea = 'ESPERAR',
  ): Promise<{ limite: string; esperas: number }> {
    const esperas = await this.esperasDesde(filtro, inicio, decision);
    const base = esperas.length ? new Date(esperas[0].resueltaEn!) : inicio;
    const dias = esperas.length ? diasEspera : diasIniciales;
    return { limite: sumarDiasHabiles(fechaEnBogota(base), dias, cierres), esperas: esperas.length };
  }

  /** Desde cuando un destino esta "Por devolver" (segun su historial). */
  private async inicioPorDevolver(d: DestinoLocal): Promise<Date | null> {
    const h = await this.destinos.manager.getRepository(HistorialEstado).findOne({
      where: { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoNuevo: 'POR_DEVOLVER' },
      order: { ocurridoEn: 'DESC' },
    });
    return h?.ocurridoEn ? new Date(h.ocurridoEn) : d.respuestaEn ? new Date(d.respuestaEn) : null;
  }

  /** Objeto de la tarea, su inicio y si admite ESPERAR (custodia Local, lote sin destino, por devolver). */
  private async objetoEsperable(t: Tarea): Promise<{ filtro: Record<string, unknown>; inicio: Date } | null> {
    if (t.asignacionId && this.esDevolucion(t)) {
      const a = await this.intentos.findOne({ where: { id: t.asignacionId } });
      return a?.cerradaEn ? { filtro: { asignacionId: a.id }, inicio: new Date(a.cerradaEn) } : null;
    }
    if (t.destinoLocalId && t.clave.startsWith('VENCE:')) {
      // D-61: recepcion Local vencida; su "espera" es la prorroga del donador (APLAZAR).
      const d = await this.destinos.findOne({ where: { id: t.destinoLocalId } });
      return d ? { filtro: { destinoLocalId: d.id }, inicio: new Date(d.seleccionadoEn) } : null;
    }
    if (t.destinoLocalId && (t.clave.startsWith('CUSTODIA:') || t.clave.startsWith('DEVOLVER:'))) {
      const d = await this.destinos.findOne({ where: { id: t.destinoLocalId } });
      if (!d) return null;
      const inicio = t.clave.startsWith('DEVOLVER:') ? await this.inicioPorDevolver(d) : d.custodiaDesde ? new Date(d.custodiaDesde) : null;
      return inicio ? { filtro: { destinoLocalId: d.id }, inicio } : null;
    }
    if (t.loteId && !t.destinoLocalId) {
      const l = await this.lotes.findOne({ where: { id: t.loteId } });
      return l?.sinDestinoDesde ? { filtro: { loteId: l.id, destinoLocalId: IsNull() }, inicio: new Date(l.sinDestinoDesde) } : null;
    }
    return null;
  }

  /** Para la pantalla: cuantas esperas quedan en cada tarea que las admite. */
  private async conEsperasDisponibles<T extends Tarea>(
    lista: T[],
  ): Promise<(T & { espera?: { dias: number; restantes: number | null }; prorroga?: { dias: number; restantes: number } })[]> {
    const cfg = await this.configEsperas();
    return Promise.all(
      lista.map(async (t) => {
        if (t.estado !== 'ABIERTA') return t;
        // D-61: propuesta sin respuesta: mas tiempo sin tope (restantes = null).
        if (t.destinoLocalId && t.clave.startsWith('PROPUESTA:')) {
          return { ...t, espera: { dias: await this.parametros.plazoRespuestaDonadorLocal(), restantes: null } };
        }
        const objeto = await this.objetoEsperable(t);
        if (!objeto) return t;
        if (t.clave.startsWith('VENCE:')) {
          const p = await this.configProrrogas();
          const usadas = (await this.esperasDesde(objeto.filtro, objeto.inicio, 'APLAZAR')).length;
          return { ...t, prorroga: { dias: p.diasAplazamiento, restantes: Math.max(0, p.maxAplazamientos - usadas) } };
        }
        const usadas = (await this.esperasDesde(objeto.filtro, objeto.inicio)).length;
        const max = this.esDevolucion(t) ? cfg.maxDevolucion : cfg.max;
        return { ...t, espera: { dias: cfg.dias, restantes: Math.max(0, max - usadas) } };
      }),
    );
  }

  /** Valida una decision ESPERAR: solo donde aplica y sin pasar el maximo. */
  private async exigirEsperaDisponible(t: Tarea, actual?: UsuarioActual): Promise<void> {
    const objeto = await this.objetoEsperable(t);
    if (!objeto) throw new BadRequestException('Esperar solo aplica a custodia Local, lote sin destino o devolución pendiente.');
    const cfg = await this.configEsperas();
    const max = this.esDevolucion(t) ? cfg.maxDevolucion : cfg.max;
    const usadas = (await this.esperasDesde(objeto.filtro, objeto.inicio)).length;
    // D-62: en una devolucion, el administrador puede dar mas tiempo aunque se
    // haya agotado el tope (casos anomalos); queda registrado en la tarea.
    if (usadas >= max && !(this.esDevolucion(t) && actual?.esAdministrador)) {
      throw new BadRequestException(`Ya se usaron las ${max} esperas permitidas: decide el destino del producto.`);
    }
  }

  private async configProrrogas() {
    return {
      diasAplazamiento: await this.parametros.numero('PLAZO_APLAZAMIENTO_DONADOR_DIAS_HABILES', 5),
      maxAplazamientos: await this.parametros.numero('MAX_APLAZAMIENTOS_DONADOR', 1),
      diasExtension: await this.parametros.numero('PLAZO_EXTENSION_ESTUDIANTE_DIAS_HABILES', 3),
      maxExtensiones: await this.parametros.numero('MAX_EXTENSIONES_ESTUDIANTE', 1),
    };
  }

  async resolver(
    id: number,
    datos: { decision: DecisionTarea; motivo: string; peticionId?: number },
    actual: UsuarioActual,
  ) {
    const t = await this.tareas.findOne({ where: { id } });
    if (!t) throw new NotFoundException('La tarea no existe.');
    if (t.estado !== 'ABIERTA') throw new BadRequestException('La tarea ya fue resuelta.');
    const { decision, motivo, peticionId } = datos;
    const exigirPeticion = () => {
      if (!peticionId) throw new BadRequestException('Para REASIGNAR indica peticionId (elige una petición compatible).');
      return peticionId;
    };

    if (t.asignacionId && this.esDevolucion(t)) {
      // D-62: devolucion pendiente de una asignacion.
      switch (decision) {
        case 'ESPERAR':
          await this.exigirEsperaDisponible(t, actual);
          break;
        case 'CUSTODIA_LOCAL':
          await this.local.resolverDevolucionPendiente({ asignacionId: t.asignacionId }, 'CUSTODIA', motivo, actual);
          break;
        case 'RECIBIR_LIS':
          await this.local.resolverDevolucionPendiente({ asignacionId: t.asignacionId }, 'LIS', motivo, actual);
          break;
        default:
          throw new BadRequestException(
            'En una devolución pendiente: registra la salida con foto, da más tiempo (una vez), pasala a custodia Local o (administrador) recibela para el LIS.',
          );
      }
    } else if (t.asignacionId) {
      const a = await this.intentos.findOne({ where: { id: t.asignacionId } });
      if (!a) throw new NotFoundException('La asignación de la tarea no existe.');
      switch (decision) {
        case 'APLAZAR':
          await this.asignaciones.prorrogar(a.id, 'APLAZAR', motivo, actual.sub);
          break;
        case 'EXTENDER':
          await this.asignaciones.prorrogar(a.id, 'EXTENDER', motivo, actual.sub);
          break;
        case 'CANCELAR_INTENTO':
          // D-58: con el producto en el LIS, cancelar sin destino solo abriria
          // otra tarea (lote sin destino) con la misma pregunta.
          if (a.estado === EstadoAsignacion.EN_CUSTODIA) {
            throw new BadRequestException(
              'Con el producto en el LIS elige su destino: reasignar, custodia Local o devolución. Para cancelar sin destino usa Entregas y plazos.',
            );
          }
          await this.asignaciones.cancelar(a.id, motivo, actual.sub);
          break;
        case 'DEVOLUCION':
          await this.asignaciones.marcarParaDevolucion(a.id, motivo, actual.sub);
          break;
        case 'REASIGNAR': {
          const destino = exigirPeticion();
          if (a.estado !== EstadoAsignacion.EN_CUSTODIA || !a.loteId) {
            throw new BadRequestException('Solo se reasigna un producto que esta EN_CUSTODIA.');
          }
          // Antes: cancelar y reasignar en DOS transacciones. Si la segunda
          // fallaba, la peticion original quedaba cerrada y el lote sin destino.
          await this.asignaciones.reasignarDesdeCustodia(a.id, destino, motivo, actual.sub);
          break;
        }
        case 'CUSTODIA_LOCAL':
          if (a.estado !== EstadoAsignacion.EN_CUSTODIA || !a.loteId) {
            throw new BadRequestException('Solo pasa a custodia Local un producto que esta EN_CUSTODIA.');
          }
          await this.asignaciones.cancelar(a.id, `Custodia Local: ${motivo}`, actual.sub);
          await this.local.custodiaDesdeLote(a.loteId, motivo, actual.sub);
          break;
        // D-58: sin SIN_ACCION. Cerrar la tarea sin decidir dejaba el plazo
        // vencido sin tarea ni aviso (el revisor no la vuelve a crear). Esperar
        // = dar mas tiempo (APLAZAR / EXTENDER), con duracion aprobada.
        default:
          throw new BadRequestException(
            decision === 'SIN_ACCION'
              ? 'Una asignación vencida no se cierra sin decisión: da más tiempo (si queda prórroga) o define su destino.'
              : `Decisión ${decision} no aplica a una asignación.`,
          );
      }
    } else if (t.destinoLocalId) {
      const d = await this.destinos.findOne({ where: { id: t.destinoLocalId } });
      if (!d) throw new NotFoundException('El destino Local de la tarea no existe.');
      if (d.estado === 'PROPUESTO_DONADOR') {
        // D-50: propuesta sin respuesta. Nunca se acepta sin consentimiento.
        switch (decision) {
          case 'ESPERAR':
            // D-61: mas tiempo para responder, sin tope; queda fecha nueva y aviso.
            await this.local.ampliarPropuesta(d.id, motivo, actual.sub);
            break;
          case 'RETIRAR_PROPUESTA':
            await this.local.retirarPropuesta(d.id, motivo, actual);
            break;
          case 'DEVOLUCION':
            await this.local.marcarPorDevolver(d.id, motivo, actual.sub);
            break;
          default:
            throw new BadRequestException(
              decision === 'SIN_ACCION'
                ? 'Para seguir esperando la respuesta del donador, dale más tiempo con fecha nueva (ESPERAR).'
                : `Decisión ${decision} no aplica a una propuesta sin respuesta. Usa ESPERAR, RETIRAR_PROPUESTA o DEVOLUCION.`,
            );
        }
        await this.tareas.update({ id }, { estado: 'RESUELTA', decision, motivo, resueltaPor: actual.sub, resueltaEn: new Date() });
        return this.tareas.findOne({ where: { id } });
      }
      const esperable = t.clave.startsWith('CUSTODIA:') || t.clave.startsWith('DEVOLVER:');
      switch (decision) {
        case 'CANCELAR_INTENTO':
          await this.local.cancelar(d.id, motivo, actual.sub);
          break;
        case 'REASIGNAR':
          await this.local.reasignar(d.id, exigirPeticion(), actual.sub);
          break;
        case 'ESPERAR':
          if (!esperable) throw new BadRequestException('Esperar no aplica aquí: si el donador no llevo el producto, usa APLAZAR (una vez) o cancela.');
          await this.exigirEsperaDisponible(t, actual); // D-60: fecha nueva, con tope
          break;
        case 'CUSTODIA_LOCAL':
        case 'RECIBIR_LIS':
          // D-62: "por devolver" no retirado.
          if (d.estado !== 'POR_DEVOLVER') throw new BadRequestException('Solo aplica a un producto por devolver.');
          await this.local.resolverDevolucionPendiente({ destinoLocalId: d.id }, decision === 'RECIBIR_LIS' ? 'LIS' : 'CUSTODIA', motivo, actual);
          break;
        case 'APLAZAR': {
          // D-61: el donador no llevo el producto a Local: UNA prorroga, luego cancelar.
          if (d.estado !== 'ESPERA_RECEPCION') throw new BadRequestException('Solo se da más tiempo al donador mientras el producto no ha llegado al LIS.');
          const p = await this.configProrrogas();
          const usadas = (await this.esperasDesde({ destinoLocalId: d.id }, new Date(d.seleccionadoEn), 'APLAZAR')).length;
          if (usadas >= p.maxAplazamientos) {
            throw new BadRequestException(`Ya se dio más tiempo al donador (${p.maxAplazamientos} vez/veces): cancela el destino Local.`);
          }
          await this.local.aplazarRecepcion(d.id, motivo, p.diasAplazamiento, actual.sub);
          break;
        }
        default:
          // D-60/D-61: ningun destino Local se cierra "sin accion": siempre fecha nueva o decision.
          throw new BadRequestException(
            decision === 'SIN_ACCION'
              ? 'Aquí no se cierra sin decisión: da más tiempo con fecha nueva (si queda) o define el destino.'
              : `Decisión ${decision} no aplica a un destino Local.`,
          );
      }
    } else if (t.loteId) {
      switch (decision) {
        case 'REASIGNAR':
          await this.asignaciones.reasignarLote(t.loteId, exigirPeticion(), actual.sub);
          break;
        case 'CUSTODIA_LOCAL':
          await this.local.custodiaDesdeLote(t.loteId, motivo, actual.sub);
          break;
        case 'ESPERAR':
          await this.exigirEsperaDisponible(t); // D-60: fecha nueva, con tope
          break;
        default:
          throw new BadRequestException(
            decision === 'SIN_ACCION'
              ? 'Un lote sin destino no se cierra sin decisión: espera con fecha nueva (si queda espera) o define su destino.'
              : `Decisión ${decision} no aplica a un lote. Usa REASIGNAR, CUSTODIA_LOCAL o ESPERAR.`,
          );
      }
    }

    await this.tareas.update({ id }, { estado: 'RESUELTA', decision, motivo, resueltaPor: actual.sub, resueltaEn: new Date() });
    return this.tareas.findOne({ where: { id } });
  }
}
