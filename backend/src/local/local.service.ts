import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AsignacionesService, DatosMovimiento } from '../asignaciones/asignaciones.service';
import { UsuarioActual } from '../auth/auth.types';
import { CalendarioService } from '../calendario/calendario.service';
import { fechaEnBogota, sumarDiasHabiles } from '../calendario/dias-habiles';
import { EntidadHistorial, EstadoAsignacion, EstadoOferta, TipoMovimiento } from '../common/enums';
import { HistorialService } from '../common/historial.service';
import { ParametrosService } from '../common/parametros.service';
import { EmparejamientoService } from '../emparejamiento/emparejamiento.service';
import { DecisionTarea, DestinoLocal, EstadoLocal, LoteFisico, Movimiento, Oferta, OfertaXPeticion } from '../entities';
import { EvidenciasService } from '../evidencias/evidencias.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { saldoDeOferta } from '../ofertas/saldo';
import { cerrarTareasDe } from '../tareas/cierre-tareas';

type Posterior = () => Promise<unknown>;
const recorte = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * LOCAL: el LIS como sujeto/destino institucional (D-19, D-20, D-43, D-50).
 *
 *  ESPERA_RECEPCION  --recibir (foto)-->  CUSTODIA_TEMPORAL
 *  lote sin destino  --custodia-------->  CUSTODIA_TEMPORAL
 *  CUSTODIA_TEMPORAL --reasignar / Emparejamiento--> REASIGNADO (intento EN_CUSTODIA, sin recepcion)
 *  CUSTODIA_TEMPORAL --devolver (foto)--> DEVUELTO
 *  CUSTODIA_TEMPORAL --proponer (SOLO ADMINISTRADOR, motivo)--> PROPUESTO_DONADOR
 *  PROPUESTO_DONADOR --donador ACEPTA--> ACEPTADO (patrimonio LIS)
 *  PROPUESTO_DONADOR --donador RECHAZA--> POR_DEVOLVER --devolver (foto)--> DEVUELTO
 *  PROPUESTO_DONADOR --administrador retira--> CUSTODIA_TEMPORAL
 *  PROPUESTO_DONADOR vencido --> tarea DEFINIR_ESTADO (TareasService)
 *  ESPERA_RECEPCION  --cancelar--> CANCELADO (libera unidades de la oferta)
 *
 * D-50: el producto solo queda para el LIS con el CONSENTIMIENTO del
 * donador; nunca por silencio. Nunca se crea una peticion.
 */
@Injectable()
export class LocalService {
  private readonly log = new Logger(LocalService.name);

  constructor(
    @InjectRepository(DestinoLocal) private readonly destinos: Repository<DestinoLocal>,
    @InjectRepository(LoteFisico) private readonly lotesRepo: Repository<LoteFisico>,
    @InjectRepository(OfertaXPeticion) private readonly intentos: Repository<OfertaXPeticion>,
    private readonly dataSource: DataSource,
    private readonly historial: HistorialService,
    private readonly evidencias: EvidenciasService,
    private readonly notificaciones: NotificacionesService,
    private readonly asignaciones: AsignacionesService,
    private readonly emparejamiento: EmparejamientoService,
    private readonly calendario: CalendarioService,
    private readonly parametros: ParametrosService,
  ) {}

  private async avisar(lista: Posterior[]) {
    for (const p of lista) {
      try {
        await p();
      } catch (e: any) {
        this.log.error(`Fallo al notificar: ${e?.message}`);
      }
    }
  }

  private async bloquear(mgr: EntityManager, id: number): Promise<DestinoLocal> {
    const d = await mgr
      .createQueryBuilder(DestinoLocal, 'd')
      .setLock('pessimistic_write')
      .where('d.id = :id', { id })
      .getOne();
    if (!d) throw new NotFoundException('El destino Local no existe.');
    return d;
  }

  private exigir(d: DestinoLocal, ...estados: EstadoLocal[]) {
    if (!estados.includes(d.estado)) {
      throw new BadRequestException(`Operación no permitida: el destino Local está en ${d.estado}.`);
    }
  }

  private async cambiar(mgr: EntityManager, d: DestinoLocal, nuevo: EstadoLocal, actorId: number, motivo: string) {
    const anterior = d.estado;
    d.estado = nuevo;
    await mgr.getRepository(DestinoLocal).save(d);
    await this.historial.registrar(
      { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: anterior, estadoNuevo: nuevo, actorId, motivo },
      mgr,
    );
    // D-56: todo cambio de estado del destino resuelve sus tareas abiertas,
    // con la decision que corresponde, sin importar desde que pantalla se hizo.
    await cerrarTareasDe(mgr, { destinoLocalId: d.id }, decisionPorCambio(anterior, nuevo), motivo, actorId);
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------
  async listar(estados?: EstadoLocal[]) {
    const lista = await this.destinos.find({
      where: estados?.length ? { estado: In(estados) } : {},
      relations: { oferta: { categoria: true, donador: true } },
      order: { seleccionadoEn: 'DESC' },
    });
    return lista.map((d) => this.vista(d));
  }

  /** Vista para el personal LIS (puede ver identidades/contactos, D-06):
   *  el administrador necesita el contacto del donador para hablar con el. */
  private vista(d: DestinoLocal) {
    return {
      id: d.id,
      estado: d.estado,
      origen: d.origen,
      ofertaId: d.ofertaId,
      producto: d.oferta?.nombreProducto,
      categoria: d.oferta?.categoria?.nombre,
      cantidad: d.cantidad,
      loteId: d.loteId,
      motivo: d.motivo,
      seleccionadoPor: d.seleccionadoPor,
      seleccionadoEn: d.seleccionadoEn,
      custodiaDesde: d.custodiaDesde,
      aceptacionSolicitada: !!d.aceptacionSolicitadaEn,
      aceptacionSolicitadaPor: d.aceptacionSolicitadaPor,
      aceptadoPor: d.aceptadoPor,
      aceptadoEn: d.aceptadoEn,
      cerradoEn: d.cerradoEn,
      motivoCierre: d.motivoCierre,
      propuestaMotivo: d.propuestaMotivo,
      propuestaLimite: d.propuestaLimite,
      respuestaDonador: d.respuestaDonador,
      respuestaEn: d.respuestaEn,
      respuestaMotivo: d.respuestaMotivo,
      donador: d.oferta?.donador
        ? { id: d.oferta.donador.id, nombre: d.oferta.donador.nombre, email: d.oferta.donador.email }
        : undefined,
    };
  }

  async detalle(id: number) {
    const d = await this.destinos.findOne({ where: { id }, relations: { oferta: { categoria: true, donador: true } } });
    if (!d) throw new NotFoundException('El destino Local no existe.');
    return { ...this.vista(d), historial: await this.historial.de(EntidadHistorial.LOCAL, id) };
  }

  // ------------------------------------------------------------------
  // 1) LOCAL elegido desde una OFERTA (el donador debe traer el producto)
  // ------------------------------------------------------------------
  async seleccionarDesdeOferta(ofertaId: number, cantidad: number, motivo: string, auxiliarId: number) {
    const suspendida = await this.calendario.recepcionSuspendida();
    if (suspendida) {
      throw new BadRequestException(`La recepción de donaciones esta suspendida por cierre del LIS (${suspendida.desde} a ${suspendida.hasta}).`);
    }
    const posteriores: Posterior[] = [];
    const id = await this.dataSource.transaction(async (mgr) => {
      const oferta = await mgr
        .createQueryBuilder(Oferta, 'o')
        .setLock('pessimistic_write')
        .where('o.id = :id', { id: ofertaId })
        .getOne();
      if (!oferta) throw new NotFoundException('La oferta no existe.');
      if (oferta.estado !== EstadoOferta.APROBADA) throw new BadRequestException('Solo desde una oferta aprobada.');
      const { disponible } = await saldoDeOferta(oferta, mgr);
      if (cantidad > disponible) {
        throw new BadRequestException(`Solo quedan ${disponible} unidades disponibles y se intentan destinar ${cantidad} a Local.`);
      }
      const repo = mgr.getRepository(DestinoLocal);
      const d = await repo.save(
        repo.create({
          ofertaId: oferta.id,
          origen: 'OFERTA',
          cantidad,
          estado: 'ESPERA_RECEPCION',
          seleccionadoPor: auxiliarId,
          seleccionadoEn: new Date(),
          motivo,
        }),
      );
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: null, estadoNuevo: 'ESPERA_RECEPCION', actorId: auxiliarId, motivo: `Local elegido como última opción para ${cantidad} u. de la oferta ${oferta.id}: ${motivo}` },
        mgr,
      );
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'LOCAL_SELECCIONADO',
          titulo: 'Tu donación sera recibida por el LIS',
          mensaje: `El LIS recibira ${cantidad} unidades de "${recorte(oferta.nombreProducto)}" bajo su custodia. Llevalas al LIS dentro de los proximos 10 días hábiles.`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:ESPERA_RECEPCION`,
        }),
      );
      return d.id;
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  async recibir(id: number, datos: DatosMovimiento, auxiliarId: number) {
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'ESPERA_RECEPCION');
      if (datos.cantidad !== d.cantidad) {
        throw new BadRequestException(
          `Se esperaban ${d.cantidad} unidades. No hay recepción parcial: cancela este destino y registra una nueva seleccion por lo que llegó.`,
        );
      }
      const evidencia = await this.evidencias.guardar(datos.foto, auxiliarId, mgr);
      const repoMov = mgr.getRepository(Movimiento);
      const mov = await repoMov.save(
        repoMov.create({
          destinoLocalId: d.id,
          ofertaXPeticionId: null,
          tipo: TipoMovimiento.RECEPCION,
          cantidad: datos.cantidad,
          nombreContraparte: datos.nombreContraparte,
          evidenciaId: evidencia.id,
          observaciones: datos.observaciones ?? null,
          registradoPor: auxiliarId,
        }),
      );
      const repoLote = mgr.getRepository(LoteFisico);
      const lote = await repoLote.save(
        repoLote.create({
          ofertaId: d.ofertaId,
          cantidad: d.cantidad,
          ubicacion: 'EN_LIS',
          origen: 'RECEPCION_LOCAL',
          recepcionMovimientoId: mov.id,
        }),
      );
      await repoMov.update({ id: mov.id }, { loteId: lote.id });
      d.loteId = lote.id;
      d.custodiaDesde = new Date();
      await this.cambiar(mgr, d, 'CUSTODIA_TEMPORAL', auxiliarId, `Recibidas ${d.cantidad} u. con foto (lote ${lote.id}); inicia custodia temporal del LIS`);
      await this.asignaciones.cerrarOfertaSiAgotadaEn(mgr, d.ofertaId, auxiliarId); // D-64 (C3)
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'RECEPCION_REGISTRADA',
          titulo: 'Recibimos tu donación',
          mensaje: `El LIS recibió ${d.cantidad} unidades de "${recorte(oferta.nombreProducto)}" bajo su custodia temporal. Gracias.`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:CUSTODIA_TEMPORAL`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  async cancelar(id: number, motivo: string, auxiliarId: number) {
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'ESPERA_RECEPCION');
      d.cerradoEn = new Date();
      d.motivoCierre = motivo;
      await this.cambiar(mgr, d, 'CANCELADO', auxiliarId, motivo);
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'LOCAL_CANCELADO',
          titulo: 'Se canceló la recepción institucional',
          mensaje: `El LIS canceló la recepción de "${recorte(oferta.nombreProducto)}" como destino institucional. Motivo: ${recorte(motivo, 200)}`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:CANCELADO`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  // ------------------------------------------------------------------
  // 2) Custodia temporal de un lote que ya esta en el LIS
  // ------------------------------------------------------------------
  async custodiaDesdeLote(loteId: number, motivo: string, auxiliarId: number) {
    const id = await this.dataSource.transaction((mgr) => this.custodiaDesdeLoteEn(mgr, loteId, motivo, auxiliarId));
    return this.detalle(id);
  }

  /** Version transaccional (D-62: la usa tambien una devolucion no retirada). */
  async custodiaDesdeLoteEn(mgr: EntityManager, loteId: number, motivo: string, auxiliarId: number): Promise<number> {
    {
      const lote = await this.asignaciones.bloquearLote(mgr, loteId);
      if (lote.ubicacion !== 'EN_LIS') throw new BadRequestException('El lote ya no está en el LIS.');
      const titular = await mgr.getRepository(OfertaXPeticion).findOne({
        where: { loteId, estado: In([EstadoAsignacion.EN_CUSTODIA, EstadoAsignacion.DEVOLUCION]) },
      });
      if (titular) throw new BadRequestException(`El lote está asignado (asignación ${titular.id}). Resuelve esa asignación primero.`);
      const repo = mgr.getRepository(DestinoLocal);
      const yaLocal = await repo.findOne({
        where: { loteId, estado: In(['CUSTODIA_TEMPORAL', 'PROPUESTO_DONADOR', 'POR_DEVOLVER']) },
      });
      if (yaLocal) throw new BadRequestException(`El lote ya está bajo Local (destino ${yaLocal.id}, ${yaLocal.estado}).`);
      const ahora = new Date();
      const d = await repo.save(
        repo.create({
          ofertaId: lote.ofertaId,
          loteId: lote.id,
          origen: 'LOTE',
          cantidad: lote.cantidad,
          estado: 'CUSTODIA_TEMPORAL',
          seleccionadoPor: auxiliarId,
          seleccionadoEn: ahora,
          custodiaDesde: ahora,
          motivo,
        }),
      );
      await mgr.getRepository(LoteFisico).update({ id: lote.id }, { sinDestinoDesde: null, actualizadoEn: ahora });
      // D-56: el lote sin destino ya tiene destino (custodia LOCAL).
      await cerrarTareasDe(mgr, { loteId: lote.id, soloSinDestino: true }, 'CUSTODIA_LOCAL', motivo, auxiliarId);
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: null, estadoNuevo: 'CUSTODIA_TEMPORAL', actorId: auxiliarId, motivo: `Custodia temporal Local del lote ${lote.id}: ${motivo}` },
        mgr,
      );
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOTE, entidadId: lote.id, estadoAnterior: 'SIN_DESTINO', estadoNuevo: 'CUSTODIA_LOCAL', actorId: auxiliarId, motivo: `Destino Local ${d.id}` },
        mgr,
      );
      return d.id;
    }
  }

  /**
   * D-62: devolucion que el donador no retiro (asignacion "en devolucion" o
   * destino Local "por devolver"). Dos salidas, en UNA transaccion:
   *  - CUSTODIA: el producto queda en custodia temporal Local, publicado para
   *    emparejar (cualquier personal del LIS);
   *  - LIS: el producto queda para el LIS. Solo el ADMINISTRADOR, porque el
   *    donador no respondio y no hubo su aceptacion (queda en el historial).
   */
  async resolverDevolucionPendiente(
    objeto: { asignacionId?: number; destinoLocalId?: number },
    destino: 'CUSTODIA' | 'LIS',
    motivo: string,
    actual: UsuarioActual,
  ) {
    if (destino === 'LIS' && !actual.esAdministrador) {
      throw new ForbiddenException('Solo el administrador recibe para el LIS un producto que el donador no retiró.');
    }
    const decision = destino === 'LIS' ? 'RECIBIR_LIS' : 'CUSTODIA_LOCAL';
    const texto = destino === 'LIS'
      ? `El donador no retiró el producto: el administrador lo recibe para el LIS. ${motivo}`
      : `El donador no retiró el producto: pasa a custodia temporal, publicado para emparejar. ${motivo}`;
    const posteriores: Posterior[] = [];
    const destinoId = await this.dataSource.transaction(async (mgr) => {
      let d: DestinoLocal | null = null;
      let loteId: number;
      let ofertaId: number;
      if (objeto.asignacionId) {
        const r = await this.asignaciones.cerrarDevolucionPendienteEn(mgr, objeto.asignacionId, texto, actual.sub, decision);
        loteId = r.loteId;
        ofertaId = r.ofertaId;
      } else {
        d = await this.bloquear(mgr, objeto.destinoLocalId!);
        this.exigir(d, 'POR_DEVOLVER');
        loteId = d.loteId!;
        ofertaId = d.ofertaId;
      }
      const ahora = new Date();
      let id: number;
      if (destino === 'CUSTODIA') {
        if (d) {
          d.custodiaDesde = ahora; // el plazo de custodia vuelve a empezar
          await this.cambiar(mgr, d, 'CUSTODIA_TEMPORAL', actual.sub, texto);
          id = d.id;
        } else {
          id = await this.custodiaDesdeLoteEn(mgr, loteId, texto, actual.sub);
        }
      } else {
        if (!d) {
          const repo = mgr.getRepository(DestinoLocal);
          const lote = await mgr.getRepository(LoteFisico).findOne({ where: { id: loteId } });
          d = await repo.save(
            repo.create({
              ofertaId, loteId, origen: 'LOTE', cantidad: lote!.cantidad, estado: 'ACEPTADO',
              seleccionadoPor: actual.sub, seleccionadoEn: ahora, custodiaDesde: ahora, motivo: texto.slice(0, 400),
              aceptadoPor: actual.sub, aceptadoEn: ahora, cerradoEn: ahora, motivoCierre: texto.slice(0, 400),
            }),
          );
          await this.historial.registrar(
            { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: null, estadoNuevo: 'ACEPTADO', actorId: actual.sub, motivo: texto },
            mgr,
          );
        } else {
          d.aceptadoPor = actual.sub;
          d.aceptadoEn = ahora;
          d.cerradoEn = ahora;
          d.motivoCierre = texto.slice(0, 400);
          await this.cambiar(mgr, d, 'ACEPTADO', actual.sub, texto);
        }
        await mgr.getRepository(LoteFisico).update({ id: loteId }, { ubicacion: 'PATRIMONIO_LIS', sinDestinoDesde: null, actualizadoEn: ahora });
        await this.historial.registrar(
          { entidad: EntidadHistorial.LOTE, entidadId: loteId, estadoAnterior: 'POR_DEVOLVER', estadoNuevo: 'PATRIMONIO_LIS', actorId: actual.sub, motivo: texto },
          mgr,
        );
        id = d.id;
      }
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta!.donadorId], {
          tipo: destino === 'LIS' ? 'LOCAL_ACEPTADO' : 'DEVOLUCION_NO_RETIRADA',
          titulo: destino === 'LIS' ? 'Tu donación quedó para el LIS' : 'Tu donación sigue en el LIS',
          mensaje: destino === 'LIS'
            ? `Como no se coordino el retiro de "${recorte(oferta!.nombreProducto)}", el administrador del LIS lo recibió como donativo del laboratorio.`
            : `Como no se coordino el retiro de "${recorte(oferta!.nombreProducto)}", queda bajo custodia del LIS y podrá entregarse a un estudiante que lo necesite.`,
          entidad: 'LOCAL',
          entidadId: id,
          clave: `LOCAL:${id}:DEVOLUCION_NO_RETIRADA:${destino}`,
        }),
      );
      return id;
    });
    await this.avisar(posteriores);
    return this.detalle(destinoId);
  }

  // ------------------------------------------------------------------
  // 3) Aceptacion institucional con CONSENTIMIENTO del donador (D-50)
  //    Solo el ADMINISTRADOR propone; el DONADOR acepta o rechaza.
  // ------------------------------------------------------------------

  /** Admin propone al donador que el producto quede para el LIS. */
  async proponer(id: number, motivo: string, actual: UsuarioActual) {
    // Defensa en profundidad: el controlador ya exige ADMINISTRADOR.
    if (!actual.esAdministrador) {
      throw new ForbiddenException('Solo el administrador propone que una donación quede para el LIS (D-50).');
    }
    const [dias, cierres] = await Promise.all([
      this.parametros.plazoRespuestaDonadorLocal(),
      this.calendario.cierres(),
    ]);
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'CUSTODIA_TEMPORAL');
      const ahora = new Date();
      const limite = sumarDiasHabiles(fechaEnBogota(ahora), dias, cierres);
      d.aceptacionSolicitadaPor = actual.sub;
      d.aceptacionSolicitadaEn = ahora;
      d.propuestaMotivo = motivo;
      d.propuestaLimite = limite;
      d.respuestaDonador = null;
      d.respuestaEn = null;
      d.respuestaMotivo = null;
      await this.cambiar(mgr, d, 'PROPUESTO_DONADOR', actual.sub, `Propuesta al donador para que quede en el LIS (responde hasta ${limite}): ${motivo}`);
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      // Correccion 7: el donador recibe el MOTIVO por bandeja y correo, y
      // sabe que debe responder (correccion 8).
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'LOCAL_PROPUESTA',
          titulo: 'El LIS quiere quedarse con tu donación: necesitamos tu respuesta',
          mensaje:
            `El administrador del LIS propone que "${recorte(oferta.nombreProducto)}" (${d.cantidad} u.) quede como donativo para el laboratorio. ` +
            `Motivo: ${recorte(motivo, 300)}. ` +
            `Entra a "Mis donaciones" para ACEPTAR o RECHAZAR antes del ${limite} (días hábiles). Si rechazas, el LIS te devolverá el producto.`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:PROPUESTA:${ahora.toISOString()}`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  /** Admin retira la propuesta: el producto vuelve a custodia temporal. */
  async retirarPropuesta(id: number, motivo: string, actual: UsuarioActual) {
    if (!actual.esAdministrador) {
      throw new ForbiddenException('Solo el administrador retira la propuesta (D-50).');
    }
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'PROPUESTO_DONADOR');
      d.propuestaLimite = null;
      d.propuestaMotivo = null;
      await this.cambiar(mgr, d, 'CUSTODIA_TEMPORAL', actual.sub, `Propuesta retirada por el administrador: ${motivo}`);
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'LOCAL_PROPUESTA_RETIRADA',
          titulo: 'El LIS retiro su propuesta',
          mensaje: `El LIS retiro la propuesta de quedarse con "${recorte(oferta.nombreProducto)}". Ya no necesitas responder. Motivo: ${recorte(motivo, 200)}`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:RETIRADA:${new Date().toISOString()}`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  // ------------------------------------------------------------------
  // D-61: mas tiempo para el donador (con fecha nueva y aviso)
  // ------------------------------------------------------------------

  /**
   * Propuesta sin respuesta: el LIS habla con el donador y le da otro plazo
   * para responder. Sin tope: se repite mientras haga falta, hasta que el
   * administrador decida (retirar la propuesta o pasar a devolucion).
   */
  async ampliarPropuesta(id: number, motivo: string, actorId: number) {
    const [dias, cierres] = await Promise.all([this.parametros.plazoRespuestaDonadorLocal(), this.calendario.cierres()]);
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'PROPUESTO_DONADOR');
      const limite = sumarDiasHabiles(fechaEnBogota(new Date()), dias, cierres);
      d.propuestaLimite = limite;
      await mgr.getRepository(DestinoLocal).save(d);
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: d.estado, estadoNuevo: d.estado, actorId, motivo: `Más tiempo para responder la propuesta (hasta ${limite}): ${motivo}` },
        mgr,
      );
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'LOCAL_PROPUESTA',
          titulo: 'Tienes más tiempo para responder al LIS',
          mensaje: `Puedes aceptar o rechazar que "${recorte(oferta.nombreProducto)}" quede para el LIS hasta el ${limite} (días hábiles), en "Mis donaciones".`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:PROPUESTA_AMPLIADA:${limite}`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  /**
   * Destino Local en espera de recepcion vencido: misma regla que una
   * asignacion (D-58): el donador tiene UNA prorroga; despues se cancela.
   * El tope lo valida TareasService; aqui se registra y se avisa.
   */
  async aplazarRecepcion(id: number, motivo: string, dias: number, actorId: number) {
    const cierres = await this.calendario.cierres();
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'ESPERA_RECEPCION');
      const limite = sumarDiasHabiles(fechaEnBogota(new Date()), dias, cierres);
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: d.estado, estadoNuevo: d.estado, actorId, motivo: `Más tiempo al donador para llevar el producto (hasta ${limite}): ${motivo}` },
        mgr,
      );
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'PLAZO_APLAZADO',
          titulo: 'Tienes más tiempo para llevar tu donación',
          mensaje: `Tienes hasta el ${limite} (días hábiles) para llevar "${recorte(oferta.nombreProducto)}" al LIS. Si no llega, el compromiso se cancelara.`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:APLAZADO:${limite}`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  /** Propuestas dirigidas a un donador (solo las suyas). */
  async propuestasDelDonador(donadorId: number) {
    const lista = await this.destinos.find({
      where: { estado: In(['PROPUESTO_DONADOR', 'POR_DEVOLVER', 'ACEPTADO']) },
      relations: { oferta: { categoria: true } },
      order: { aceptacionSolicitadaEn: 'DESC' },
    });
    return lista
      .filter((d) => d.oferta?.donadorId === donadorId && !!d.aceptacionSolicitadaEn)
      .map((d) => ({
        id: d.id,
        estado: d.estado,
        ofertaId: d.ofertaId,
        producto: d.oferta?.nombreProducto,
        categoria: d.oferta?.categoria?.nombre,
        fotoId: d.oferta?.fotoId ?? null,
        cantidad: d.cantidad,
        motivo: d.propuestaMotivo,
        limite: d.propuestaLimite,
        propuestaEn: d.aceptacionSolicitadaEn,
        respuesta: d.respuestaDonador,
        respuestaEn: d.respuestaEn,
        respuestaMotivo: d.respuestaMotivo,
      }));
  }

  /**
   * Respuesta del DONADOR (correccion 8).
   *  - ACEPTA  -> ACEPTADO: el lote pasa a PATRIMONIO_LIS.
   *  - RECHAZA -> POR_DEVOLVER: el LIS debe devolverle el producto (con foto).
   */
  async responder(id: number, acepta: boolean, motivo: string | undefined, actual: UsuarioActual) {
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      // Solo el dueno de la donacion responde. 404 para no revelar destinos ajenos.
      if (!oferta || oferta.donadorId !== actual.sub) throw new NotFoundException('La propuesta no existe.');
      this.exigir(d, 'PROPUESTO_DONADOR');
      const ahora = new Date();
      const nota = motivo?.trim() || null;
      d.respuestaDonador = acepta ? 'ACEPTA' : 'RECHAZA';
      d.respuestaEn = ahora;
      d.respuestaMotivo = nota;

      if (acepta) {
        // El administrador que propuso es quien autorizo (D-20); el donador consintio.
        d.aceptadoPor = d.aceptacionSolicitadaPor;
        d.aceptadoEn = ahora;
        d.cerradoEn = ahora;
        d.motivoCierre = `Aceptado con consentimiento del donador. Motivo del LIS: ${d.propuestaMotivo}`.slice(0, 400);
        await this.cambiar(mgr, d, 'ACEPTADO', actual.sub, `El donador ACEPTO que quede para el LIS${nota ? `: ${nota}` : ''}`);
        await mgr.getRepository(LoteFisico).update({ id: d.loteId }, { ubicacion: 'PATRIMONIO_LIS', actualizadoEn: ahora });
        await this.historial.registrar(
          { entidad: EntidadHistorial.LOTE, entidadId: d.loteId, estadoAnterior: 'CUSTODIA_LOCAL', estadoNuevo: 'PATRIMONIO_LIS', actorId: actual.sub, motivo: `Destino Local ${d.id} aceptado por el donador` },
          mgr,
        );
        posteriores.push(() =>
          this.notificaciones.aUsuarios([oferta.donadorId], {
            tipo: 'LOCAL_ACEPTADO',
            titulo: 'Tu donación quedó para el LIS',
            mensaje: `Gracias. "${recorte(oferta.nombreProducto)}" (${d.cantidad} u.) queda como donativo del LIS. Motivo: ${recorte(d.propuestaMotivo ?? '', 300)}`,
            entidad: 'LOCAL',
            entidadId: d.id,
            clave: `LOCAL:${d.id}:ACEPTADO`,
          }),
        );
      } else {
        await this.cambiar(mgr, d, 'POR_DEVOLVER', actual.sub, `El donador RECHAZO que quede para el LIS; se le debe devolver${nota ? `: ${nota}` : ''}`);
        posteriores.push(() =>
          this.notificaciones.aUsuarios([oferta.donadorId], {
            tipo: 'LOCAL_RECHAZADO',
            titulo: 'Registramos tu respuesta',
            mensaje: `Rechazaste que "${recorte(oferta.nombreProducto)}" quede para el LIS. El LIS se comunicará contigo para devolverte el producto.`,
            entidad: 'LOCAL',
            entidadId: d.id,
            clave: `LOCAL:${d.id}:RECHAZADO`,
          }),
        );
      }
      // El LIS (y el admin que propuso) se entera de la decision.
      posteriores.push(() =>
        this.notificaciones.aPersonalLis({
          tipo: acepta ? 'LOCAL_ACEPTADO' : 'LOCAL_POR_DEVOLVER',
          titulo: acepta ? `Local #${d.id}: el donador aceptó` : `Local #${d.id}: el donador rechazo, hay que devolver`,
          mensaje: acepta
            ? `El donador aceptó que el destino Local ${d.id} (${d.cantidad} u.) quede como patrimonio del LIS.`
            : `El donador rechazo la propuesta del destino Local ${d.id}. Coordina la devolución (${d.cantidad} u.) y registrala con foto.${nota ? ` Comentario: ${recorte(nota, 200)}` : ''}`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:RESPUESTA`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  /** Decision del LIS ante una propuesta vencida: pasar a devolucion. */
  async marcarPorDevolver(id: number, motivo: string, actorId: number) {
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'PROPUESTO_DONADOR', 'CUSTODIA_TEMPORAL');
      await this.cambiar(mgr, d, 'POR_DEVOLVER', actorId, `Pasa a devolución por decisión del LIS: ${motivo}`);
    });
    return this.detalle(id);
  }

  // ------------------------------------------------------------------
  // 4) Salidas de la custodia temporal: devolver o reasignar
  // ------------------------------------------------------------------
  async devolver(id: number, datos: DatosMovimiento, auxiliarId: number) {
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'CUSTODIA_TEMPORAL', 'POR_DEVOLVER');
      if (datos.cantidad !== d.cantidad) {
        throw new BadRequestException(`La devolución debe ser por las ${d.cantidad} unidades: no hay devoluciones parciales.`);
      }
      const evidencia = await this.evidencias.guardar(datos.foto, auxiliarId, mgr);
      const repoMov = mgr.getRepository(Movimiento);
      await repoMov.save(
        repoMov.create({
          destinoLocalId: d.id,
          ofertaXPeticionId: null,
          loteId: d.loteId,
          tipo: TipoMovimiento.DEVOLUCION,
          cantidad: datos.cantidad,
          nombreContraparte: datos.nombreContraparte,
          evidenciaId: evidencia.id,
          observaciones: datos.observaciones ?? null,
          registradoPor: auxiliarId,
        }),
      );
      const ahora = new Date();
      d.cerradoEn = ahora;
      d.motivoCierre = 'Devuelto al donador';
      await this.cambiar(mgr, d, 'DEVUELTO', auxiliarId, `Devueltas ${d.cantidad} u. al donador con foto`);
      await mgr.getRepository(LoteFisico).update({ id: d.loteId }, { ubicacion: 'DEVUELTO', actualizadoEn: ahora });
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'DEVOLUCION_REGISTRADA',
          titulo: 'Devolución registrada',
          mensaje: `Se registró la devolución de "${recorte(oferta.nombreProducto)}" (${d.cantidad} u.).`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:DEVUELTO`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  async reasignar(id: number, peticionId: number, auxiliarId: number) {
    const p = await this.emparejamiento.prioridadDe(peticionId);
    const posteriores: Posterior[] = [];
    const asignacionId = await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'CUSTODIA_TEMPORAL');
      d.cerradoEn = new Date();
      d.motivoCierre = `Reasignado a la petición ${peticionId}`;
      await this.cambiar(mgr, d, 'REASIGNADO', auxiliarId, d.motivoCierre);
      return this.asignaciones.reasignarLoteEn(mgr, d.loteId, peticionId, auxiliarId, p, posteriores);
    });
    await this.avisar(posteriores);
    return { destinoLocal: await this.detalle(id), asignacionId };
  }

  // ------------------------------------------------------------------
  // Lotes fisicos (ubicacion actual del producto)
  // ------------------------------------------------------------------
  /**
   * DISPONIBLES (D-50): lo que se puede emparejar ya mismo sin recepcion:
   * lotes sin destino + lotes en custodia temporal LOCAL. Un lote con
   * propuesta al donador o por devolver NO esta disponible.
   */
  async lotes(filtro: 'SIN_DESTINO' | 'EN_LIS' | 'TODOS' | 'DISPONIBLES' = 'EN_LIS') {
    const lista = await this.lotesRepo.find({
      where: filtro === 'TODOS' ? {} : { ubicacion: 'EN_LIS' },
      relations: { oferta: { categoria: true } },
      order: { creadoEn: 'DESC' },
    });
    if (!lista.length) return [];
    const ids = lista.map((l) => l.id);
    const [porIntento, porLocal] = await Promise.all([
      this.intentos.find({ where: { loteId: In(ids), estado: In([EstadoAsignacion.EN_CUSTODIA, EstadoAsignacion.DEVOLUCION]) } }),
      this.destinos.find({ where: { loteId: In(ids), estado: In(['CUSTODIA_TEMPORAL', 'PROPUESTO_DONADOR', 'POR_DEVOLVER']) } }),
    ]);
    const tIntento = new Map(porIntento.map((x) => [x.loteId, x]));
    const tLocal = new Map(porLocal.map((x) => [x.loteId, x]));
    return lista
      .map((l) => {
        const i = tIntento.get(l.id);
        const d = tLocal.get(l.id);
        const titular = i
          ? { tipo: 'ASIGNACION', id: i.id, estado: i.estado }
          : d
            ? { tipo: 'LOCAL', id: d.id, estado: d.estado }
            : null;
        return {
          id: l.id,
          ofertaId: l.ofertaId,
          producto: l.oferta?.nombreProducto,
          categoria: l.oferta?.categoria?.nombre,
          cantidad: l.cantidad,
          ubicacion: l.ubicacion,
          origen: l.origen,
          titular,
          sinDestino: l.ubicacion === 'EN_LIS' && !titular,
          /** En custodia temporal LOCAL: se puede emparejar directo (D-50). */
          enCustodiaLocal: !!d && d.estado === 'CUSTODIA_TEMPORAL',
          sinDestinoDesde: l.sinDestinoDesde,
          creadoEn: l.creadoEn,
        };
      })
      .filter((l) =>
        filtro === 'SIN_DESTINO' ? l.sinDestino : filtro === 'DISPONIBLES' ? l.sinDestino || l.enCustodiaLocal : true,
      );
  }
}

/** D-56: que decision representa cada cambio de estado de un destino LOCAL. */
export function decisionPorCambio(anterior: EstadoLocal, nuevo: EstadoLocal): DecisionTarea {
  if (nuevo === 'CANCELADO') return 'CANCELAR_INTENTO';
  if (nuevo === 'REASIGNADO') return 'REASIGNAR';
  if (nuevo === 'POR_DEVOLVER') return 'DEVOLUCION';
  if (anterior === 'PROPUESTO_DONADOR' && nuevo === 'CUSTODIA_TEMPORAL') return 'RETIRAR_PROPUESTA';
  // D-62: devolucion no retirada.
  if (anterior === 'POR_DEVOLVER' && nuevo === 'CUSTODIA_TEMPORAL') return 'CUSTODIA_LOCAL';
  if (anterior === 'POR_DEVOLVER' && nuevo === 'ACEPTADO') return 'RECIBIR_LIS';
  // Recepcion registrada, respuesta del donador, propuesta enviada o devolucion
  // fisica: no hubo una decision DEFINIR_ESTADO, el objeto simplemente avanzo.
  return 'SIN_ACCION';
}
