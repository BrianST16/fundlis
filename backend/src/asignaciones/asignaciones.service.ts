import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { UsuarioActual } from '../auth/auth.types';
import { CalendarioService } from '../calendario/calendario.service';
import {
  ASIGNACION_VIGENTE,
  EntidadHistorial,
  EstadoAsignacion,
  EstadoOferta,
  EstadoPeticion,
  TipoMovimiento,
} from '../common/enums';
import { HistorialService } from '../common/historial.service';
import { ParametrosService } from '../common/parametros.service';
import { EmparejamientoService } from '../emparejamiento/emparejamiento.service';
import { DestinoLocal, LoteFisico, Movimiento, Oferta, OfertaXPeticion, Peticion } from '../entities';
import { EvidenciasService } from '../evidencias/evidencias.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { saldoDeOferta } from '../ofertas/saldo';
import { calcularPlazo } from '../plazos/plazos';

export interface DatosMovimiento {
  cantidad: number;
  nombreContraparte: string;
  foto: { mime: string; contenidoBase64: string; nombreOriginal?: string };
  observaciones?: string;
}

/** Evento a notificar cuando la transaccion ya se confirmo. */
type Posterior = () => Promise<unknown>;

const recorte = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

@Injectable()
export class AsignacionesService {
  private readonly log = new Logger(AsignacionesService.name);

  constructor(
    @InjectRepository(OfertaXPeticion) private readonly asignaciones: Repository<OfertaXPeticion>,
    @InjectRepository(Movimiento) private readonly movimientos: Repository<Movimiento>,
    @InjectRepository(Oferta) private readonly ofertas: Repository<Oferta>,
    @InjectRepository(Peticion) private readonly peticiones: Repository<Peticion>,
    private readonly emparejamiento: EmparejamientoService,
    private readonly evidencias: EvidenciasService,
    private readonly historial: HistorialService,
    private readonly dataSource: DataSource,
    private readonly notificaciones: NotificacionesService,
    private readonly calendario: CalendarioService,
    private readonly parametros: ParametrosService,
  ) {}

  /** Ejecuta los avisos sin dejar que un fallo afecte la operacion ya confirmada. */
  private async avisar(posteriores: Posterior[]) {
    for (const p of posteriores) {
      try {
        await p();
      } catch (e: any) {
        this.log.error(`Fallo al notificar: ${e?.message}`);
      }
    }
  }

  /** Fecha limite (civil, Bogota) del intento en su estado actual. */
  async fechaLimite(a: OfertaXPeticion): Promise<string | null> {
    const [cfg, cierres] = await Promise.all([this.parametros.plazos(), this.calendario.cierres()]);
    return calcularPlazo(a, new Date(), cfg, cierres)?.fechaLimite ?? null;
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async detalle(id: number, actual: UsuarioActual) {
    const a = await this.asignaciones.findOne({
      where: { id },
      relations: {
        oferta: { categoria: true, donador: true },
        peticion: { estudiante: true },
        movimientos: true,
      },
    });
    if (!a) throw new NotFoundException('La asignacion no existe.');

    const esDonador = a.oferta?.donadorId === actual.sub;
    const esEstudiante = a.peticion?.estudianteId === actual.sub;
    if (!actual.esPersonalLis && !esDonador && !esEstudiante) {
      throw new NotFoundException('La asignacion no existe.');
    }

    const movimientos = (a.movimientos ?? [])
      .sort((x, y) => new Date(x.registradoEn).getTime() - new Date(y.registradoEn).getTime())
      .map((m) => ({
        id: m.id,
        tipo: m.tipo,
        cantidad: m.cantidad,
        nombreContraparte: actual.esPersonalLis ? m.nombreContraparte : undefined,
        // Las fotos de movimientos solo las ve el personal del LIS (H-7d).
        evidenciaId: actual.esPersonalLis ? m.evidenciaId : undefined,
        observaciones: m.observaciones,
        registradoEn: m.registradoEn,
      }));

    return {
      id: a.id,
      estado: a.estado,
      origen: a.origen,
      loteId: actual.esPersonalLis ? a.loteId : undefined,
      cantidadAsignada: a.cantidadAsignada,
      // Componentes de prioridad guardados al asignar: solo personal LIS.
      prioridad: actual.esPersonalLis
        ? {
            total: a.puntajePrioridad,
            sisben: a.puntajeSisben,
            caracterizacion: a.puntajeCaracterizacion,
            antiguedad: a.puntajeAntiguedad,
            coeficientes: a.coeficientesPrioridad,
          }
        : undefined,
      asignadaEn: a.asignadaEn,
      recibidaEn: a.recibidaEn,
      custodiaDesde: a.custodiaDesde,
      entregadaEn: a.entregadaEn,
      cerradaEn: a.cerradaEn,
      motivoCierre: a.motivoCierre,
      fechaLimite: await this.fechaLimite(a),
      oferta: {
        id: a.ofertaId,
        nombreProducto: a.oferta?.nombreProducto,
        categoria: a.oferta?.categoria?.nombre,
        donador: actual.esPersonalLis
          ? { id: a.oferta?.donadorId, nombre: a.oferta?.donador?.nombre, email: a.oferta?.donador?.email }
          : undefined,
      },
      peticion: {
        id: a.peticionId,
        descripcion: a.peticion?.descripcion,
        estudiante: actual.esPersonalLis
          ? { id: a.peticion?.estudianteId, nombre: a.peticion?.estudiante?.nombre, email: a.peticion?.estudiante?.email }
          : undefined,
      },
      movimientos,
      historial: actual.esPersonalLis ? await this.historial.de(EntidadHistorial.ASIGNACION, a.id) : undefined,
    };
  }

  /** Bandeja del LIS. Sin filtro devuelve las que siguen abiertas. */
  async listar(estados?: EstadoAsignacion[]) {
    const lista = await this.asignaciones.find({
      where: { estado: In(estados?.length ? estados : [...ASIGNACION_VIGENTE, EstadoAsignacion.DEVOLUCION]) },
      relations: { oferta: { categoria: true, donador: true }, peticion: { estudiante: true } },
      order: { asignadaEn: 'ASC' },
    });
    return lista.map((a) => ({
      id: a.id,
      estado: a.estado,
      origen: a.origen,
      loteId: a.loteId,
      cantidadAsignada: a.cantidadAsignada,
      asignadaEn: a.asignadaEn,
      recibidaEn: a.recibidaEn,
      puntajePrioridad: a.puntajePrioridad,
      producto: a.oferta?.nombreProducto,
      categoria: a.oferta?.categoria?.nombre,
      donador: { id: a.oferta?.donadorId, nombre: a.oferta?.donador?.nombre },
      estudiante: { id: a.peticion?.estudianteId, nombre: a.peticion?.estudiante?.nombre },
      ofertaId: a.ofertaId,
      peticionId: a.peticionId,
    }));
  }

  /** Lo que le concierne al usuario: sus propias asignaciones (sin datos de la otra parte). */
  async mias(actual: UsuarioActual) {
    const lista = await this.asignaciones
      .createQueryBuilder('x')
      .leftJoinAndSelect('x.oferta', 'o')
      .leftJoinAndSelect('o.categoria', 'c')
      .leftJoinAndSelect('x.peticion', 'p')
      .where('(o.donadorId = :u AND x.origen = :don) OR p.estudianteId = :u', { u: actual.sub, don: 'DONADOR' })
      .orderBy('x.asignadaEn', 'DESC')
      .getMany();
    return lista.map((a) => ({
      id: a.id,
      estado: a.estado,
      cantidadAsignada: a.cantidadAsignada,
      producto: a.oferta?.nombreProducto,
      categoria: a.oferta?.categoria?.nombre,
      asignadaEn: a.asignadaEn,
      recibidaEn: a.recibidaEn,
      entregadaEn: a.entregadaEn,
      motivoCierre: a.motivoCierre,
      miPapel: a.peticion?.estudianteId === actual.sub ? 'ESTUDIANTE' : 'DONADOR',
    }));
  }

  // ------------------------------------------------------------------
  // Asignacion desde una OFERTA (el donador debe traer el producto)
  // ------------------------------------------------------------------
  async asignar(datos: { ofertaId: number; peticionId: number; cantidad: number }, auxiliarId: number) {
    const suspendida = await this.calendario.recepcionSuspendida();
    if (suspendida) {
      throw new BadRequestException(
        `La recepcion de donaciones esta suspendida por cierre del LIS (${suspendida.desde} a ${suspendida.hasta}).`,
      );
    }
    // Componentes de prioridad (informativos, D-38): fuera de la transaccion.
    const { prioridad, coeficientes } = await this.emparejamiento.prioridadDe(datos.peticionId);

    const posteriores: Posterior[] = [];
    const id = await this.dataSource.transaction(async (mgr) => {
      const oferta = await this.bloquearOferta(mgr, datos.ofertaId);
      if (oferta.estado !== EstadoOferta.APROBADA) {
        throw new BadRequestException(`Solo se asigna desde una oferta aprobada. Esta esta en ${oferta.estado}.`);
      }
      const peticion = await this.bloquearPeticion(mgr, datos.peticionId);
      if (peticion.estado !== EstadoPeticion.APROBADA) {
        throw new BadRequestException(`Solo se asigna a una peticion aprobada. Esta esta en ${peticion.estado}.`);
      }
      if (peticion.categoriaId !== oferta.categoriaId) {
        throw new BadRequestException('La oferta y la peticion son de categorias distintas.');
      }
      this.emparejamiento.verificarCompatibilidad(oferta, peticion);

      await mgr
        .createQueryBuilder(OfertaXPeticion, 'x')
        .setLock('pessimistic_write')
        .where('x.oferta_id = :ofertaId', { ofertaId: oferta.id })
        .getMany();
      const { disponible } = await saldoDeOferta(oferta, mgr);
      if (datos.cantidad > disponible) {
        throw new BadRequestException(
          `Solo quedan ${disponible} unidades disponibles y se intentan asignar ${datos.cantidad}.`,
        );
      }
      await this.exigirPeticionLibre(mgr, peticion.id);

      const repo = mgr.getRepository(OfertaXPeticion);
      const creada = await repo.save(
        repo.create({
          ofertaId: oferta.id,
          peticionId: peticion.id,
          cantidadAsignada: datos.cantidad,
          estado: EstadoAsignacion.ASIGNADO,
          origen: 'DONADOR',
          puntajePrioridad: prioridad.total,
          puntajeSisben: prioridad.sisben,
          puntajeCaracterizacion: prioridad.caracterizacion,
          puntajeAntiguedad: prioridad.antiguedad,
          coeficientesPrioridad: coeficientes,
          asignadaPor: auxiliarId,
        }),
      );
      await this.historial.registrar(
        {
          entidad: EntidadHistorial.ASIGNACION,
          entidadId: creada.id,
          estadoAnterior: null,
          estadoNuevo: EstadoAsignacion.ASIGNADO,
          actorId: auxiliarId,
          motivo: `Asignadas ${datos.cantidad} unidades de la oferta ${oferta.id} a la peticion ${peticion.id}. Prioridad ${prioridad.total} (${coeficientes})`,
        },
        mgr,
      );

      posteriores.push(async () => {
        const limite = await this.fechaLimite(creada);
        await this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'ASIGNACION_CONFIRMADA',
          titulo: 'Tu donacion fue asignada',
          mensaje: `Tu donacion "${recorte(oferta.nombreProducto)}" (${datos.cantidad} unidades) fue asignada por el LIS. Debes llevarla al LIS a mas tardar el ${limite} (dias habiles).`,
          entidad: 'ASIGNACION',
          entidadId: creada.id,
          clave: `ASIGNACION:${creada.id}:ASIGNADO`,
        });
        await this.notificaciones.aUsuarios([peticion.estudianteId], {
          tipo: 'ASIGNACION_CONFIRMADA',
          titulo: 'Tu peticion fue emparejada',
          mensaje: `Tu peticion "${recorte(peticion.descripcion)}" fue emparejada con una donacion. Te avisaremos cuando el producto este en el LIS.`,
          entidad: 'ASIGNACION',
          entidadId: creada.id,
          clave: `ASIGNACION:${creada.id}:ASIGNADO`,
        });
      });
      return creada.id;
    });

    await this.avisar(posteriores);
    return this.detalle(id, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
  }

  // ------------------------------------------------------------------
  // Reasignacion de un LOTE que ya esta en el LIS (sin recepcion ficticia)
  // ------------------------------------------------------------------
  async reasignarLote(loteId: number, peticionId: number, auxiliarId: number) {
    const { prioridad, coeficientes } = await this.emparejamiento.prioridadDe(peticionId);
    const posteriores: Posterior[] = [];
    const id = await this.dataSource.transaction((mgr) =>
      this.reasignarLoteEn(mgr, loteId, peticionId, auxiliarId, { prioridad, coeficientes }, posteriores),
    );
    await this.avisar(posteriores);
    return this.detalle(id, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
  }

  /** Version transaccional, reutilizada por LOCAL al reasignar desde custodia temporal. */
  async reasignarLoteEn(
    mgr: EntityManager,
    loteId: number,
    peticionId: number,
    auxiliarId: number,
    p: { prioridad: { total: number; sisben: number; caracterizacion: number; antiguedad: number }; coeficientes: string },
    posteriores: Posterior[],
    /** Texto extra para el historial (p. ej. de que asignacion viene). */
    contexto?: string,
  ): Promise<number> {
    const lote = await this.bloquearLote(mgr, loteId);
    if (lote.ubicacion !== 'EN_LIS') throw new BadRequestException('El lote ya no esta en el LIS.');
    const ocupado = await mgr.getRepository(OfertaXPeticion).findOne({
      where: { loteId, estado: In([EstadoAsignacion.EN_CUSTODIA, EstadoAsignacion.DEVOLUCION]) },
    });
    if (ocupado) throw new BadRequestException(`El lote ya esta en la asignacion ${ocupado.id}.`);
    const enLocal = await mgr.getRepository(DestinoLocal).findOne({
      where: { loteId, estado: In(['CUSTODIA_TEMPORAL', 'PROPUESTO_DONADOR', 'POR_DEVOLVER']) },
    });
    if (enLocal && enLocal.estado !== 'CUSTODIA_TEMPORAL') {
      throw new BadRequestException(
        enLocal.estado === 'PROPUESTO_DONADOR'
          ? `El lote esta en propuesta al donador (LOCAL ${enLocal.id}): espera su respuesta o retira la propuesta.`
          : `El donador rechazo que quede en el LIS (LOCAL ${enLocal.id}): hay que devolverselo.`,
      );
    }

    const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: lote.ofertaId } });
    const peticion = await this.bloquearPeticion(mgr, peticionId);
    if (peticion.estado !== EstadoPeticion.APROBADA) {
      throw new BadRequestException(`Solo se asigna a una peticion aprobada. Esta esta en ${peticion.estado}.`);
    }
    if (peticion.categoriaId !== oferta.categoriaId) {
      throw new BadRequestException('El lote y la peticion son de categorias distintas.');
    }
    this.emparejamiento.verificarCompatibilidad(oferta, peticion);
    await this.exigirPeticionLibre(mgr, peticion.id);

    const ahora = new Date();
    // D-50: lo que esta en custodia temporal LOCAL se empareja directo, sin
    // esperar recepcion: el destino LOCAL se cierra en la misma transaccion.
    if (enLocal) {
      enLocal.estado = 'REASIGNADO';
      enLocal.cerradoEn = ahora;
      enLocal.motivoCierre = `Emparejado con la peticion ${peticion.id} desde custodia temporal`;
      await mgr.getRepository(DestinoLocal).save(enLocal);
      await this.historial.registrar(
        { entidad: EntidadHistorial.LOCAL, entidadId: enLocal.id, estadoAnterior: 'CUSTODIA_TEMPORAL', estadoNuevo: 'REASIGNADO', actorId: auxiliarId, motivo: enLocal.motivoCierre },
        mgr,
      );
    }
    const repo = mgr.getRepository(OfertaXPeticion);
    const creada = await repo.save(
      repo.create({
        ofertaId: lote.ofertaId,
        peticionId: peticion.id,
        cantidadAsignada: lote.cantidad,
        estado: EstadoAsignacion.EN_CUSTODIA,
        origen: 'REASIGNACION',
        loteId: lote.id,
        recibidaEn: ahora,
        custodiaDesde: ahora,
        puntajePrioridad: p.prioridad.total,
        puntajeSisben: p.prioridad.sisben,
        puntajeCaracterizacion: p.prioridad.caracterizacion,
        puntajeAntiguedad: p.prioridad.antiguedad,
        coeficientesPrioridad: p.coeficientes,
        asignadaPor: auxiliarId,
      }),
    );
    await mgr.getRepository(LoteFisico).update({ id: lote.id }, { sinDestinoDesde: null, actualizadoEn: ahora });
    await this.historial.registrar(
      {
        entidad: EntidadHistorial.ASIGNACION,
        entidadId: creada.id,
        estadoAnterior: null,
        estadoNuevo: EstadoAsignacion.EN_CUSTODIA,
        actorId: auxiliarId,
        motivo: `Reasignacion del lote ${lote.id} (${lote.cantidad} u.) que ya estaba en el LIS a la peticion ${peticion.id}${contexto ? ` ${contexto}` : ''}. Sin nueva recepcion.`,
      },
      mgr,
    );
    await this.historial.registrar(
      { entidad: EntidadHistorial.LOTE, entidadId: lote.id, estadoAnterior: enLocal ? 'CUSTODIA_LOCAL' : 'SIN_DESTINO', estadoNuevo: 'REASIGNADO', actorId: auxiliarId, motivo: `Asignacion ${creada.id}` },
      mgr,
    );

    posteriores.push(async () => {
      const limite = await this.fechaLimite(creada);
      await this.notificaciones.aUsuarios([peticion.estudianteId], {
        tipo: 'LISTO_PARA_RECOGER',
        titulo: 'Tu producto ya esta en el LIS',
        mensaje: `Tu peticion "${recorte(peticion.descripcion)}" fue atendida con un producto que ya esta en el LIS. Recogelo a mas tardar el ${limite} (dias habiles).`,
        entidad: 'ASIGNACION',
        entidadId: creada.id,
        clave: `ASIGNACION:${creada.id}:EN_CUSTODIA`,
      });
      // Correccion 6: el donador tambien se entera de que su producto, que
      // ya estaba en el LIS, tiene un nuevo beneficiario. Sin identidades (D-42).
      if (oferta?.donadorId) {
        await this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'DONACION_REASIGNADA',
          titulo: 'Tu donacion fue reasignada',
          mensaje: `Tu donacion "${recorte(oferta.nombreProducto)}" (${lote.cantidad} unidades), que ya esta bajo custodia del LIS, fue reasignada a otro beneficiario. No necesitas hacer nada.`,
          entidad: 'ASIGNACION',
          entidadId: creada.id,
          clave: `ASIGNACION:${creada.id}:REASIGNADA`,
        });
      }
    });
    return creada.id;
  }

  // ------------------------------------------------------------------
  // Reasignacion DIRECTA de un producto que esta EN_CUSTODIA (correccion 6)
  // ------------------------------------------------------------------
  /**
   * El producto ya esta fisicamente en el LIS: NO se repite la recepcion.
   * En UNA sola transaccion:
   *  1. se cancela el intento actual (la peticion original se cierra por
   *     incumplimiento, D-16) y el lote queda momentaneamente sin destino;
   *  2. se crea el intento nuevo directamente EN_CUSTODIA sobre el mismo
   *     lote (reasignarLoteEn), sin movimiento ni foto nuevos;
   *  3. todo queda en HISTORIAL_ESTADO (intento viejo, intento nuevo, lote).
   * Si algo falla (p. ej. la peticion destino no es compatible), no se
   * cancela nada. Se avisa al estudiante original, al nuevo y al donador.
   */
  async reasignarDesdeCustodia(id: number, peticionId: number, motivo: string, auxiliarId: number) {
    const { prioridad, coeficientes } = await this.emparejamiento.prioridadDe(peticionId);
    const posteriores: Posterior[] = [];
    const nuevaId = await this.dataSource.transaction(async (mgr) => {
      const a = await this.bloquearAsignacion(mgr, id);
      if (a.estado !== EstadoAsignacion.EN_CUSTODIA || !a.loteId) {
        throw new BadRequestException(
          `Solo se reasigna directamente un producto EN_CUSTODIA (ya recibido en el LIS). Esta asignacion esta en ${a.estado}.`,
        );
      }
      if (a.peticionId === peticionId) {
        throw new BadRequestException('Elige una peticion distinta de la que ya tiene el producto.');
      }
      const loteId = a.loteId;

      const cancelado = (await this.cancelar(a.id, `Reasignacion: ${motivo}`, auxiliarId, mgr, {
        paraReasignar: true,
      })) as { id: number; posteriores: Posterior[] };
      posteriores.push(...cancelado.posteriores);

      const nueva = await this.reasignarLoteEn(
        mgr,
        loteId,
        peticionId,
        auxiliarId,
        { prioridad, coeficientes },
        posteriores,
        `desde la asignacion ${a.id} (EN_CUSTODIA)`,
      );
      await this.historial.registrar(
        {
          entidad: EntidadHistorial.ASIGNACION,
          entidadId: a.id,
          estadoAnterior: EstadoAsignacion.CANCELADO,
          estadoNuevo: 'REASIGNADA',
          actorId: auxiliarId,
          motivo: `Producto reasignado a la asignacion ${nueva} (peticion ${peticionId}) sin nueva recepcion: ${motivo}`,
        },
        mgr,
      );
      return nueva;
    });

    await this.avisar(posteriores);
    return this.detalle(nuevaId, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
  }

  // ------------------------------------------------------------------
  // Recepcion fisica: crea el LOTE
  // ------------------------------------------------------------------
  async registrarRecepcion(id: number, datos: DatosMovimiento, auxiliarId: number) {
    const posteriores: Posterior[] = [];
    const resultado = await this.dataSource.transaction(async (mgr) => {
      const a = await this.bloquearAsignacion(mgr, id);
      if (a.estado !== EstadoAsignacion.ASIGNADO) {
        throw new BadRequestException(`Solo se recibe una asignacion en estado ASIGNADO. Esta esta en ${a.estado}.`);
      }
      if (datos.cantidad > a.cantidadAsignada) {
        throw new BadRequestException(
          `Se asignaron ${a.cantidadAsignada} unidades y se intentan recibir ${datos.cantidad}.`,
        );
      }

      const evidencia = await this.evidencias.guardar(
        { mime: datos.foto.mime, contenidoBase64: datos.foto.contenidoBase64, nombreOriginal: datos.foto.nombreOriginal },
        auxiliarId,
        mgr,
      );
      const repoMov = mgr.getRepository(Movimiento);
      const mov = await repoMov.save(
        repoMov.create({
          ofertaXPeticionId: a.id,
          tipo: TipoMovimiento.RECEPCION,
          cantidad: datos.cantidad,
          nombreContraparte: datos.nombreContraparte,
          evidenciaId: evidencia.id,
          observaciones: datos.observaciones ?? null,
          registradoPor: auxiliarId,
        }),
      );

      const repoA = mgr.getRepository(OfertaXPeticion);
      const repoLote = mgr.getRepository(LoteFisico);
      const original = await mgr.getRepository(Oferta).findOne({ where: { id: a.ofertaId } });
      const peticion = await mgr.getRepository(Peticion).findOne({ where: { id: a.peticionId } });
      const ahora = new Date();
      a.recibidaEn = ahora;
      let ofertaNueva: number | null = null;

      if (datos.cantidad === a.cantidadAsignada) {
        const lote = await repoLote.save(
          repoLote.create({
            ofertaId: a.ofertaId,
            cantidad: datos.cantidad,
            ubicacion: 'EN_LIS',
            origen: 'RECEPCION_ASIGNACION',
            intentoOrigenId: a.id,
            recepcionMovimientoId: mov.id,
          }),
        );
        await repoMov.update({ id: mov.id }, { loteId: lote.id });
        a.estado = EstadoAsignacion.EN_CUSTODIA;
        a.loteId = lote.id;
        a.custodiaDesde = ahora;
        await repoA.save(a);
        await this.historial.registrar(
          {
            entidad: EntidadHistorial.ASIGNACION,
            entidadId: a.id,
            estadoAnterior: EstadoAsignacion.ASIGNADO,
            estadoNuevo: EstadoAsignacion.EN_CUSTODIA,
            actorId: auxiliarId,
            motivo: `Recibidas ${datos.cantidad} unidades (lote ${lote.id})`,
          },
          mgr,
        );
        posteriores.push(async () => {
          const limite = await this.fechaLimite(a);
          await this.notificaciones.aUsuarios([peticion.estudianteId], {
            tipo: 'LISTO_PARA_RECOGER',
            titulo: 'Tu producto ya esta en el LIS',
            mensaje: `El producto de tu peticion "${recorte(peticion.descripcion)}" ya esta en el LIS. Recogelo a mas tardar el ${limite} (dias habiles).`,
            entidad: 'ASIGNACION',
            entidadId: a.id,
            clave: `ASIGNACION:${a.id}:EN_CUSTODIA`,
          });
          await this.notificaciones.aUsuarios([original.donadorId], {
            tipo: 'RECEPCION_REGISTRADA',
            titulo: 'Recibimos tu donacion',
            mensaje: `El LIS recibio tu donacion "${recorte(original.nombreProducto)}" (${datos.cantidad} unidades). Gracias.`,
            entidad: 'ASIGNACION',
            entidadId: a.id,
            clave: `ASIGNACION:${a.id}:EN_CUSTODIA`,
          });
        });
      } else {
        // D-18: no hay recepcion parcial. Se cancela el intento y lo recibido
        // queda como una oferta generada (FALTANTE) cuyo lote ya esta en el LIS.
        const motivo = `Recepcion incompleta: llegaron ${datos.cantidad} de ${a.cantidadAsignada} unidades`;
        a.estado = EstadoAsignacion.CANCELADO;
        a.cerradaEn = ahora;
        a.motivoCierre = motivo;
        await repoA.save(a);
        await this.historial.registrar(
          { entidad: EntidadHistorial.ASIGNACION, entidadId: a.id, estadoAnterior: EstadoAsignacion.ASIGNADO, estadoNuevo: EstadoAsignacion.CANCELADO, actorId: auxiliarId, motivo },
          mgr,
        );

        const repoOferta = mgr.getRepository(Oferta);
        const generada = await repoOferta.save(
          repoOferta.create({
            donadorId: original.donadorId,
            categoriaId: original.categoriaId,
            nombreProducto: original.nombreProducto,
            descripcion: `${original.descripcion}\n\n[Generada automaticamente por recepcion incompleta de la oferta ${original.id}]`,
            cantidad: datos.cantidad,
            estado: EstadoOferta.APROBADA,
            fotoId: original.fotoId,
            estadoConservacion: original.estadoConservacion,
            medida: original.medida,
            origen: 'FALTANTE',
            ofertaOrigenId: original.id,
            revisadaPor: auxiliarId,
            revisadaEn: ahora,
          }),
        );
        ofertaNueva = generada.id;
        const lote = await repoLote.save(
          repoLote.create({
            ofertaId: generada.id,
            cantidad: datos.cantidad,
            ubicacion: 'EN_LIS',
            origen: 'RECEPCION_INCOMPLETA',
            intentoOrigenId: a.id,
            recepcionMovimientoId: mov.id,
            sinDestinoDesde: ahora,
          }),
        );
        await repoMov.update({ id: mov.id }, { loteId: lote.id });
        await this.historial.registrar(
          { entidad: EntidadHistorial.OFERTA, entidadId: generada.id, estadoAnterior: null, estadoNuevo: EstadoOferta.APROBADA, actorId: auxiliarId, motivo: `Generada por recepcion incompleta de la oferta ${original.id} (asignacion ${a.id}); lote ${lote.id} en el LIS` },
          mgr,
        );
        // La peticion vuelve a estar disponible con su fecha original (D-15).
        posteriores.push(async () => {
          await this.notificaciones.aUsuarios([original.donadorId], {
            tipo: 'RECEPCION_INCOMPLETA',
            titulo: 'Recepcion incompleta de tu donacion',
            mensaje: `El LIS recibio ${datos.cantidad} de ${a.cantidadAsignada} unidades de "${recorte(original.nombreProducto)}". El compromiso se cerro y las unidades recibidas quedan bajo custodia del LIS.`,
            entidad: 'ASIGNACION',
            entidadId: a.id,
            clave: `ASIGNACION:${a.id}:INCOMPLETA`,
          });
          await this.notificaciones.aUsuarios([peticion.estudianteId], {
            tipo: 'ASIGNACION_CANCELADA',
            titulo: 'Tu peticion vuelve a estar disponible',
            mensaje: `La donacion asignada a tu peticion "${recorte(peticion.descripcion)}" no llego completa. Tu peticion vuelve al catalogo conservando su fecha original.`,
            entidad: 'PETICION',
            entidadId: peticion.id,
            clave: `ASIGNACION:${a.id}:INCOMPLETA`,
          });
          await this.notificaciones.aPersonalLis({
            tipo: 'LOTE_SIN_DESTINO',
            titulo: 'Lote sin destino por recepcion incompleta',
            mensaje: `La asignacion ${a.id} se cancelo por recepcion incompleta. Hay ${datos.cantidad} unidades en un lote sin destino (oferta generada ${generada.id}).`,
            entidad: 'ASIGNACION',
            entidadId: a.id,
            clave: `ASIGNACION:${a.id}:INCOMPLETA`,
          });
        });
      }
      return { id: a.id, ofertaNueva };
    });

    await this.avisar(posteriores);
    const detalle = await this.detalle(resultado.id, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
    return { ...detalle, ofertaGeneradaPorFaltante: resultado.ofertaNueva };
  }

  // ------------------------------------------------------------------
  // Entrega al estudiante
  // ------------------------------------------------------------------
  async registrarEntrega(id: number, datos: DatosMovimiento, auxiliarId: number) {
    const posteriores: Posterior[] = [];
    const idFinal = await this.dataSource.transaction(async (mgr) => {
      const a = await this.bloquearAsignacion(mgr, id);
      if (a.estado !== EstadoAsignacion.EN_CUSTODIA) {
        throw new BadRequestException(`Solo se entrega lo que esta EN_CUSTODIA. Esta asignacion esta en ${a.estado}.`);
      }
      if (datos.cantidad !== a.cantidadAsignada) {
        throw new BadRequestException(
          `La entrega debe ser por las ${a.cantidadAsignada} unidades asignadas: no hay entregas parciales.`,
        );
      }
      const evidencia = await this.evidencias.guardar(
        { mime: datos.foto.mime, contenidoBase64: datos.foto.contenidoBase64, nombreOriginal: datos.foto.nombreOriginal },
        auxiliarId,
        mgr,
      );
      const repoMov = mgr.getRepository(Movimiento);
      await repoMov.save(
        repoMov.create({
          ofertaXPeticionId: a.id,
          loteId: a.loteId,
          tipo: TipoMovimiento.ENTREGA,
          cantidad: datos.cantidad,
          nombreContraparte: datos.nombreContraparte,
          evidenciaId: evidencia.id,
          observaciones: datos.observaciones ?? null,
          registradoPor: auxiliarId,
        }),
      );
      const ahora = new Date();
      a.estado = EstadoAsignacion.ENTREGADO;
      a.entregadaEn = ahora;
      a.cerradaEn = ahora;
      a.motivoCierre = 'Entregada al estudiante';
      await mgr.getRepository(OfertaXPeticion).save(a);
      if (a.loteId) {
        await mgr.getRepository(LoteFisico).update({ id: a.loteId }, { ubicacion: 'ENTREGADO', actualizadoEn: ahora });
      }
      await this.historial.registrar(
        { entidad: EntidadHistorial.ASIGNACION, entidadId: a.id, estadoAnterior: EstadoAsignacion.EN_CUSTODIA, estadoNuevo: EstadoAsignacion.ENTREGADO, actorId: auxiliarId, motivo: `Entregadas ${datos.cantidad} unidades` },
        mgr,
      );
      await this.cerrarPeticion(mgr, a.peticionId, EstadoPeticion.CERRADA_ENTREGA, 'Producto entregado al estudiante', auxiliarId);

      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: a.ofertaId } });
      const peticion = await mgr.getRepository(Peticion).findOne({ where: { id: a.peticionId } });
      posteriores.push(async () => {
        await this.notificaciones.aUsuarios([peticion.estudianteId], {
          tipo: 'ENTREGA_REGISTRADA',
          titulo: 'Entrega registrada',
          mensaje: `Se registro la entrega de "${recorte(oferta.nombreProducto)}". Tu peticion quedo cerrada por entrega.`,
          entidad: 'ASIGNACION',
          entidadId: a.id,
          clave: `ASIGNACION:${a.id}:ENTREGADO`,
        });
        // Correccion 9 / D-51: el donador recibe la FOTO de la entrega por la
        // bandeja interna (no por correo). Tambien cuando el producto llego
        // por reasignacion o desde LOCAL: sigue siendo su donacion.
        await this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'ENTREGA_REGISTRADA',
          titulo: 'Tu donacion llego a su destino',
          mensaje: `Tu donacion "${recorte(oferta.nombreProducto)}" (${datos.cantidad} u.) fue entregada a un estudiante. Adjuntamos la foto de la entrega. Gracias por tu aporte.`,
          entidad: 'ASIGNACION',
          entidadId: a.id,
          clave: `ASIGNACION:${a.id}:ENTREGADO`,
          evidenciaId: evidencia.id,
          soloBandeja: true,
        });
      });
      return a.id;
    });
    await this.avisar(posteriores);
    return this.detalle(idFinal, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
  }

  // ------------------------------------------------------------------
  // Cancelacion y devolucion
  // ------------------------------------------------------------------

  /**
   * Cancela un intento vigente.
   *  - Desde ASIGNADO (el donador no llevo el producto): se liberan las
   *    unidades y la peticion vuelve con su fecha original (D-15).
   *  - Desde EN_CUSTODIA (el estudiante no recogio): la peticion se cierra
   *    por incumplimiento (D-16) y el LOTE queda en el LIS SIN DESTINO, para
   *    reasignarlo, pasarlo a custodia LOCAL o devolverlo.
   */
  async cancelar(
    id: number,
    motivo: string,
    auxiliarId: number,
    mgrExterno?: EntityManager,
    /** paraReasignar: el lote se reasigna en la misma transaccion, asi que
     *  no se avisa al LIS de un "lote sin destino" que no lo estara. */
    opciones: { paraReasignar?: boolean } = {},
  ) {
    const posteriores: Posterior[] = [];
    const ejecutar = async (mgr: EntityManager) => {
      const a = await this.bloquearAsignacion(mgr, id);
      if (!ASIGNACION_VIGENTE.includes(a.estado)) {
        throw new BadRequestException(`Solo se cancela una asignacion vigente. Esta esta en ${a.estado}.`);
      }
      const anterior = a.estado;
      const ahora = new Date();
      a.estado = EstadoAsignacion.CANCELADO;
      a.cerradaEn = ahora;
      a.motivoCierre = motivo;
      await mgr.getRepository(OfertaXPeticion).save(a);
      await this.historial.registrar(
        { entidad: EntidadHistorial.ASIGNACION, entidadId: a.id, estadoAnterior: anterior, estadoNuevo: EstadoAsignacion.CANCELADO, actorId: auxiliarId, motivo },
        mgr,
      );
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: a.ofertaId } });
      const peticion = await mgr.getRepository(Peticion).findOne({ where: { id: a.peticionId } });

      if (anterior === EstadoAsignacion.EN_CUSTODIA) {
        await this.cerrarPeticion(mgr, a.peticionId, EstadoPeticion.CERRADA_INCUMPLIMIENTO, `El estudiante no recogio el producto: ${motivo}`, auxiliarId);
        if (a.loteId) {
          await mgr.getRepository(LoteFisico).update({ id: a.loteId }, { sinDestinoDesde: ahora, actualizadoEn: ahora });
          await this.historial.registrar(
            { entidad: EntidadHistorial.LOTE, entidadId: a.loteId, estadoAnterior: 'EN_CUSTODIA', estadoNuevo: 'SIN_DESTINO', actorId: auxiliarId, motivo: `Asignacion ${a.id} cancelada` },
            mgr,
          );
        }
        posteriores.push(async () => {
          await this.notificaciones.aUsuarios([peticion.estudianteId], {
            tipo: 'ASIGNACION_CANCELADA',
            titulo: 'Asignacion cancelada por no recoger',
            mensaje: `La asignacion de tu peticion "${recorte(peticion.descripcion)}" se cancelo porque el producto no se recogio a tiempo. La peticion quedo cerrada por incumplimiento.`,
            entidad: 'ASIGNACION',
            entidadId: a.id,
            clave: `ASIGNACION:${a.id}:CANCELADO`,
          });
          if (opciones.paraReasignar) return;
          await this.notificaciones.aPersonalLis({
            tipo: 'LOTE_SIN_DESTINO',
            titulo: 'Lote sin destino',
            mensaje: `La asignacion ${a.id} se cancelo. El lote ${a.loteId} queda en el LIS sin destino: reasignar, custodia LOCAL o devolucion.`,
            entidad: 'ASIGNACION',
            entidadId: a.id,
            clave: `ASIGNACION:${a.id}:CANCELADO`,
          });
        });
      } else {
        await this.historial.registrar(
          { entidad: EntidadHistorial.PETICION, entidadId: a.peticionId, estadoAnterior: EstadoPeticion.APROBADA, estadoNuevo: EstadoPeticion.APROBADA, actorId: auxiliarId, motivo: `Asignacion ${a.id} cancelada antes de la recepcion: la peticion vuelve a estar disponible con su fecha original` },
          mgr,
        );
        posteriores.push(async () => {
          await this.notificaciones.aUsuarios([oferta.donadorId], {
            tipo: 'ASIGNACION_CANCELADA',
            titulo: 'Compromiso de entrega cancelado',
            mensaje: `El LIS cancelo el compromiso de entrega de "${recorte(oferta.nombreProducto)}". Motivo: ${recorte(motivo, 200)}`,
            entidad: 'ASIGNACION',
            entidadId: a.id,
            clave: `ASIGNACION:${a.id}:CANCELADO`,
          });
          await this.notificaciones.aUsuarios([peticion.estudianteId], {
            tipo: 'ASIGNACION_CANCELADA',
            titulo: 'Tu peticion vuelve a estar disponible',
            mensaje: `La donacion asignada a tu peticion "${recorte(peticion.descripcion)}" no llego. Tu peticion vuelve al catalogo conservando su fecha original.`,
            entidad: 'PETICION',
            entidadId: peticion.id,
            clave: `ASIGNACION:${a.id}:CANCELADO`,
          });
        });
      }
      return a.id;
    };

    const idFinal = mgrExterno ? await ejecutar(mgrExterno) : await this.dataSource.transaction(ejecutar);
    if (mgrExterno) return { id: idFinal, posteriores };
    await this.avisar(posteriores);
    return this.detalle(idFinal, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
  }

  /** Marca el producto en custodia como destinado a devolucion al donador. */
  async marcarParaDevolucion(id: number, motivo: string, auxiliarId: number) {
    const posteriores: Posterior[] = [];
    const idFinal = await this.dataSource.transaction(async (mgr) => {
      const a = await this.bloquearAsignacion(mgr, id);
      if (a.estado !== EstadoAsignacion.EN_CUSTODIA) {
        throw new BadRequestException(`Solo pasa a devolucion lo que esta EN_CUSTODIA. Esta asignacion esta en ${a.estado}.`);
      }
      a.estado = EstadoAsignacion.DEVOLUCION;
      a.cerradaEn = new Date();
      a.motivoCierre = motivo;
      await mgr.getRepository(OfertaXPeticion).save(a);
      await this.historial.registrar(
        { entidad: EntidadHistorial.ASIGNACION, entidadId: a.id, estadoAnterior: EstadoAsignacion.EN_CUSTODIA, estadoNuevo: EstadoAsignacion.DEVOLUCION, actorId: auxiliarId, motivo },
        mgr,
      );
      await this.cerrarPeticion(mgr, a.peticionId, EstadoPeticion.CERRADA_INCUMPLIMIENTO, `Producto destinado a devolucion: ${motivo}`, auxiliarId);
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: a.ofertaId } });
      const peticion = await mgr.getRepository(Peticion).findOne({ where: { id: a.peticionId } });
      posteriores.push(async () => {
        await this.notificaciones.aUsuarios([oferta.donadorId], {
          tipo: 'DEVOLUCION_INICIADA',
          titulo: 'Tu donacion sera devuelta',
          mensaje: `El LIS inicio la devolucion de "${recorte(oferta.nombreProducto)}". El personal del LIS te contactara para coordinar el retiro.`,
          entidad: 'ASIGNACION',
          entidadId: a.id,
          clave: `ASIGNACION:${a.id}:DEVOLUCION`,
        });
        await this.notificaciones.aUsuarios([peticion.estudianteId], {
          tipo: 'ASIGNACION_CANCELADA',
          titulo: 'Tu peticion quedo cerrada',
          mensaje: `La asignacion de tu peticion "${recorte(peticion.descripcion)}" se cerro sin entrega.`,
          entidad: 'ASIGNACION',
          entidadId: a.id,
          clave: `ASIGNACION:${a.id}:DEVOLUCION`,
        });
      });
      return a.id;
    });
    await this.avisar(posteriores);
    return this.detalle(idFinal, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
  }

  /** Salida fisica del producto devuelto al donador. Exige fotografia. */
  async registrarDevolucion(id: number, datos: DatosMovimiento, auxiliarId: number) {
    const idFinal = await this.dataSource.transaction(async (mgr) => {
      const a = await this.bloquearAsignacion(mgr, id);
      if (a.estado !== EstadoAsignacion.DEVOLUCION) {
        throw new BadRequestException(
          `Solo se registra la devolucion de una asignacion en estado DEVOLUCION. Esta esta en ${a.estado}.`,
        );
      }
      const yaDevuelta = await mgr.getRepository(Movimiento).findOne({
        where: { ofertaXPeticionId: a.id, tipo: TipoMovimiento.DEVOLUCION },
      });
      if (yaDevuelta) throw new BadRequestException('Esta devolucion ya fue registrada.');
      // No hay movimientos parciales de una misma asignacion (D-14).
      if (datos.cantidad !== a.cantidadAsignada) {
        throw new BadRequestException(
          `La devolucion debe ser por las ${a.cantidadAsignada} unidades de la asignacion: no hay devoluciones parciales.`,
        );
      }
      const evidencia = await this.evidencias.guardar(
        { mime: datos.foto.mime, contenidoBase64: datos.foto.contenidoBase64, nombreOriginal: datos.foto.nombreOriginal },
        auxiliarId,
        mgr,
      );
      const repoMov = mgr.getRepository(Movimiento);
      await repoMov.save(
        repoMov.create({
          ofertaXPeticionId: a.id,
          loteId: a.loteId,
          tipo: TipoMovimiento.DEVOLUCION,
          cantidad: datos.cantidad,
          nombreContraparte: datos.nombreContraparte,
          evidenciaId: evidencia.id,
          observaciones: datos.observaciones ?? null,
          registradoPor: auxiliarId,
        }),
      );
      if (a.loteId) {
        await mgr.getRepository(LoteFisico).update({ id: a.loteId }, { ubicacion: 'DEVUELTO', actualizadoEn: new Date() });
      }
      await this.historial.registrar(
        { entidad: EntidadHistorial.ASIGNACION, entidadId: a.id, estadoAnterior: EstadoAsignacion.DEVOLUCION, estadoNuevo: EstadoAsignacion.DEVOLUCION, actorId: auxiliarId, motivo: `Devueltas ${datos.cantidad} unidades (salida fisica registrada)` },
        mgr,
      );
      return a.id;
    });
    return this.detalle(idFinal, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
  }

  // ------------------------------------------------------------------
  // Prorrogas (resolucion de tareas DEFINIR_ESTADO)
  // ------------------------------------------------------------------
  async prorrogar(id: number, tipo: 'APLAZAR' | 'EXTENDER', motivo: string, auxiliarId: number) {
    const cfg = {
      diasAplazamiento: await this.parametros.numero('PLAZO_APLAZAMIENTO_DONADOR_DIAS_HABILES', 5),
      maxAplazamientos: await this.parametros.numero('MAX_APLAZAMIENTOS_DONADOR', 1),
      diasExtension: await this.parametros.numero('PLAZO_EXTENSION_ESTUDIANTE_DIAS_HABILES', 3),
      maxExtensiones: await this.parametros.numero('MAX_EXTENSIONES_ESTUDIANTE', 1),
    };
    const posteriores: Posterior[] = [];
    await this.dataSource.transaction(async (mgr) => {
      const a = await this.bloquearAsignacion(mgr, id);
      const esperado = tipo === 'APLAZAR' ? EstadoAsignacion.ASIGNADO : EstadoAsignacion.EN_CUSTODIA;
      if (a.estado !== esperado) {
        throw new BadRequestException(
          tipo === 'APLAZAR'
            ? 'Solo se aplaza el plazo del donador mientras la asignacion esta ASIGNADA.'
            : 'Solo se extiende el plazo de recogida mientras el producto esta EN_CUSTODIA.',
        );
      }
      const max = tipo === 'APLAZAR' ? cfg.maxAplazamientos : cfg.maxExtensiones;
      if (a.aplazamientos >= max) {
        throw new BadRequestException(`Ya se uso el maximo de ${max} prorroga(s) para este plazo.`);
      }
      const dias = tipo === 'APLAZAR' ? cfg.diasAplazamiento : cfg.diasExtension;
      // [PROP] Si el plazo YA vencio, la prorroga da N dias habiles contados
      // desde la decision (se compensa el retraso); si no ha vencido, suma N
      // dias al limite vigente.
      const [plazos, cierres] = await Promise.all([this.parametros.plazos(), this.calendario.cierres()]);
      const actual = calcularPlazo(a, new Date(), plazos, cierres);
      const retraso = actual && actual.diasHabilesRestantes < 0 ? -actual.diasHabilesRestantes : 0;
      a.diasExtra += dias + retraso;
      a.aplazamientos += 1;
      await mgr.getRepository(OfertaXPeticion).save(a);
      await this.historial.registrar(
        { entidad: EntidadHistorial.ASIGNACION, entidadId: a.id, estadoAnterior: a.estado, estadoNuevo: a.estado, actorId: auxiliarId, motivo: `${tipo === 'APLAZAR' ? 'Aplazamiento del donador' : 'Extension de recogida'}: +${dias} dias habiles. ${motivo}` },
        mgr,
      );
      const oferta = await mgr.getRepository(Oferta).findOne({ where: { id: a.ofertaId } });
      const peticion = await mgr.getRepository(Peticion).findOne({ where: { id: a.peticionId } });
      posteriores.push(async () => {
        const limite = await this.fechaLimite(a);
        const destinatario = tipo === 'APLAZAR' ? oferta.donadorId : peticion.estudianteId;
        await this.notificaciones.aUsuarios([destinatario], {
          tipo: 'PLAZO_PRORROGADO',
          titulo: tipo === 'APLAZAR' ? 'Se aplazo tu plazo de entrega' : 'Se extendio tu plazo de recogida',
          mensaje: `${tipo === 'APLAZAR' ? `Tu plazo para llevar "${recorte(oferta.nombreProducto)}" al LIS` : `Tu plazo para recoger "${recorte(oferta.nombreProducto)}"`} ahora vence el ${limite}.`,
          entidad: 'ASIGNACION',
          entidadId: a.id,
          clave: `ASIGNACION:${a.id}:PRORROGA:${a.aplazamientos}`,
        });
      });
    });
    await this.avisar(posteriores);
    return this.detalle(id, { sub: auxiliarId, esPersonalLis: true } as UsuarioActual);
  }

  // ------------------------------------------------------------------
  // Auxiliares privados
  // ------------------------------------------------------------------

  private async exigirPeticionLibre(mgr: EntityManager, peticionId: number) {
    const vigente = await mgr
      .createQueryBuilder(OfertaXPeticion, 'x')
      .setLock('pessimistic_write')
      .where('x.peticion_id = :peticionId', { peticionId })
      .andWhere('x.estado IN (:...estados)', { estados: ASIGNACION_VIGENTE })
      .getOne();
    if (vigente) {
      throw new BadRequestException(`La peticion ya tiene una asignacion vigente (la numero ${vigente.id}).`);
    }
  }

  /** Bloqueo en orden fijo: 1) oferta. */
  private async bloquearOferta(mgr: EntityManager, ofertaId: number): Promise<Oferta> {
    const oferta = await mgr.createQueryBuilder(Oferta, 'o').setLock('pessimistic_write').where('o.id = :id', { id: ofertaId }).getOne();
    if (!oferta) throw new NotFoundException('La oferta no existe.');
    return oferta;
  }

  /** Bloqueo en orden fijo: 2) peticion. */
  private async bloquearPeticion(mgr: EntityManager, peticionId: number): Promise<Peticion> {
    const peticion = await mgr.createQueryBuilder(Peticion, 'p').setLock('pessimistic_write').where('p.id = :id', { id: peticionId }).getOne();
    if (!peticion) throw new NotFoundException('La peticion no existe.');
    return peticion;
  }

  async bloquearLote(mgr: EntityManager, loteId: number): Promise<LoteFisico> {
    const lote = await mgr.createQueryBuilder(LoteFisico, 'l').setLock('pessimistic_write').where('l.id = :id', { id: loteId }).getOne();
    if (!lote) throw new NotFoundException('El lote no existe.');
    return lote;
  }

  private async bloquearAsignacion(mgr: EntityManager, id: number): Promise<OfertaXPeticion> {
    const a = await mgr.createQueryBuilder(OfertaXPeticion, 'x').setLock('pessimistic_write').where('x.id = :id', { id }).getOne();
    if (!a) throw new NotFoundException('La asignacion no existe.');
    return a;
  }

  private async cerrarPeticion(mgr: EntityManager, peticionId: number, estado: EstadoPeticion, motivo: string, actorId: number) {
    const repo = mgr.getRepository(Peticion);
    const p = await repo.findOne({ where: { id: peticionId } });
    if (!p) return;
    const anterior = p.estado;
    p.estado = estado;
    p.cerradaEn = new Date();
    p.motivoCierre = motivo;
    await repo.save(p);
    await this.historial.registrar(
      { entidad: EntidadHistorial.PETICION, entidadId: peticionId, estadoAnterior: anterior, estadoNuevo: estado, actorId, motivo },
      mgr,
    );
  }
}
