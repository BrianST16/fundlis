import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { CategoriasService } from '../categorias/categorias.service';
import { CalendarioService } from '../calendario/calendario.service';
import { EntidadHistorial, EstadoOferta } from '../common/enums';
import { HistorialService } from '../common/historial.service';
import { ESTADOS_CONSERVACION } from '../emparejamiento/compatibilidad';
import { DestinoLocal, Evidencia, LoteFisico, Movimiento, Oferta, OfertaXPeticion } from '../entities';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { SaldoOferta, saldoDeOferta } from './saldo';

export type { SaldoOferta } from './saldo';

@Injectable()
export class OfertasService {
  constructor(
    @InjectRepository(Oferta) private readonly ofertas: Repository<Oferta>,
    @InjectRepository(OfertaXPeticion) private readonly asignaciones: Repository<OfertaXPeticion>,
    @InjectRepository(Evidencia) private readonly evidencias: Repository<Evidencia>,
    @InjectRepository(Movimiento) private readonly movimientos: Repository<Movimiento>,
    @InjectRepository(DestinoLocal) private readonly destinos: Repository<DestinoLocal>,
    @InjectRepository(LoteFisico) private readonly lotes: Repository<LoteFisico>,
    private readonly categorias: CategoriasService,
    private readonly historial: HistorialService,
    private readonly notificaciones: NotificacionesService,
    private readonly calendario: CalendarioService,
  ) {}

  /**
   * Cantidades derivadas, nunca almacenadas (3FN): una sola fuente de
   * verdad, que son los intentos de asignacion. Ver ./saldo.ts.
   */
  async saldo(ofertaId: number): Promise<SaldoOferta> {
    const oferta = await this.ofertas.findOne({ where: { id: ofertaId } });
    if (!oferta) throw new NotFoundException('La oferta no existe.');
    return this.saldoDe(oferta);
  }

  private async saldoDe(oferta: Oferta): Promise<SaldoOferta> {
    return saldoDeOferta(oferta, { intentos: this.asignaciones, destinos: this.destinos, lotes: this.lotes });
  }

  /**
   * La foto de una oferta debe ser una evidencia que subio el mismo
   * donador y que no este ligada a otro registro. Sin esta comprobacion un
   * donador podia "adoptar" el id de cualquier foto (por ejemplo, la de la
   * entrega a un estudiante) y verla como si fuera suya (hallazgo R3-b).
   */
  private async validarFoto(fotoId: number, donadorId: number, ofertaId?: number): Promise<void> {
    const evidencia = await this.evidencias.findOne({ where: { id: fotoId } });
    if (!evidencia) {
      throw new BadRequestException('La fotografía indicada no existe.');
    }
    if (evidencia.subidaPor !== donadorId) {
      throw new ForbiddenException('Solo puedes usar fotografias que hayas subido tu.');
    }
    const enMovimiento = await this.movimientos.count({ where: { evidenciaId: fotoId } });
    if (enMovimiento > 0) {
      throw new BadRequestException('Esa fotografía ya es evidencia de un movimiento físico.');
    }
    const enOtraOferta = await this.ofertas.count({
      where: ofertaId ? { fotoId, id: Not(ofertaId) } : { fotoId },
    });
    if (enOtraOferta > 0) {
      throw new BadRequestException('Esa fotografía ya está asociada a otra oferta.');
    }
  }

  /** Vista anonima: sin donador, sin contacto. */
  private async aCatalogo(oferta: Oferta) {
    const saldo = await this.saldoDe(oferta);
    return {
      id: oferta.id,
      nombreProducto: oferta.nombreProducto,
      descripcion: oferta.descripcion,
      categoria: oferta.categoria
        ? { id: oferta.categoria.id, nombre: oferta.categoria.nombre }
        : { id: oferta.categoriaId, nombre: null },
      cantidadDisponible: saldo.disponible,
      cantidadOfertada: saldo.ofertada,
      fotoId: oferta.fotoId,
      publicadaEn: oferta.creadaEn,
      // Atributos de compatibilidad: describen el producto, no a personas.
      estadoConservacion: oferta.estadoConservacion,
      estadoConservacionTexto: ESTADOS_CONSERVACION[oferta.estadoConservacion] ?? null,
      medida: oferta.medida,
      medidaNombre: oferta.categoria?.medidaNombre ?? null,
    };
  }

  /** Vista completa: solo para el donador dueno y el personal del LIS. */
  private async aDetalle(oferta: Oferta, incluirDonador: boolean) {
    const base = await this.aCatalogo(oferta);
    return {
      ...base,
      estado: oferta.estado,
      motivoRechazo: oferta.motivoRechazo,
      revisadaEn: oferta.revisadaEn,
      actualizadaEn: oferta.actualizadaEn,
      saldo: await this.saldoDe(oferta),
      donador: incluirDonador && oferta.donador
        ? { id: oferta.donador.id, nombre: oferta.donador.nombre, email: oferta.donador.email }
        : undefined,
    };
  }

  /** Catalogo publico: solo ofertas aprobadas con unidades disponibles.
   *  D-64 (C2): las de cuentas bloqueadas quedan en pausa (no se muestran ni se emparejan). */
  async catalogo(categoriaId?: number) {
    const lista = await this.ofertas.find({
      where: categoriaId
        ? { estado: EstadoOferta.APROBADA, categoriaId, donador: { activo: true } }
        : { estado: EstadoOferta.APROBADA, donador: { activo: true } },
      relations: { categoria: true },
      order: { creadaEn: 'DESC' },
    });
    const conSaldo = await Promise.all(lista.map((o) => this.aCatalogo(o)));
    return conSaldo.filter((o) => o.cantidadDisponible > 0);
  }

  async mias(donadorId: number) {
    const lista = await this.ofertas.find({
      where: { donadorId },
      relations: { categoria: true },
      order: { creadaEn: 'DESC' },
    });
    // D-64 (C3): la pantalla muestra "Cancelar" solo si el servidor lo
    // permitiria (misma regla que cancelar(): sin ningun intento de asignacion).
    const conIntentos = new Set(
      lista.length
        ? (await this.asignaciones.find({ where: { ofertaId: In(lista.map((o) => o.id)) }, select: { ofertaId: true } })).map((a) => a.ofertaId)
        : [],
    );
    return Promise.all(
      lista.map(async (o) => ({
        ...(await this.aDetalle(o, false)),
        puedeCancelar:
          [EstadoOferta.PENDIENTE_APROBACION, EstadoOferta.APROBADA].includes(o.estado) && !conIntentos.has(o.id),
      })),
    );
  }

  async colaAprobacion() {
    const lista = await this.ofertas.find({
      // D-64 (C2): lo de cuentas bloqueadas espera a que se desbloqueen.
      where: { estado: EstadoOferta.PENDIENTE_APROBACION, donador: { activo: true } },
      relations: { categoria: true, donador: true },
      order: { creadaEn: 'ASC' },
    });
    return Promise.all(lista.map((o) => this.aDetalle(o, true)));
  }

  async detalle(id: number, solicitanteId: number, esPersonalLis: boolean) {
    const oferta = await this.ofertas.findOne({
      where: { id },
      relations: { categoria: true, donador: true },
    });
    if (!oferta) throw new NotFoundException('La oferta no existe.');

    const esDueno = oferta.donadorId === solicitanteId;
    if (!esPersonalLis && !esDueno && oferta.estado !== EstadoOferta.APROBADA) {
      throw new ForbiddenException('No puedes ver esta oferta.');
    }
    if (!esPersonalLis && !esDueno) {
      return this.aCatalogo(oferta);
    }
    return this.aDetalle(oferta, esPersonalLis);
  }

  async crear(
    donadorId: number,
    datos: {
      categoriaId: number;
      nombreProducto: string;
      descripcion: string;
      cantidad: number;
      fotoId?: number;
      estadoConservacion: number;
      medida?: number | null;
    },
  ) {
    // D-24: en la ventana previa a un cierre del LIS no se reciben donaciones.
    const suspendida = await this.calendario.recepcionSuspendida();
    if (suspendida) {
      throw new BadRequestException(
        `La recepción de donaciones esta suspendida por cierre del LIS (${suspendida.desde} a ${suspendida.hasta}). Intenta después del cierre.`,
      );
    }
    const categoria = await this.categorias.obtenerActiva(datos.categoriaId);
    const medida = this.categorias.validarMedidaOferta(categoria, datos.medida);
    if (datos.fotoId) await this.validarFoto(datos.fotoId, donadorId);

    const oferta = await this.ofertas.save(
      this.ofertas.create({
        donadorId,
        categoriaId: datos.categoriaId,
        nombreProducto: datos.nombreProducto,
        descripcion: datos.descripcion,
        cantidad: datos.cantidad,
        estado: EstadoOferta.PENDIENTE_APROBACION,
        fotoId: datos.fotoId ?? null,
        estadoConservacion: datos.estadoConservacion,
        medida,
        origen: 'DONADOR',
      }),
    );

    await this.historial.registrar({
      entidad: EntidadHistorial.OFERTA,
      entidadId: oferta.id,
      estadoAnterior: null,
      estadoNuevo: EstadoOferta.PENDIENTE_APROBACION,
      actorId: donadorId,
      motivo: 'Oferta publicada por el donador',
    });

    return this.detalle(oferta.id, donadorId, false);
  }

  /** El donador puede editar mientras la oferta no tenga asignaciones. */
  async editar(
    id: number,
    donadorId: number,
    datos: {
      categoriaId?: number;
      nombreProducto?: string;
      descripcion?: string;
      cantidad?: number;
      fotoId?: number;
      estadoConservacion?: number;
      medida?: number | null;
    },
  ) {
    const oferta = await this.ofertas.findOne({ where: { id } });
    if (!oferta) throw new NotFoundException('La oferta no existe.');
    if (oferta.donadorId !== donadorId) {
      throw new ForbiddenException('Solo el donador que la publico puede editarla.');
    }
    if (![EstadoOferta.PENDIENTE_APROBACION, EstadoOferta.APROBADA].includes(oferta.estado)) {
      throw new BadRequestException(`Una oferta en estado ${oferta.estado} no se puede editar.`);
    }

    const intentos = await this.asignaciones.count({ where: { ofertaId: id } });
    if (intentos > 0) {
      throw new BadRequestException(
        'La oferta ya tiene asignaciones: no se puede editar. Habla con el personal del LIS.',
      );
    }

    if (datos.categoriaId && datos.categoriaId !== oferta.categoriaId) {
      await this.categorias.obtenerActiva(datos.categoriaId);
      oferta.categoriaId = datos.categoriaId;
    }
    if (datos.estadoConservacion !== undefined) oferta.estadoConservacion = datos.estadoConservacion;
    if (datos.medida !== undefined || datos.categoriaId) {
      const categoria = await this.categorias.obtenerActiva(oferta.categoriaId);
      oferta.medida = this.categorias.validarMedidaOferta(categoria, datos.medida !== undefined ? datos.medida : oferta.medida);
    }
    if (datos.nombreProducto !== undefined) oferta.nombreProducto = datos.nombreProducto;
    if (datos.descripcion !== undefined) oferta.descripcion = datos.descripcion;
    if (datos.cantidad !== undefined) oferta.cantidad = datos.cantidad;
    if (datos.fotoId !== undefined && datos.fotoId !== oferta.fotoId) {
      await this.validarFoto(datos.fotoId, donadorId, oferta.id);
      oferta.fotoId = datos.fotoId;
    }
    oferta.actualizadaEn = new Date();

    // Una oferta ya aprobada que cambia vuelve a revision.
    if (oferta.estado === EstadoOferta.APROBADA) {
      oferta.estado = EstadoOferta.PENDIENTE_APROBACION;
      oferta.revisadaPor = null;
      oferta.revisadaEn = null;
      await this.historial.registrar({
        entidad: EntidadHistorial.OFERTA,
        entidadId: oferta.id,
        estadoAnterior: EstadoOferta.APROBADA,
        estadoNuevo: EstadoOferta.PENDIENTE_APROBACION,
        actorId: donadorId,
        motivo: 'El donador edito la oferta: vuelve a revisión',
      });
    }

    await this.ofertas.save(oferta);
    return this.detalle(id, donadorId, false);
  }

  /** El donador solo puede cancelar mientras no haya asignaciones. */
  async cancelar(id: number, donadorId: number, motivo: string) {
    const oferta = await this.ofertas.findOne({ where: { id } });
    if (!oferta) throw new NotFoundException('La oferta no existe.');
    if (oferta.donadorId !== donadorId) {
      throw new ForbiddenException('Solo el donador que la publico puede cancelarla.');
    }
    if (![EstadoOferta.PENDIENTE_APROBACION, EstadoOferta.APROBADA].includes(oferta.estado)) {
      throw new BadRequestException(`Una oferta en estado ${oferta.estado} no se puede cancelar.`);
    }

    const intentos = await this.asignaciones.count({ where: { ofertaId: id } });
    if (intentos > 0) {
      throw new BadRequestException(
        'La oferta ya fue asignada: el personal del LIS debe resolver la asignación primero.',
      );
    }

    const anterior = oferta.estado;
    oferta.estado = EstadoOferta.CANCELADA;
    oferta.cerradaEn = new Date();
    await this.ofertas.save(oferta);

    await this.historial.registrar({
      entidad: EntidadHistorial.OFERTA,
      entidadId: id,
      estadoAnterior: anterior,
      estadoNuevo: EstadoOferta.CANCELADA,
      actorId: donadorId,
      motivo,
    });

    return this.detalle(id, donadorId, false);
  }

  /**
   * D-47: conflicto de interes en la revision de la propia donacion.
   * Un AUXILIAR_LIS no aprueba ni rechaza sus propias ofertas (las revisa
   * otro auxiliar o un administrador). El ADMINISTRADOR (y el SUPERUSUARIO,
   * que lo hereda) si puede, y queda marcado en el historial.
   * Se valida aqui, en el backend; ocultar botones en Angular no basta.
   */
  private validarRevisionPropia(
    oferta: Oferta,
    revisorId: number,
    revisorEsAdministrador: boolean,
    accion: 'aprobar' | 'rechazar',
  ): boolean {
    const esPropia = oferta.donadorId === revisorId;
    if (esPropia && !revisorEsAdministrador) {
      throw new ForbiddenException(
        `No puedes ${accion} tu propia donación: debe revisarla otro auxiliar o un administrador.`,
      );
    }
    return esPropia;
  }

  async aprobar(id: number, revisorId: number, revisorEsAdministrador = false) {
    const oferta = await this.ofertas.findOne({ where: { id } });
    if (!oferta) throw new NotFoundException('La oferta no existe.');
    if (oferta.estado !== EstadoOferta.PENDIENTE_APROBACION) {
      throw new BadRequestException(
        `Solo se aprueban ofertas pendientes. Esta está en ${oferta.estado}.`,
      );
    }
    const esPropia = this.validarRevisionPropia(oferta, revisorId, revisorEsAdministrador, 'aprobar');

    oferta.estado = EstadoOferta.APROBADA;
    oferta.revisadaPor = revisorId;
    oferta.revisadaEn = new Date();
    oferta.motivoRechazo = null;
    await this.ofertas.save(oferta);

    await this.historial.registrar({
      entidad: EntidadHistorial.OFERTA,
      entidadId: id,
      estadoAnterior: EstadoOferta.PENDIENTE_APROBACION,
      estadoNuevo: EstadoOferta.APROBADA,
      actorId: revisorId,
      motivo: esPropia
        ? 'Autoaprobada por un administrador (su propia donación)'
        : 'Aprobada por el personal del LIS',
    });
    await this.notificaciones.aUsuarios([oferta.donadorId], {
      tipo: 'OFERTA_APROBADA',
      titulo: 'Tu donación fue aprobada',
      mensaje: `Tu donación "${oferta.nombreProducto}" fue aprobada y ya aparece en el catálogo.`,
      entidad: 'OFERTA',
      entidadId: id,
      clave: `OFERTA:${id}:APROBADA:${oferta.revisadaEn.toISOString()}`,
    });

    return this.detalle(id, revisorId, true);
  }

  async rechazar(id: number, revisorId: number, motivo: string, revisorEsAdministrador = false) {
    const oferta = await this.ofertas.findOne({ where: { id } });
    if (!oferta) throw new NotFoundException('La oferta no existe.');
    if (oferta.estado !== EstadoOferta.PENDIENTE_APROBACION) {
      throw new BadRequestException(
        `Solo se rechazan ofertas pendientes. Esta está en ${oferta.estado}.`,
      );
    }
    this.validarRevisionPropia(oferta, revisorId, revisorEsAdministrador, 'rechazar');

    oferta.estado = EstadoOferta.RECHAZADA;
    oferta.revisadaPor = revisorId;
    oferta.revisadaEn = new Date();
    oferta.motivoRechazo = motivo;
    oferta.cerradaEn = new Date();
    await this.ofertas.save(oferta);

    await this.historial.registrar({
      entidad: EntidadHistorial.OFERTA,
      entidadId: id,
      estadoAnterior: EstadoOferta.PENDIENTE_APROBACION,
      estadoNuevo: EstadoOferta.RECHAZADA,
      actorId: revisorId,
      motivo,
    });
    await this.notificaciones.aUsuarios([oferta.donadorId], {
      tipo: 'OFERTA_RECHAZADA',
      titulo: 'Tu donación no fue aprobada',
      mensaje: `Tu donación "${oferta.nombreProducto}" no fue aprobada. Motivo: ${motivo}`,
      entidad: 'OFERTA',
      entidadId: id,
      clave: `OFERTA:${id}:RECHAZADA`,
    });

    return this.detalle(id, revisorId, true);
  }

  /** Cierre por el LIS cuando ya no queda nada por mover. */
  async cerrar(id: number, actorId: number, motivo: string) {
    const oferta = await this.ofertas.findOne({ where: { id } });
    if (!oferta) throw new NotFoundException('La oferta no existe.');
    if (oferta.estado !== EstadoOferta.APROBADA) {
      throw new BadRequestException('Solo se cierra una oferta aprobada.');
    }
    const saldo = await this.saldoDe(oferta);
    if (saldo.comprometida > 0) {
      throw new BadRequestException(
        `La oferta tiene ${saldo.comprometida} unidades comprometidas sin resolver.`,
      );
    }

    oferta.estado = EstadoOferta.CERRADA;
    oferta.cerradaEn = new Date();
    await this.ofertas.save(oferta);

    await this.historial.registrar({
      entidad: EntidadHistorial.OFERTA,
      entidadId: id,
      estadoAnterior: EstadoOferta.APROBADA,
      estadoNuevo: EstadoOferta.CERRADA,
      actorId,
      motivo,
    });

    return this.detalle(id, actorId, true);
  }

  historialDe(id: number) {
    return this.historial.de(EntidadHistorial.OFERTA, id);
  }
}
