import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AsignacionesService, DatosMovimiento } from '../asignaciones/asignaciones.service';
import { UsuarioActual } from '../auth/auth.types';
import { CalendarioService } from '../calendario/calendario.service';
import { EntidadHistorial, EstadoAsignacion, EstadoOferta, TipoMovimiento } from '../common/enums';
import { HistorialService } from '../common/historial.service';
import { EmparejamientoService } from '../emparejamiento/emparejamiento.service';
import { DestinoLocal, EstadoLocal, LoteFisico, Movimiento, Oferta, OfertaXPeticion } from '../entities';
import { EvidenciasService } from '../evidencias/evidencias.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { saldoDeOferta } from '../ofertas/saldo';

type Posterior = () => Promise<unknown>;
const recorte = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * LOCAL: el LIS como sujeto/destino institucional (D-19, D-20, D-43).
 *
 *  ESPERA_RECEPCION  --recibir (foto)-->  CUSTODIA_TEMPORAL
 *  lote sin destino  --custodia-------->  CUSTODIA_TEMPORAL
 *  CUSTODIA_TEMPORAL --aceptar (SOLO ADMINISTRADOR)--> ACEPTADO (patrimonio LIS)
 *  CUSTODIA_TEMPORAL --reasignar--> REASIGNADO (nuevo intento EN_CUSTODIA, sin recepcion)
 *  CUSTODIA_TEMPORAL --devolver (foto)--> DEVUELTO
 *  ESPERA_RECEPCION  --cancelar--> CANCELADO (libera unidades de la oferta)
 *
 * Custodia temporal (auxiliar) y aceptacion permanente (administrador) son
 * operaciones y permisos distintos. Nunca se crea una peticion.
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
    if (!d) throw new NotFoundException('El destino LOCAL no existe.');
    return d;
  }

  private exigir(d: DestinoLocal, ...estados: EstadoLocal[]) {
    if (!estados.includes(d.estado)) {
      throw new BadRequestException(`Operacion no permitida: el destino LOCAL esta en ${d.estado}.`);
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
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------
  async listar(estados?: EstadoLocal[]) {
    const lista = await this.destinos.find({
      where: estados?.length ? { estado: In(estados) } : {},
      relations: { oferta: { categoria: true } },
      order: { seleccionadoEn: 'DESC' },
    });
    return lista.map((d) => this.vista(d));
  }

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
    };
  }

  async detalle(id: number) {
    const d = await this.destinos.findOne({ where: { id }, relations: { oferta: { categoria: true } } });
    if (!d) throw new NotFoundException('El destino LOCAL no existe.');
    return { ...this.vista(d), historial: await this.historial.de(EntidadHistorial.LOCAL, id) };
  }

  // ------------------------------------------------------------------
  // 1) LOCAL elegido desde una OFERTA (el donador debe traer el producto)
  // ------------------------------------------------------------------
  async seleccionarDesdeOferta(ofertaId: number, cantidad: number, motivo: string, auxiliarId: number) {
    const suspendida = await this.calendario.recepcionSuspendida();
    if (suspendida) {
      throw new BadRequestException(`La recepcion de donaciones esta suspendida por cierre del LIS (${suspendida.desde} a ${suspendida.hasta}).`);
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
        throw new BadRequestException(`Solo quedan ${disponible} unidades disponibles y se intentan destinar ${cantidad} a LOCAL.`);
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
        { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: null, estadoNuevo: 'ESPERA_RECEPCION', actorId: auxiliarId, motivo: `LOCAL elegido como ultima opcion para ${cantidad} u. de la oferta ${oferta.id}: ${motivo}` },
        mgr,
      );
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'LOCAL_SELECCIONADO',
          titulo: 'Tu donacion sera recibida por el LIS',
          mensaje: `El LIS recibira ${cantidad} unidades de "${recorte(oferta.nombreProducto)}" bajo su custodia. Llevalas al LIS dentro de los proximos 10 dias habiles.`,
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
          `Se esperaban ${d.cantidad} unidades. No hay recepcion parcial: cancela este destino y registra una nueva seleccion por lo que llego.`,
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
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'RECEPCION_REGISTRADA',
          titulo: 'Recibimos tu donacion',
          mensaje: `El LIS recibio ${d.cantidad} unidades de "${recorte(oferta.nombreProducto)}" bajo su custodia temporal. Gracias.`,
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
          titulo: 'Se cancelo la recepcion institucional',
          mensaje: `El LIS cancelo la recepcion de "${recorte(oferta.nombreProducto)}" como destino institucional. Motivo: ${recorte(motivo, 200)}`,
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
    const id = await this.dataSource.transaction(async (mgr) => {
      const lote = await this.asignaciones.bloquearLote(mgr, loteId);
      if (lote.ubicacion !== 'EN_LIS') throw new BadRequestException('El lote ya no esta en el LIS.');
      const titular = await mgr.getRepository(OfertaXPeticion).findOne({
        where: { loteId, estado: In([EstadoAsignacion.EN_CUSTODIA, EstadoAsignacion.DEVOLUCION]) },
      });
      if (titular) throw new BadRequestException(`El lote esta asignado (asignacion ${titular.id}). Resuelve esa asignacion primero.`);
      const repo = mgr.getRepository(DestinoLocal);
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
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: null, estadoNuevo: 'CUSTODIA_TEMPORAL', actorId: auxiliarId, motivo: `Custodia temporal LOCAL del lote ${lote.id}: ${motivo}` },
        mgr,
      );
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOTE, entidadId: lote.id, estadoAnterior: 'SIN_DESTINO', estadoNuevo: 'CUSTODIA_LOCAL', actorId: auxiliarId, motivo: `Destino LOCAL ${d.id}` },
        mgr,
      );
      return d.id;
    });
    return this.detalle(id);
  }

  // ------------------------------------------------------------------
  // 3) Aceptacion institucional: el auxiliar SOLICITA, el administrador ACEPTA
  // ------------------------------------------------------------------
  async solicitarAceptacion(id: number, motivo: string, auxiliarId: number) {
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'CUSTODIA_TEMPORAL');
      d.aceptacionSolicitadaPor = auxiliarId;
      d.aceptacionSolicitadaEn = new Date();
      await mgr.getRepository(DestinoLocal).save(d);
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOCAL, entidadId: d.id, estadoAnterior: d.estado, estadoNuevo: d.estado, actorId: auxiliarId, motivo: `Solicitud de aceptacion institucional: ${motivo}` },
        mgr,
      );
    });
    await this.notificaciones.aAdministradores({
      tipo: 'LOCAL_ACEPTACION_SOLICITADA',
      titulo: 'Aceptacion institucional pendiente',
      mensaje: `Un auxiliar solicito aceptar como donativo institucional del LIS el destino LOCAL ${id}. Requiere autorizacion del administrador.`,
      entidad: 'LOCAL',
      entidadId: id,
      clave: `LOCAL:${id}:SOLICITUD`,
    });
    return this.detalle(id);
  }

  async aceptar(id: number, motivo: string, actual: UsuarioActual) {
    // Defensa en profundidad: el controlador ya exige ADMINISTRADOR.
    if (!actual.esAdministrador) {
      throw new ForbiddenException('Solo el administrador autoriza la aceptacion institucional (D-20).');
    }
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'CUSTODIA_TEMPORAL');
      const ahora = new Date();
      d.aceptadoPor = actual.sub;
      d.aceptadoEn = ahora;
      d.cerradoEn = ahora;
      d.motivoCierre = motivo;
      await this.cambiar(mgr, d, 'ACEPTADO', actual.sub, `Aceptado como donativo institucional por el administrador: ${motivo}`);
      await mgr.getRepository(LoteFisico).update({ id: d.loteId }, { ubicacion: 'PATRIMONIO_LIS', actualizadoEn: ahora });
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOTE, entidadId: d.loteId, estadoAnterior: 'CUSTODIA_LOCAL', estadoNuevo: 'PATRIMONIO_LIS', actorId: actual.sub, motivo: `Destino LOCAL ${d.id} aceptado` },
        mgr,
      );
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: d.ofertaId } });
      posteriores.push(() =>
        this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'LOCAL_ACEPTADO',
          titulo: 'Tu donacion fue aceptada por el LIS',
          mensaje: `El LIS acepto "${recorte(oferta.nombreProducto)}" (${d.cantidad} u.) como donativo institucional. Gracias por tu aporte.`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:ACEPTADO`,
        }),
      );
      posteriores.push(() =>
        this.notificaciones.aPersonalLis({
          tipo: 'LOCAL_ACEPTADO',
          titulo: 'Aceptacion institucional autorizada',
          mensaje: `El destino LOCAL ${d.id} (${d.cantidad} u.) fue aceptado como patrimonio del LIS.`,
          entidad: 'LOCAL',
          entidadId: d.id,
          clave: `LOCAL:${d.id}:ACEPTADO`,
        }),
      );
    });
    await this.avisar(posteriores);
    return this.detalle(id);
  }

  // ------------------------------------------------------------------
  // 4) Salidas de la custodia temporal: devolver o reasignar
  // ------------------------------------------------------------------
  async devolver(id: number, datos: DatosMovimiento, auxiliarId: number) {
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const d = await this.bloquear(mgr, id);
      this.exigir(d, 'CUSTODIA_TEMPORAL');
      if (datos.cantidad !== d.cantidad) {
        throw new BadRequestException(`La devolucion debe ser por las ${d.cantidad} unidades: no hay devoluciones parciales.`);
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
          titulo: 'Devolucion registrada',
          mensaje: `Se registro la devolucion de "${recorte(oferta.nombreProducto)}" (${d.cantidad} u.).`,
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
      d.motivoCierre = `Reasignado a la peticion ${peticionId}`;
      await this.cambiar(mgr, d, 'REASIGNADO', auxiliarId, d.motivoCierre);
      return this.asignaciones.reasignarLoteEn(mgr, d.loteId, peticionId, auxiliarId, p, posteriores);
    });
    await this.avisar(posteriores);
    return { destinoLocal: await this.detalle(id), asignacionId };
  }

  // ------------------------------------------------------------------
  // Lotes fisicos (ubicacion actual del producto)
  // ------------------------------------------------------------------
  async lotes(filtro: 'SIN_DESTINO' | 'EN_LIS' | 'TODOS' = 'EN_LIS') {
    const lista = await this.lotesRepo.find({
      where: filtro === 'TODOS' ? {} : { ubicacion: 'EN_LIS' },
      relations: { oferta: { categoria: true } },
      order: { creadoEn: 'DESC' },
    });
    if (!lista.length) return [];
    const ids = lista.map((l) => l.id);
    const [porIntento, porLocal] = await Promise.all([
      this.intentos.find({ where: { loteId: In(ids), estado: In([EstadoAsignacion.EN_CUSTODIA, EstadoAsignacion.DEVOLUCION]) } }),
      this.destinos.find({ where: { loteId: In(ids), estado: 'CUSTODIA_TEMPORAL' } }),
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
          sinDestinoDesde: l.sinDestinoDesde,
          creadoEn: l.creadoEn,
        };
      })
      .filter((l) => (filtro === 'SIN_DESTINO' ? l.sinDestino : true));
  }
}
