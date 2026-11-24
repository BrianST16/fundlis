import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EstadoAsignacion, EstadoOferta, EstadoPeticion } from '../common/enums';
import { ParametrosService } from '../common/parametros.service';
import { DestinoLocal, LoteFisico, Oferta, OfertaXPeticion, Peticion } from '../entities';
import {
  alertasDe,
  explicarEstudiante,
  FilaComportamiento,
  FilaDirecta,
  FilaRanking,
  promedioDias,
  rankear,
  rankearDirecto,
  tasa,
} from './formulas';

type Identidad = { nombre: string | null; email: string | null };

/**
 * Pilar C (D-40): indicadores operativos, ranking de estudiantes y de
 * donadores y alertas de incumplimiento. Es INDEPENDIENTE de la prioridad
 * de emparejamiento: no la lee ni la modifica.
 *
 * Todo se calcula desde eventos registrados (estados de peticion, intentos,
 * lotes y destinos LOCAL). No se atribuye un incumplimiento sin un evento que
 * lo respalde:
 *  - estudiante incumple  = peticion CERRADA_INCUMPLIMIENTO (no recogio, D-16);
 *  - donador incumple     = compromiso cancelado sin recepcion, recepcion
 *                           incompleta (lote RECEPCION_INCOMPLETA) o destino
 *                           LOCAL cancelado en espera de recepcion.
 */
@Injectable()
export class AnaliticaService {
  constructor(
    @InjectRepository(Oferta) private readonly ofertas: Repository<Oferta>,
    @InjectRepository(Peticion) private readonly peticiones: Repository<Peticion>,
    @InjectRepository(OfertaXPeticion) private readonly asignaciones: Repository<OfertaXPeticion>,
    @InjectRepository(LoteFisico) private readonly lotes: Repository<LoteFisico>,
    @InjectRepository(DestinoLocal) private readonly destinos: Repository<DestinoLocal>,
    private readonly parametros: ParametrosService,
  ) {}

  // ------------------------------------------------------------------
  // Indicadores operativos
  // ------------------------------------------------------------------
  async indicadores() {
    const [ofertas, peticiones, intentos, lotes, destinos] = await Promise.all([
      this.ofertas.find(),
      this.peticiones.find(),
      this.asignaciones.find(),
      this.lotes.find(),
      this.destinos.find(),
    ]);
    const contar = <T extends string>(valores: T[], universo: T[]) =>
      Object.fromEntries(universo.map((e) => [e, valores.filter((v) => v === e).length])) as Record<T, number>;

    const porEstadoOferta = contar(ofertas.map((o) => o.estado), Object.values(EstadoOferta));
    const porEstadoPeticion = contar(peticiones.map((p) => p.estado), Object.values(EstadoPeticion));
    const porEstadoAsignacion = contar(intentos.map((a) => a.estado), Object.values(EstadoAsignacion));

    const unidadesOfertadas = ofertas
      .filter((o) => o.origen !== 'FALTANTE' && (o.estado === EstadoOferta.APROBADA || o.estado === EstadoOferta.CERRADA))
      .reduce((s, o) => s + o.cantidad, 0);
    const unidadesEntregadas = intentos
      .filter((a) => a.estado === EstadoAsignacion.ENTREGADO)
      .reduce((s, a) => s + a.cantidadAsignada, 0);
    const intentosCerrados = porEstadoAsignacion.ENTREGADO + porEstadoAsignacion.CANCELADO + porEstadoAsignacion.DEVOLUCION;
    const peticionesRevisadas =
      porEstadoPeticion.APROBADA + porEstadoPeticion.CERRADA_ENTREGA + porEstadoPeticion.CERRADA_INCUMPLIMIENTO;

    const lotesEnLis = lotes.filter((l) => l.ubicacion === 'EN_LIS');
    return {
      generadoEn: new Date().toISOString(),
      ofertasPorEstado: porEstadoOferta,
      peticionesPorEstado: porEstadoPeticion,
      asignacionesPorEstado: porEstadoAsignacion,
      unidadesOfertadas,
      unidadesEntregadas,
      unidadesEnLis: lotesEnLis.reduce((s, l) => s + l.cantidad, 0),
      lotesSinDestino: lotesEnLis.filter((l) => !!l.sinDestinoDesde).length,
      unidadesPatrimonioLis: lotes.filter((l) => l.ubicacion === 'PATRIMONIO_LIS').reduce((s, l) => s + l.cantidad, 0),
      destinosLocalPorEstado: contar(destinos.map((d) => d.estado), ['ESPERA_RECEPCION', 'CUSTODIA_TEMPORAL', 'ACEPTADO', 'REASIGNADO', 'DEVUELTO', 'CANCELADO']),
      tasaEntrega: tasa(porEstadoAsignacion.ENTREGADO, intentosCerrados),
      tasaAtencionPeticiones: tasa(porEstadoPeticion.CERRADA_ENTREGA, peticionesRevisadas),
      diasPromedioAsignacionARecepcion: promedioDias(
        intentos.filter((a) => a.origen === 'DONADOR').map((a) => [a.asignadaEn, a.recibidaEn]),
      ),
      diasPromedioRecepcionAEntrega: promedioDias(intentos.map((a) => [a.custodiaDesde ?? a.recibidaEn, a.entregadaEn])),
    };
  }

  // ------------------------------------------------------------------
  // Estudiantes: peticiones, ayudas recibidas, incumplimientos
  // ------------------------------------------------------------------
  async rankingEstudiantes() {
    const { ranking, identidades, pesos } = await this.calcularEstudiantes();
    return ranking.map((f) => ({
      posicion: f.posicion,
      usuarioId: f.id,
      nombre: identidades.get(f.id)?.nombre ?? null,
      email: identidades.get(f.id)?.email ?? null,
      peticiones: f.participaciones,
      ayudasRecibidas: f.exitos,
      incumplimientos: f.fallos,
      cumplimiento: f.cumplimiento,
      actividad: f.actividad,
      reputacion: f.reputacion,
      explicacion: explicarEstudiante(f, pesos),
    }));
  }

  private async calcularEstudiantes() {
    const peticiones = await this.peticiones.find({ relations: { estudiante: true } });
    const filas = new Map<number, FilaComportamiento>();
    const identidades = new Map<number, Identidad>();
    for (const p of peticiones) {
      const f = filas.get(p.estudianteId) ?? { id: p.estudianteId, participaciones: 0, exitos: 0, fallos: 0 };
      f.participaciones++;
      if (p.estado === EstadoPeticion.CERRADA_ENTREGA) f.exitos++;
      if (p.estado === EstadoPeticion.CERRADA_INCUMPLIMIENTO) f.fallos++;
      filas.set(p.estudianteId, f);
      identidades.set(p.estudianteId, { nombre: p.estudiante?.nombre ?? null, email: p.estudiante?.email ?? null });
    }
    const pesos = await this.parametros.pesosReputacion();
    return { ranking: rankear([...filas.values()], pesos), identidades, pesos };
  }

  // ------------------------------------------------------------------
  // Donadores: completadas frente a fallidas (indicador directo)
  // ------------------------------------------------------------------
  async rankingDonadores() {
    const [{ ranking, identidades }, umbralRecurrente] = await Promise.all([
      this.calcularDonadores(),
      this.parametros.minDonacionesRecurrente(),
    ]);
    return ranking.map((f) => ({
      // D-49: apoyo para Aprobaciones. Es INFORMATIVO: no aprueba solo.
      recurrente: f.completadas >= umbralRecurrente,
      umbralRecurrente,
      posicion: f.posicion,
      usuarioId: f.id,
      nombre: identidades.get(f.id)?.nombre ?? null,
      email: identidades.get(f.id)?.email ?? null,
      compromisos: f.compromisos,
      completadas: f.completadas,
      fallidas: f.fallidas,
      pendientes: f.pendientes,
      tasaCumplimiento: f.tasaCumplimiento,
    }));
  }

  private async calcularDonadores() {
    const [ofertas, intentos, lotes, destinos] = await Promise.all([
      this.ofertas.find({ relations: { donador: true } }),
      this.asignaciones.find(),
      this.lotes.find({ where: { origen: 'RECEPCION_INCOMPLETA' } }),
      this.destinos.find({ where: { origen: 'OFERTA' } }),
    ]);
    const incompletas = new Set(lotes.map((l) => l.intentoOrigenId).filter((x): x is number => x !== null));
    const donadorDeOferta = new Map(ofertas.map((o) => [o.id, o.donadorId]));
    const filas = new Map<number, FilaDirecta>();
    const identidades = new Map<number, Identidad>();

    for (const o of ofertas) {
      if (o.origen === 'FALTANTE') continue;
      if (!filas.has(o.donadorId)) {
        filas.set(o.donadorId, { id: o.donadorId, compromisos: 0, completadas: 0, fallidas: 0, pendientes: 0 });
        identidades.set(o.donadorId, { nombre: o.donador?.nombre ?? null, email: o.donador?.email ?? null });
      }
    }
    const sumar = (donadorId: number | undefined, r: 'COMPLETADO' | 'FALLIDO' | 'PENDIENTE') => {
      const f = donadorId !== undefined ? filas.get(donadorId) : undefined;
      if (!f) return;
      f.compromisos++;
      if (r === 'COMPLETADO') f.completadas++;
      else if (r === 'FALLIDO') f.fallidas++;
      else f.pendientes++;
    };
    for (const a of intentos) {
      if (a.origen !== 'DONADOR') continue; // una reasignacion no es un compromiso del donador
      sumar(donadorDeOferta.get(a.ofertaId), clasificarCompromisoDonador(a, incompletas));
    }
    for (const d of destinos) {
      sumar(donadorDeOferta.get(d.ofertaId), clasificarDestinoLocal(d.estado));
    }
    return { ranking: rankearDirecto([...filas.values()]), identidades };
  }

  // ------------------------------------------------------------------
  // Alertas (informativas: no sancionan ni bloquean)
  // ------------------------------------------------------------------
  async alertas() {
    const regla = await this.parametros.reglaAlerta();
    const [est, estPresentado, don] = await Promise.all([
      this.calcularEstudiantes(),
      this.rankingEstudiantes(),
      this.rankingDonadores(),
    ]);
    const porId = new Map(estPresentado.map((x) => [x.usuarioId, x]));
    const estudiantes = alertasDe(est.ranking as FilaRanking[], regla).map((a) => ({
      ...porId.get(a.id),
      motivos: a.motivos,
    }));
    const donadores = don
      .map((d) => {
        const motivos: string[] = [];
        if (d.fallidas >= regla.umbralFallos) motivos.push('FALLOS_REPETIDOS');
        if (d.tasaCumplimiento !== null && d.tasaCumplimiento < regla.umbralReputacion) motivos.push('TASA_BAJA');
        return { ...d, motivos };
      })
      .filter((d) => d.motivos.length);
    return { regla, estudiantes, donadores };
  }
}

/**
 * Resultado de un compromiso del donador (intento de origen DONADOR):
 *  - COMPLETADO: el producto llego COMPLETO al LIS (EN_CUSTODIA, ENTREGADO,
 *    DEVOLUCION, o cancelado despues de una recepcion completa: alli fallo el
 *    estudiante, no el donador);
 *  - FALLIDO: cancelado sin recepcion (no lo llevo) o con recepcion incompleta;
 *  - PENDIENTE: sigue ASIGNADO.
 */
export function clasificarCompromisoDonador(
  a: { id: number; estado: EstadoAsignacion; recibidaEn?: Date | null },
  incompletas: Set<number>,
): 'COMPLETADO' | 'FALLIDO' | 'PENDIENTE' {
  switch (a.estado) {
    case EstadoAsignacion.ASIGNADO:
      return 'PENDIENTE';
    case EstadoAsignacion.EN_CUSTODIA:
    case EstadoAsignacion.ENTREGADO:
    case EstadoAsignacion.DEVOLUCION:
      return 'COMPLETADO';
    case EstadoAsignacion.CANCELADO:
      if (!a.recibidaEn || incompletas.has(a.id)) return 'FALLIDO';
      return 'COMPLETADO';
    default:
      return 'PENDIENTE';
  }
}

/** Destino LOCAL elegido desde una oferta: tambien es un compromiso del donador. */
export function clasificarDestinoLocal(estado: string): 'COMPLETADO' | 'FALLIDO' | 'PENDIENTE' {
  if (estado === 'ESPERA_RECEPCION') return 'PENDIENTE';
  if (estado === 'CANCELADO') return 'FALLIDO';
  return 'COMPLETADO';
}
