import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EntidadHistorial } from '../common/enums';
import {
  DestinoLocal,
  HistorialEstado,
  LoteFisico,
  Movimiento,
  Oferta,
  OfertaXPeticion,
  Usuario,
} from '../entities';

export type GrupoEvento = 'OFERTA' | 'ASIGNACION' | 'LOTE' | 'LOCAL';

export interface EventoTrazabilidad {
  /** Clave unica para la vista. */
  id: string;
  fecha: Date;
  /** ESTADO = cambio registrado en HISTORIAL_ESTADO; MOVIMIENTO = entrada/salida fisica (con foto). */
  clase: 'ESTADO' | 'MOVIMIENTO';
  grupo: GrupoEvento;
  /** Objeto al que pertenece, legible: "Asignacion #12 (peticion #5)". */
  referencia: string;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  /** Para MOVIMIENTO: RECEPCION | ENTREGA | DEVOLUCION. */
  tipoMovimiento: string | null;
  actor: string;
  explicacion: string | null;
  cantidad: number | null;
  contraparte: string | null;
  evidenciaId: number | null;
}

/**
 * Correccion 10 / D-52: trazabilidad completa de una DONACION para el
 * administrador. Une en una sola linea de tiempo:
 *  - HISTORIAL_ESTADO de la oferta, de cada intento (OFERTA_X_PETICION),
 *    de sus lotes fisicos y de sus destinos LOCAL;
 *  - MOVIMIENTO (recepciones, entregas, devoluciones) con su foto, quien
 *    entrego/recibio y las observaciones.
 * Solo lectura. No duplica datos: todo sale de las tablas de auditoria.
 */
@Injectable()
export class TrazabilidadService {
  constructor(
    @InjectRepository(Oferta) private readonly ofertas: Repository<Oferta>,
    @InjectRepository(OfertaXPeticion) private readonly intentos: Repository<OfertaXPeticion>,
    @InjectRepository(LoteFisico) private readonly lotes: Repository<LoteFisico>,
    @InjectRepository(DestinoLocal) private readonly destinos: Repository<DestinoLocal>,
    @InjectRepository(Movimiento) private readonly movimientos: Repository<Movimiento>,
    @InjectRepository(HistorialEstado) private readonly historial: Repository<HistorialEstado>,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
  ) {}

  async deOferta(ofertaId: number) {
    const oferta = await this.ofertas.findOne({
      where: { id: ofertaId },
      relations: { categoria: true, donador: true },
    });
    if (!oferta) throw new NotFoundException('La donación no existe.');

    const [intentos, lotes, destinos, derivadas] = await Promise.all([
      this.intentos.find({ where: { ofertaId }, relations: { peticion: { estudiante: true } }, order: { asignadaEn: 'ASC' } }),
      this.lotes.find({ where: { ofertaId } }),
      this.destinos.find({ where: { ofertaId } }),
      // Ofertas generadas por recepcion incompleta de esta (D-18).
      this.ofertas.find({ where: { ofertaOrigenId: ofertaId }, select: { id: true, cantidad: true } }),
    ]);
    const idsIntentos = intentos.map((i) => i.id);
    const idsLotes = lotes.map((l) => l.id);
    const idsDestinos = destinos.map((d) => d.id);

    const porEntidad = (entidad: EntidadHistorial, ids: number[]) =>
      ids.length ? this.historial.find({ where: { entidad, entidadId: In(ids) } }) : Promise.resolve([]);
    const [hOferta, hIntentos, hLotes, hDestinos, movimientos] = await Promise.all([
      porEntidad(EntidadHistorial.OFERTA, [ofertaId]),
      porEntidad(EntidadHistorial.ASIGNACION, idsIntentos),
      porEntidad(EntidadHistorial.LOTE, idsLotes),
      porEntidad(EntidadHistorial.LOCAL, idsDestinos),
      idsIntentos.length || idsDestinos.length
        ? this.movimientos.find({
            where: [
              ...(idsIntentos.length ? [{ ofertaXPeticionId: In(idsIntentos) }] : []),
              ...(idsDestinos.length ? [{ destinoLocalId: In(idsDestinos) }] : []),
            ],
          })
        : Promise.resolve([] as Movimiento[]),
    ]);

    // Nombres de quienes actuaron (personal LIS, donador o estudiante).
    const idsActores = [
      ...new Set([
        ...[...hOferta, ...hIntentos, ...hLotes, ...hDestinos].map((h) => h.actorId),
        ...movimientos.map((m) => m.registradoPor),
      ].filter((x): x is number => typeof x === 'number')),
    ];
    const actores = idsActores.length ? await this.usuarios.find({ where: { id: In(idsActores) } }) : [];
    const nombre = new Map(actores.map((u) => [u.id, u.nombre]));
    const actor = (id: number | null) => (id ? nombre.get(id) ?? `Usuario #${id}` : 'Sistema');

    const intentoPorId = new Map(intentos.map((i) => [i.id, i]));
    const refIntento = (id: number) => {
      const i = intentoPorId.get(id);
      return i ? `Asignación #${id} (petición #${i.peticionId})` : `Asignación #${id}`;
    };
    const refs: Record<GrupoEvento, (id: number) => string> = {
      OFERTA: (id) => `Donación #${id}`,
      ASIGNACION: refIntento,
      LOTE: (id) => `Lote físico #${id}`,
      LOCAL: (id) => `Local #${id}`,
    };

    const estado = (grupo: GrupoEvento, lista: HistorialEstado[]): EventoTrazabilidad[] =>
      lista.map((h) => ({
        id: `H${h.id}`,
        fecha: h.ocurridoEn,
        clase: 'ESTADO',
        grupo,
        referencia: refs[grupo](h.entidadId),
        estadoAnterior: h.estadoAnterior,
        estadoNuevo: h.estadoNuevo,
        tipoMovimiento: null,
        actor: actor(h.actorId),
        explicacion: h.motivo,
        cantidad: null,
        contraparte: null,
        evidenciaId: null,
      }));

    const eventos: EventoTrazabilidad[] = [
      ...estado('OFERTA', hOferta),
      ...estado('ASIGNACION', hIntentos),
      ...estado('LOTE', hLotes),
      ...estado('LOCAL', hDestinos),
      ...movimientos.map((m): EventoTrazabilidad => ({
        id: `M${m.id}`,
        fecha: m.registradoEn,
        clase: 'MOVIMIENTO',
        grupo: m.ofertaXPeticionId ? 'ASIGNACION' : 'LOCAL',
        referencia: m.ofertaXPeticionId ? refIntento(m.ofertaXPeticionId) : `Local #${m.destinoLocalId}`,
        estadoAnterior: null,
        estadoNuevo: null,
        tipoMovimiento: m.tipo,
        actor: actor(m.registradoPor),
        explicacion: m.observaciones,
        cantidad: m.cantidad,
        contraparte: m.nombreContraparte,
        evidenciaId: m.evidenciaId,
      })),
    ].sort(
      (a, b) =>
        new Date(a.fecha).getTime() - new Date(b.fecha).getTime() ||
        // Mismo instante: el movimiento fisico antes del cambio de estado que provoca.
        (a.clase === b.clase ? 0 : a.clase === 'MOVIMIENTO' ? -1 : 1),
    );

    return {
      oferta: {
        id: oferta.id,
        producto: oferta.nombreProducto,
        categoria: oferta.categoria?.nombre ?? null,
        cantidad: oferta.cantidad,
        estado: oferta.estado,
        origen: oferta.origen,
        ofertaOrigenId: oferta.ofertaOrigenId ?? null,
        fotoId: oferta.fotoId,
        creadaEn: oferta.creadaEn,
        donador: oferta.donador ? { nombre: oferta.donador.nombre, email: oferta.donador.email } : null,
      },
      asignaciones: intentos.map((i) => ({
        id: i.id,
        estado: i.estado,
        origen: i.origen,
        cantidad: i.cantidadAsignada,
        peticionId: i.peticionId,
        estudiante: i.peticion?.estudiante?.nombre ?? null,
      })),
      derivadas: derivadas.map((d) => ({ id: d.id, cantidad: d.cantidad })),
      resumen: {
        eventos: eventos.length,
        cambiosDeEstado: eventos.filter((e) => e.clase === 'ESTADO').length,
        movimientosFisicos: movimientos.length,
        fotos: movimientos.length + (oferta.fotoId ? 1 : 0),
      },
      eventos,
    };
  }
}
