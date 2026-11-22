/**
 * FESTIVOS NACIONALES DE COLOMBIA, calculados (no escritos a mano).
 * =========================================================================
 *
 * Fuentes normativas:
 *  - Ley 51 de 1983 ("Ley Emiliani"): traslada ciertos festivos al lunes
 *    siguiente cuando no caen en lunes.
 *  - Ley 37 de 1905 y Concordato: festivos religiosos ligados a la Pascua.
 *
 * Tres grupos:
 *  1. Fijos (no se trasladan): 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
 *  2. Trasladables al lunes siguiente: 6 ene, 19 mar, 29 jun, 15 ago,
 *     12 oct, 1 nov, 11 nov.
 *  3. Dependientes de la Pascua: Jueves y Viernes Santo (no se trasladan);
 *     Ascension (+43 dias, ya en lunes), Corpus Christi (+64) y Sagrado
 *     Corazon (+71).
 *
 * Asi el calendario sirve para cualquier anio sin mantenimiento manual
 * (directriz: "no hardcodear fechas"). Los cierres propios del LIS son un
 * dato aparte, configurable (ver dias-habiles.ts).
 *
 * Todas las fechas se manejan como fechas CIVILES "AAAA-MM-DD" (sin hora)
 * construidas en UTC, para que el resultado no dependa de la zona horaria
 * del servidor.
 */

export type FechaCivil = string; // 'AAAA-MM-DD'

export function fechaUtc(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

export function aCivil(d: Date): FechaCivil {
  return d.toISOString().slice(0, 10);
}

export function desdeCivil(f: FechaCivil): Date {
  const [a, m, d] = f.split('-').map(Number);
  return fechaUtc(a, m, d);
}

export function sumarDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Domingo de Pascua (algoritmo anonimo gregoriano, Meeus/Jones/Butcher). */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return fechaUtc(anio, mes, dia);
}

/** Lunes siguiente (o el mismo dia si ya es lunes). */
export function alLunes(d: Date): Date {
  const dow = d.getUTCDay(); // 0 domingo ... 1 lunes
  const delta = (8 - dow) % 7;
  return sumarDias(d, delta);
}

export interface Festivo {
  fecha: FechaCivil;
  nombre: string;
}

const FIJOS: [number, number, string][] = [
  [1, 1, 'Anio Nuevo'],
  [5, 1, 'Dia del Trabajo'],
  [7, 20, 'Dia de la Independencia'],
  [8, 7, 'Batalla de Boyaca'],
  [12, 8, 'Inmaculada Concepcion'],
  [12, 25, 'Navidad'],
];

const TRASLADABLES: [number, number, string][] = [
  [1, 6, 'Reyes Magos'],
  [3, 19, 'San Jose'],
  [6, 29, 'San Pedro y San Pablo'],
  [8, 15, 'Asuncion de la Virgen'],
  [10, 12, 'Dia de la Raza'],
  [11, 1, 'Todos los Santos'],
  [11, 11, 'Independencia de Cartagena'],
];

/** Festivos del anio, ordenados. Si dos coinciden, la fecha aparece una vez. */
export function festivosDe(anio: number): Festivo[] {
  const lista: Festivo[] = [];
  for (const [mes, dia, nombre] of FIJOS) {
    lista.push({ fecha: aCivil(fechaUtc(anio, mes, dia)), nombre });
  }
  for (const [mes, dia, nombre] of TRASLADABLES) {
    lista.push({ fecha: aCivil(alLunes(fechaUtc(anio, mes, dia))), nombre });
  }
  const pascua = domingoDePascua(anio);
  lista.push({ fecha: aCivil(sumarDias(pascua, -3)), nombre: 'Jueves Santo' });
  lista.push({ fecha: aCivil(sumarDias(pascua, -2)), nombre: 'Viernes Santo' });
  lista.push({ fecha: aCivil(sumarDias(pascua, 43)), nombre: 'Ascension del Senor' });
  lista.push({ fecha: aCivil(sumarDias(pascua, 64)), nombre: 'Corpus Christi' });
  lista.push({ fecha: aCivil(sumarDias(pascua, 71)), nombre: 'Sagrado Corazon' });

  // Unir coincidencias (p. ej. 2025: San Pedro y Sagrado Corazon el 30 de junio).
  const porFecha = new Map<FechaCivil, string[]>();
  for (const f of lista) porFecha.set(f.fecha, [...(porFecha.get(f.fecha) ?? []), f.nombre]);
  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, nombres]) => ({ fecha, nombre: nombres.join(' / ') }));
}

const cache = new Map<number, Set<FechaCivil>>();

export function esFestivo(f: FechaCivil): boolean {
  const anio = Number(f.slice(0, 4));
  if (!cache.has(anio)) cache.set(anio, new Set(festivosDe(anio).map((x) => x.fecha)));
  return cache.get(anio).has(f);
}
