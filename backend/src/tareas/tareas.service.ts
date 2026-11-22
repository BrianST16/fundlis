import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AsignacionesService } from '../asignaciones/asignaciones.service';
import { UsuarioActual } from '../auth/auth.types';
import { CalendarioService } from '../calendario/calendario.service';
import { fechaEnBogota, sumarDiasHabiles } from '../calendario/dias-habiles';
import { ASIGNACION_VIGENTE, EstadoAsignacion } from '../common/enums';
import { ParametrosService } from '../common/parametros.service';
import { DecisionTarea, DestinoLocal, LoteFisico, OfertaXPeticion, Tarea } from '../entities';
import { LocalService } from '../local/local.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { calcularPlazo } from '../plazos/plazos';

const recorte = (t: string, n = 60) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t);

export interface ResumenRevision {
  fecha: string;
  avisosProximos: number;
  avisosVencidos: number;
  tareasCreadas: number;
  tareasCerradasAutomaticamente: number;
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
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || this.config.get<string>('PLAZOS_REVISOR') === 'off') return;
    const minutos = await this.parametros.numero('PLAZOS_REVISION_MINUTOS', 15).catch(() => 15);
    const correr = () =>
      this.revisar().catch((e) => this.log.error(`Revision de plazos fallo: ${e?.message}`));
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
          mensaje: `Tu plazo para ${accion} vence el ${p.fechaLimite} (dias habiles).`,
          entidad: 'ASIGNACION',
          entidadId: a.id,
          clave: `${base}:PROXIMO`,
        });
        await this.notificaciones.aPersonalLis({
          tipo: 'PLAZO_PROXIMO',
          titulo: `Plazo por vencer: asignacion ${a.id}`,
          mensaje: `El plazo del ${p.responsable.toLowerCase()} para la asignacion ${a.id} vence el ${p.fechaLimite}.`,
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
        mensaje: `Vencio tu plazo para ${accion} (limite ${p.fechaLimite}). El personal del LIS se comunicara contigo para definir el estado.`,
        entidad: 'ASIGNACION',
        entidadId: a.id,
        clave: `${base}:VENCIDO`,
      });
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `DEFINIR_ESTADO: asignacion ${a.id}`,
        mensaje: `Vencio el plazo del ${p.responsable.toLowerCase()} (limite ${p.fechaLimite}). Decide: ${p.acciones.map((x) => x.codigo).join(', ')}.`,
        entidad: 'ASIGNACION',
        entidadId: a.id,
        clave: `${base}:VENCIDO`,
      });
    }

    // 2) LOCAL en espera de recepcion: el donador tiene el plazo normal.
    const enEspera = await this.destinos.find({ where: { estado: 'ESPERA_RECEPCION' }, relations: { oferta: true } });
    for (const d of enEspera) {
      const limite = sumarDiasHabiles(fechaEnBogota(new Date(d.seleccionadoEn)), cfg.donador, cierres);
      if (fechaEnBogota(ahora) <= limite) continue;
      if (await this.crearTarea({ clave: `VENCE:LOCAL:${d.id}:${limite}`, destinoLocalId: d.id, responsable: 'DONADOR', fechaLimite: limite })) r.tareasCreadas++;
      r.avisosVencidos += await this.notificaciones.aUsuarios([d.oferta?.donadorId], {
        tipo: 'PLAZO_VENCIDO',
        titulo: 'Tu plazo vencio',
        mensaje: `Vencio tu plazo para llevar "${recorte(d.oferta?.nombreProducto)}" al LIS (limite ${limite}).`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave: `PLAZO:LOCAL:${d.id}:${limite}:VENCIDO`,
      });
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `DEFINIR_ESTADO: destino LOCAL ${d.id}`,
        mensaje: `El donador no llevo el producto destinado a LOCAL (limite ${limite}). Decide: cancelar o contactar.`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave: `PLAZO:LOCAL:${d.id}:${limite}:VENCIDO`,
      });
    }

    // 3) Custodia temporal LOCAL que supera su espera: el LIS decide destino.
    const enCustodia = await this.destinos.find({ where: { estado: 'CUSTODIA_TEMPORAL' } });
    for (const d of enCustodia) {
      if (!d.custodiaDesde) continue;
      const limite = sumarDiasHabiles(fechaEnBogota(new Date(d.custodiaDesde)), diasLocal, cierres);
      if (fechaEnBogota(ahora) <= limite) continue;
      if (await this.crearTarea({ clave: `CUSTODIA:LOCAL:${d.id}:${limite}`, destinoLocalId: d.id, loteId: d.loteId, responsable: 'LIS', fechaLimite: limite })) r.tareasCreadas++;
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `DEFINIR_ESTADO: custodia LOCAL ${d.id}`,
        mensaje: `La custodia temporal del destino LOCAL ${d.id} supero ${diasLocal} dias habiles (limite ${limite}). Decide: reasignar, devolver o solicitar aceptacion institucional.`,
        entidad: 'LOCAL',
        entidadId: d.id,
        clave: `CUSTODIA:LOCAL:${d.id}:${limite}`,
      });
    }

    // 4) Lotes sin destino que superan la espera.
    const sinDestino = await this.lotes.find({ where: { ubicacion: 'EN_LIS' } });
    for (const l of sinDestino) {
      if (!l.sinDestinoDesde) continue;
      const limite = sumarDiasHabiles(fechaEnBogota(new Date(l.sinDestinoDesde)), diasLocal, cierres);
      if (fechaEnBogota(ahora) <= limite) continue;
      if (await this.crearTarea({ clave: `SINDESTINO:LOTE:${l.id}:${limite}`, loteId: l.id, responsable: 'LIS', fechaLimite: limite })) r.tareasCreadas++;
      await this.notificaciones.aPersonalLis({
        tipo: 'TAREA_DEFINIR_ESTADO',
        titulo: `DEFINIR_ESTADO: lote ${l.id} sin destino`,
        mensaje: `El lote ${l.id} (${l.cantidad} u.) lleva mas de ${diasLocal} dias habiles sin destino (limite ${limite}). Decide: reasignar o custodia LOCAL.`,
        entidad: 'LOTE',
        entidadId: l.id,
        clave: `SINDESTINO:LOTE:${l.id}:${limite}`,
      });
    }

    r.tareasCerradasAutomaticamente = await this.cerrarObsoletas(ahora, cfg, cierres);
    return r;
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
      if (t.asignacionId) {
        const a = await this.intentos.findOne({ where: { id: t.asignacionId } });
        const p = a ? calcularPlazo(a, ahora, cfg, cierres) : null;
        vigente = !!p && p.estado === 'VENCIDO' && p.fechaLimite === t.fechaLimite;
      } else if (t.destinoLocalId) {
        const d = await this.destinos.findOne({ where: { id: t.destinoLocalId } });
        vigente = !!d && (d.estado === 'ESPERA_RECEPCION' || d.estado === 'CUSTODIA_TEMPORAL');
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
    return this.tareas.find({ where: estado ? { estado } : {}, order: { estado: 'ASC', fechaLimite: 'ASC', id: 'ASC' } });
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
      if (!peticionId) throw new BadRequestException('Para REASIGNAR indica peticionId (elige una peticion compatible).');
      return peticionId;
    };

    if (t.asignacionId) {
      const a = await this.intentos.findOne({ where: { id: t.asignacionId } });
      if (!a) throw new NotFoundException('La asignacion de la tarea no existe.');
      switch (decision) {
        case 'APLAZAR':
          await this.asignaciones.prorrogar(a.id, 'APLAZAR', motivo, actual.sub);
          break;
        case 'EXTENDER':
          await this.asignaciones.prorrogar(a.id, 'EXTENDER', motivo, actual.sub);
          break;
        case 'CANCELAR_INTENTO':
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
          await this.asignaciones.cancelar(a.id, `Reasignacion: ${motivo}`, actual.sub);
          await this.asignaciones.reasignarLote(a.loteId, destino, actual.sub);
          break;
        }
        case 'CUSTODIA_LOCAL':
          if (a.estado !== EstadoAsignacion.EN_CUSTODIA || !a.loteId) {
            throw new BadRequestException('Solo pasa a custodia LOCAL un producto que esta EN_CUSTODIA.');
          }
          await this.asignaciones.cancelar(a.id, `Custodia LOCAL: ${motivo}`, actual.sub);
          await this.local.custodiaDesdeLote(a.loteId, motivo, actual.sub);
          break;
        case 'SIN_ACCION':
          break;
        default:
          throw new BadRequestException(`Decision ${decision} no aplica a una asignacion.`);
      }
    } else if (t.destinoLocalId) {
      const d = await this.destinos.findOne({ where: { id: t.destinoLocalId } });
      if (!d) throw new NotFoundException('El destino LOCAL de la tarea no existe.');
      switch (decision) {
        case 'CANCELAR_INTENTO':
          await this.local.cancelar(d.id, motivo, actual.sub);
          break;
        case 'REASIGNAR':
          await this.local.reasignar(d.id, exigirPeticion(), actual.sub);
          break;
        case 'SIN_ACCION':
          break; // p. ej. se contacto al donador; devolucion/aceptacion se registran en LOCAL
        default:
          throw new BadRequestException(`Decision ${decision} no aplica a un destino LOCAL. Usa CANCELAR_INTENTO, REASIGNAR o SIN_ACCION.`);
      }
    } else if (t.loteId) {
      switch (decision) {
        case 'REASIGNAR':
          await this.asignaciones.reasignarLote(t.loteId, exigirPeticion(), actual.sub);
          break;
        case 'CUSTODIA_LOCAL':
          await this.local.custodiaDesdeLote(t.loteId, motivo, actual.sub);
          break;
        case 'SIN_ACCION':
          break;
        default:
          throw new BadRequestException(`Decision ${decision} no aplica a un lote. Usa REASIGNAR, CUSTODIA_LOCAL o SIN_ACCION.`);
      }
    }

    await this.tareas.update({ id }, { estado: 'RESUELTA', decision, motivo, resueltaPor: actual.sub, resueltaEn: new Date() });
    return this.tareas.findOne({ where: { id } });
  }
}
