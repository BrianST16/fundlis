import { EstadoAsignacion } from '../common/enums';
import {
  diasHabilesEntre,
  fechaEnBogota,
  RangoCierre,
  sumarDiasHabiles,
} from '../calendario/dias-habiles';
import { FechaCivil } from '../calendario/festivos-colombia';

/**
 * PILAR B — Plazos y tarea DEFINIR_ESTADO, DERIVADOS de los datos que ya
 * existen (asignada_en, recibida_en), sin tablas nuevas.
 *
 *  - ASIGNADO:    el donador tiene N dias habiles (10, D-21) desde la
 *                 asignacion para llevar el producto al LIS.
 *  - EN_CUSTODIA: el estudiante tiene M dias habiles (3, D-22) desde la
 *                 recepcion para recoger.
 *
 * Al vencer, el intento genera la tarea DEFINIR_ESTADO para el auxiliar
 * (D-23). La persistencia de tareas, las prorrogas y las notificaciones
 * por correo quedan para el esquema T4.4 (requiere autorizacion de BD).
 */

export interface ConfigPlazos {
  donador: number;
  estudiante: number;
  /** Dias habiles antes del vencimiento en que se marca POR_VENCER. */
  avisoPrevio: number;
}

export type EstadoPlazo = 'EN_PLAZO' | 'POR_VENCER' | 'VENCIDO';
export type Responsable = 'DONADOR' | 'ESTUDIANTE';

export interface AccionTarea {
  codigo: string;
  descripcion: string;
  /** false si aun no esta implementada o depende de una decision pendiente. */
  disponible: boolean;
  nota?: string;
}

export interface Plazo {
  responsable: Responsable;
  evento: 'ENTREGA_EN_LIS' | 'RECOGIDA_EN_LIS';
  inicio: FechaCivil;
  diasHabiles: number;
  fechaLimite: FechaCivil;
  /** Dias habiles que faltan; 0 = vence hoy; negativo = dias de retraso. */
  diasHabilesRestantes: number;
  estado: EstadoPlazo;
  tarea: 'DEFINIR_ESTADO' | null;
  acciones: AccionTarea[];
}

export interface IntentoConFechas {
  estado: EstadoAsignacion;
  asignadaEn: Date;
  recibidaEn?: Date | null;
  /** Inicio del plazo del estudiante (recepcion o reasignacion). */
  custodiaDesde?: Date | null;
  /** Dias habiles de prorroga concedidos (aplazamiento o extension). */
  diasExtra?: number;
}

const ACCIONES_DONADOR: AccionTarea[] = [
  {
    codigo: 'CANCELAR_INTENTO',
    descripcion: 'Cancelar el intento: se liberan las unidades y la peticion vuelve con su fecha original (D-15).',
    disponible: true,
  },
  {
    codigo: 'APLAZAR',
    descripcion: 'Aplazar el plazo del donador tras contactarlo (+dias habiles configurables).',
    disponible: true,
    nota: 'Duracion y maximo son PROPUESTA configurable (P-07): PLAZO_APLAZAMIENTO_DONADOR_DIAS_HABILES, MAX_APLAZAMIENTOS_DONADOR.',
  },
];

const ACCIONES_ESTUDIANTE: AccionTarea[] = [
  {
    codigo: 'EXTENDER',
    descripcion: 'Extender 3 dias habiles el plazo de recogida (D-22).',
    disponible: true,
  },
  {
    codigo: 'CANCELAR_INTENTO',
    descripcion: 'Cancelar el intento (la peticion se cierra por incumplimiento, D-16). El lote queda sin destino para reasignarlo, enviarlo a custodia LOCAL o devolverlo.',
    disponible: true,
  },
  {
    codigo: 'DEVOLUCION',
    descripcion: 'Iniciar la devolucion al donador u otro destino permitido.',
    disponible: true,
  },
];

export function calcularPlazo(
  intento: IntentoConFechas,
  ahora: Date,
  config: ConfigPlazos,
  cierres: RangoCierre[] = [],
): Plazo | null {
  let responsable: Responsable;
  let evento: Plazo['evento'];
  let instanteInicio: Date | null | undefined;
  let dias: number;

  if (intento.estado === EstadoAsignacion.ASIGNADO) {
    responsable = 'DONADOR';
    evento = 'ENTREGA_EN_LIS';
    instanteInicio = intento.asignadaEn; // P-25: la notificacion es inmediata a la asignacion
    dias = config.donador;
  } else if (intento.estado === EstadoAsignacion.EN_CUSTODIA) {
    responsable = 'ESTUDIANTE';
    evento = 'RECOGIDA_EN_LIS';
    instanteInicio = intento.custodiaDesde ?? intento.recibidaEn;
    dias = config.estudiante;
  } else {
    return null; // solo los intentos vigentes tienen plazo
  }
  if (!instanteInicio) return null;
  dias += Math.max(0, intento.diasExtra ?? 0);

  const inicio = fechaEnBogota(new Date(instanteInicio));
  const fechaLimite = sumarDiasHabiles(inicio, dias, cierres);
  const hoy = fechaEnBogota(ahora);
  const restantes = diasHabilesEntre(hoy, fechaLimite, cierres);

  let estado: EstadoPlazo;
  if (hoy > fechaLimite) estado = 'VENCIDO';
  else if (restantes <= config.avisoPrevio) estado = 'POR_VENCER';
  else estado = 'EN_PLAZO';

  return {
    responsable,
    evento,
    inicio,
    diasHabiles: dias,
    fechaLimite,
    diasHabilesRestantes: restantes,
    estado,
    tarea: estado === 'VENCIDO' ? 'DEFINIR_ESTADO' : null,
    acciones:
      estado === 'VENCIDO' ? (responsable === 'DONADOR' ? ACCIONES_DONADOR : ACCIONES_ESTUDIANTE) : [],
  };
}

const ORDEN_ESTADO: Record<EstadoPlazo, number> = { VENCIDO: 0, POR_VENCER: 1, EN_PLAZO: 2 };

/** Orden de la bandeja: vencidos primero, luego por fecha limite. */
export function compararPlazos(a: Plazo, b: Plazo): number {
  return ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || a.fechaLimite.localeCompare(b.fechaLimite);
}
