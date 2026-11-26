import { aCivil, desdeCivil, esFestivo, FechaCivil, sumarDias } from './festivos-colombia';

/**
 * DIAS HABILES DEL LIS (D-21, D-22, D-24).
 *
 * Un dia es habil si NO es sabado, NO es domingo, NO es festivo nacional
 * colombiano y NO esta dentro de un cierre configurado del LIS.
 *
 * Convencion de conteo [PROP, P-25]: el dia del evento que inicia el plazo
 * NO cuenta. "10 dias habiles desde la asignacion" vence al terminar el
 * decimo dia habil POSTERIOR a la fecha de asignacion, en hora de Bogota.
 */

export const ZONA_LIS = 'America/Bogota';

export interface RangoCierre {
  desde: FechaCivil;
  hasta: FechaCivil;
}

/** Fecha civil de un instante en la zona del LIS (Colombia, UTC-5 sin horario de verano). */
export function fechaEnBogota(instante: Date): FechaCivil {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_LIS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

export function enCierre(f: FechaCivil, cierres: RangoCierre[]): boolean {
  return cierres.some((c) => f >= c.desde && f <= c.hasta);
}

export function esHabil(f: FechaCivil, cierres: RangoCierre[] = []): boolean {
  const dow = desdeCivil(f).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (esFestivo(f)) return false;
  return !enCierre(f, cierres);
}

/** n-esimo dia habil posterior a la fecha dada. */
export function sumarDiasHabiles(desde: FechaCivil, n: number, cierres: RangoCierre[] = []): FechaCivil {
  if (!Number.isInteger(n) || n < 0) throw new Error('n debe ser un entero no negativo.');
  let d = desdeCivil(desde);
  let contados = 0;
  // Tope defensivo: un cierre mal configurado (p. ej. de anios) no debe
  // dejar el proceso en un bucle infinito.
  for (let guardia = 0; contados < n; guardia++) {
    if (guardia > 3660) throw new Error('No se encontraron días hábiles en 10 anios: revisa los cierres.');
    d = sumarDias(d, 1);
    if (esHabil(aCivil(d), cierres)) contados++;
  }
  return aCivil(d);
}

/** n-esimo dia habil ANTERIOR a la fecha dada (para anticipaciones). */
export function restarDiasHabiles(hasta: FechaCivil, n: number, cierres: RangoCierre[] = []): FechaCivil {
  if (!Number.isInteger(n) || n < 0) throw new Error('n debe ser un entero no negativo.');
  let d = desdeCivil(hasta);
  let contados = 0;
  for (let guardia = 0; contados < n; guardia++) {
    if (guardia > 3660) throw new Error('No se encontraron días hábiles en 10 anios: revisa los cierres.');
    d = sumarDias(d, -1);
    if (esHabil(aCivil(d), cierres)) contados++;
  }
  return aCivil(d);
}

/**
 * Dias habiles entre dos fechas civiles, contando desde el dia siguiente a
 * "desde" hasta "hasta" inclusive. Si "hasta" es anterior, el resultado es
 * negativo (dias habiles de retraso).
 */
export function diasHabilesEntre(desde: FechaCivil, hasta: FechaCivil, cierres: RangoCierre[] = []): number {
  if (desde === hasta) return 0;
  const signo = hasta > desde ? 1 : -1;
  const [ini, fin] = signo > 0 ? [desde, hasta] : [hasta, desde];
  let d = desdeCivil(ini);
  const limite = desdeCivil(fin).getTime();
  let n = 0;
  while (d.getTime() < limite) {
    d = sumarDias(d, 1);
    if (esHabil(aCivil(d), cierres)) n++;
  }
  return signo * n;
}
