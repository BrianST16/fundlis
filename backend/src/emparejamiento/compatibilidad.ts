/**
 * COMPATIBILIDAD entre ofertas y peticiones (D-41), con atributos REALES:
 *
 *  - categoria: condicion de IGUALDAD exacta (se filtra antes del arbol;
 *    un id de categoria nunca es una coordenada ni una distancia);
 *  - estado de conservacion (ordinal 1..5): la oferta declara su estado,
 *    la peticion el minimo que acepta  ->  oferta.estado >= peticion.minimo;
 *  - medida de la categoria (p. ej. talla), si la categoria la usa: la
 *    oferta declara su valor, la peticion un rango aceptable
 *        ->  peticion.medidaMin <= oferta.medida <= peticion.medidaMax.
 *
 * Una peticion es un INTERVALO (minimo de estado, rango de medida) y una
 * oferta es un PUNTO. La contencion "intervalo contiene punto" se convierte
 * en una consulta de RANGO ORTOGONAL indexando cada peticion como el punto
 *        (estadoMinimo, medidaMin, medidaMax)          (3 dimensiones)
 * y consultando con la caja
 *        estadoMinimo in [1, oferta.estado]
 *        medidaMin    in [-INF, oferta.medida]
 *        medidaMax    in [oferta.medida, +INF].
 * Es la tecnica clasica de reducir intervalos a puntos de mayor dimension.
 *
 * En sentido inverso (ofertas compatibles con una peticion) cada oferta es
 * el punto (estado, medida) en 2 dimensiones y la caja es
 *        estado in [peticion.estadoMinimo, 5],  medida in [medidaMin, medidaMax].
 *
 * Medida desconocida: una oferta sin medida solo es compatible con
 * peticiones que no restringen la medida (regla conservadora).
 */

export const SIN_LIMITE = 1e9;
export const ESTADO_MIN = 1;
export const ESTADO_MAX = 5;

export const ESTADOS_CONSERVACION: Record<number, string> = {
  1: 'Deteriorado / para reparar',
  2: 'Usado con desgaste visible',
  3: 'Usado en buen estado',
  4: 'Como nuevo',
  5: 'Nuevo',
};

export interface AtributosOferta {
  estadoConservacion: number;
  medida: number | null;
}

export interface AtributosPeticion {
  estadoMinimo: number;
  medidaMin: number | null;
  medidaMax: number | null;
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Punto 3D de una peticion. */
export function puntoPeticion(p: AtributosPeticion): number[] {
  return [Number(p.estadoMinimo), num(p.medidaMin) ?? -SIN_LIMITE, num(p.medidaMax) ?? SIN_LIMITE];
}

/** Caja 3D: peticiones compatibles con una oferta. */
export function cajaParaOferta(o: AtributosOferta): { min: number[]; max: number[] } {
  const m = num(o.medida);
  if (m === null) {
    // Medida desconocida: solo peticiones sin restriccion de medida.
    return { min: [ESTADO_MIN, -SIN_LIMITE, SIN_LIMITE], max: [Number(o.estadoConservacion), -SIN_LIMITE, SIN_LIMITE] };
  }
  return { min: [ESTADO_MIN, -SIN_LIMITE, m], max: [Number(o.estadoConservacion), m, SIN_LIMITE] };
}

/** Punto 2D de una oferta. */
export function puntoOferta(o: AtributosOferta): number[] {
  return [Number(o.estadoConservacion), num(o.medida) ?? -SIN_LIMITE];
}

/** Caja 2D: ofertas compatibles con una peticion. */
export function cajaParaPeticion(p: AtributosPeticion): { min: number[]; max: number[] } {
  const sinRango = num(p.medidaMin) === null && num(p.medidaMax) === null;
  return {
    min: [Number(p.estadoMinimo), sinRango ? -SIN_LIMITE : num(p.medidaMin) ?? -SIN_LIMITE + 1],
    max: [ESTADO_MAX, sinRango ? SIN_LIMITE : num(p.medidaMax) ?? SIN_LIMITE],
  };
}

/** Predicado directo (referencia y validacion al confirmar una asignacion). */
export function esCompatible(o: AtributosOferta, p: AtributosPeticion): boolean {
  if (Number(o.estadoConservacion) < Number(p.estadoMinimo)) return false;
  const m = num(o.medida);
  const min = num(p.medidaMin);
  const max = num(p.medidaMax);
  if (m === null) return min === null && max === null;
  return (min === null || min <= m) && (max === null || m <= max);
}

/** Motivo legible de incompatibilidad (para explicar al auxiliar). */
export function motivoIncompatibilidad(o: AtributosOferta, p: AtributosPeticion): string | null {
  if (Number(o.estadoConservacion) < Number(p.estadoMinimo)) {
    return `La petición exige estado mínimo ${p.estadoMinimo} y la oferta es ${o.estadoConservacion}.`;
  }
  const m = num(o.medida);
  const min = num(p.medidaMin);
  const max = num(p.medidaMax);
  if (m === null && (min !== null || max !== null)) return 'La oferta no declara la medida que la petición restringe.';
  if (m !== null && min !== null && m < min) return `La medida ${m} es menor que el mínimo ${min}.`;
  if (m !== null && max !== null && m > max) return `La medida ${m} es mayor que el máximo ${max}.`;
  return null;
}
