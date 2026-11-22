/**
 * PILAR C — Analitica y ranking de comportamiento.
 * =========================================================================
 *
 * Todo lo de este archivo es PURO (sin BD) para poder probarlo con
 * ejemplos calculados a mano.
 *
 * Separacion obligatoria (D-27): este ranking de COMPORTAMIENTO no
 * participa en la PRIORIDAD de emparejamiento (caracterizacion + Sisben +
 * antiguedad). Un estudiante con mala reputacion no pierde prioridad
 * socioeconomica; el ranking es informacion para el personal del LIS.
 *
 * Formula (PROPUESTA, P-11 pendiente de aprobacion; pesos configurables
 * en PARAMETRO):
 *
 *   cumplimiento = (exitos + 1) / (exitos + fallos + 2)
 *
 * Es la media de una distribucion Beta(1,1) actualizada (suavizado de
 * Laplace). Por que no la tasa simple exitos/(exitos+fallos):
 *   - sin historial da 0.5 (neutral) en vez de dividir por cero;
 *   - 1 de 1 no vale lo mismo que 20 de 20: 2/3 = 0.667 frente a 21/22 = 0.955;
 *   - un unico incumplimiento no hunde a quien tiene mucho historial.
 *
 *   actividad    = participaciones / max(participaciones de la cohorte)  en [0,1]
 *   reputacion   = wC * cumplimiento + wA * actividad,  con wC + wA = 1
 *
 * Desempate: reputacion desc, exitos desc, fallos asc, id asc (orden total
 * reproducible).
 */

export interface PesosReputacion {
  cumplimiento: number;
  actividad: number;
}

export const PESOS_REPUTACION_POR_DEFECTO: PesosReputacion = {
  cumplimiento: 0.85,
  actividad: 0.15,
};

export function normalizarPesos(p: PesosReputacion): PesosReputacion {
  const c = Math.max(0, p.cumplimiento);
  const a = Math.max(0, p.actividad);
  const suma = c + a;
  if (suma <= 0) return { ...PESOS_REPUTACION_POR_DEFECTO };
  return { cumplimiento: c / suma, actividad: a / suma };
}

export function cumplimientoSuavizado(exitos: number, fallos: number): number {
  return (exitos + 1) / (exitos + fallos + 2);
}

export interface FilaComportamiento {
  id: number;
  /** Peticiones hechas (estudiante) o compromisos adquiridos (donador). */
  participaciones: number;
  /** Ayudas recibidas (estudiante) o donaciones completadas (donador). */
  exitos: number;
  /** Incumplimientos de recogida (estudiante) o compromisos fallidos (donador). */
  fallos: number;
}

export interface FilaRanking extends FilaComportamiento {
  posicion: number;
  cumplimiento: number;
  actividad: number;
  reputacion: number;
}

const r6 = (x: number) => Number(x.toFixed(6));

export function rankear(filas: FilaComportamiento[], pesos: PesosReputacion): FilaRanking[] {
  const w = normalizarPesos(pesos);
  const maxPart = filas.reduce((m, f) => Math.max(m, f.participaciones), 0);

  const calculadas = filas.map((f) => {
    const cumplimiento = cumplimientoSuavizado(f.exitos, f.fallos);
    const actividad = maxPart > 0 ? f.participaciones / maxPart : 0;
    return {
      ...f,
      cumplimiento: r6(cumplimiento),
      actividad: r6(actividad),
      reputacion: r6(w.cumplimiento * cumplimiento + w.actividad * actividad),
      posicion: 0,
    };
  });

  calculadas.sort(
    (a, b) =>
      b.reputacion - a.reputacion ||
      b.exitos - a.exitos ||
      a.fallos - b.fallos ||
      a.id - b.id,
  );
  calculadas.forEach((f, i) => (f.posicion = i + 1));
  return calculadas;
}

/**
 * DONADORES: indicador DIRECTO (D-40), sin formula compuesta:
 *   tasa de cumplimiento = completadas / (completadas + fallidas)
 * Sin compromisos cerrados la tasa es null ("sin historial") y el donador
 * queda despues de los que si tienen historial. Desempate: mas completadas,
 * menos fallidas, id.
 */
export interface FilaDirecta {
  id: number;
  compromisos: number;
  completadas: number;
  fallidas: number;
  pendientes: number;
}

export function rankearDirecto(filas: FilaDirecta[]) {
  const calculadas = filas.map((f) => {
    const cerradas = f.completadas + f.fallidas;
    return { ...f, tasaCumplimiento: cerradas > 0 ? Number((f.completadas / cerradas).toFixed(4)) : null, posicion: 0 };
  });
  calculadas.sort(
    (a, b) =>
      (a.tasaCumplimiento === null ? 1 : 0) - (b.tasaCumplimiento === null ? 1 : 0) ||
      (b.tasaCumplimiento ?? 0) - (a.tasaCumplimiento ?? 0) ||
      b.completadas - a.completadas ||
      a.fallidas - b.fallidas ||
      a.id - b.id,
  );
  calculadas.forEach((f, i) => (f.posicion = i + 1));
  return calculadas;
}

/** Explicacion legible de la reputacion de un estudiante (factores). */
export function explicarEstudiante(f: FilaRanking, pesos: PesosReputacion): string {
  const w = normalizarPesos(pesos);
  if (f.exitos + f.fallos === 0) {
    return `Sin ayudas ni incumplimientos registrados: cumplimiento neutral 0.5. ${f.participaciones} peticion(es) hechas.`;
  }
  return (
    `${f.exitos} ayuda(s) recibida(s) y ${f.fallos} incumplimiento(s) de recogida -> cumplimiento (${f.exitos}+1)/(${f.exitos}+${f.fallos}+2) = ${f.cumplimiento}. ` +
    `Actividad ${f.actividad} (${f.participaciones} peticiones frente al maximo de la cohorte). ` +
    `Reputacion = ${w.cumplimiento.toFixed(2)}*${f.cumplimiento} + ${w.actividad.toFixed(2)}*${f.actividad} = ${f.reputacion}.`
  );
}

export interface ReglaAlerta {
  /** Numero de fallos a partir del cual se alerta. */
  umbralFallos: number;
  /** Reputacion por debajo de la cual se alerta (solo con historial). */
  umbralReputacion: number;
}

export const REGLA_ALERTA_POR_DEFECTO: ReglaAlerta = { umbralFallos: 2, umbralReputacion: 0.4 };

export type MotivoAlerta = 'FALLOS_REPETIDOS' | 'REPUTACION_BAJA';

/** Alertas de incumplimiento para que el LIS revise el caso. No sancionan. */
export function alertasDe(filas: FilaRanking[], regla: ReglaAlerta): { id: number; motivos: MotivoAlerta[] }[] {
  const salida: { id: number; motivos: MotivoAlerta[] }[] = [];
  for (const f of filas) {
    const motivos: MotivoAlerta[] = [];
    if (f.fallos >= regla.umbralFallos) motivos.push('FALLOS_REPETIDOS');
    if (f.exitos + f.fallos > 0 && f.reputacion < regla.umbralReputacion) motivos.push('REPUTACION_BAJA');
    if (motivos.length) salida.push({ id: f.id, motivos });
  }
  return salida;
}

/** Promedio en dias de una lista de pares de fechas; null si no hay datos. */
export function promedioDias(pares: [Date | null | undefined, Date | null | undefined][]): number | null {
  const validos = pares.filter(([a, b]) => a && b) as [Date, Date][];
  if (!validos.length) return null;
  const total = validos.reduce(
    (acc, [a, b]) => acc + (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000,
    0,
  );
  return Number((total / validos.length).toFixed(2));
}

/** Proporcion segura en [0,1]; null si el denominador es cero. */
export function tasa(numerador: number, denominador: number): number | null {
  return denominador > 0 ? Number((numerador / denominador).toFixed(4)) : null;
}
