/**
 * PUNTAJE DE PRIORIDAD SOCIOECONOMICA (D-38). Se aplica DESPUES de la
 * busqueda de compatibilidad, solo para ordenar a los candidatos compatibles.
 *
 * Escala documentada: cada componente es un numero real en [0, 1] y el total
 * tambien esta en [0, 1] (1 = mayor necesidad). NO es un porcentaje: se
 * muestra como numero con tres decimales (p. ej. 0,734).
 *
 *   S = puntaje Sisben del grupo elegido (tabla GRUPO_SISBEN.puntaje_necesidad;
 *       equivalencia definida por el PROYECTO, no por el DNP).
 *   C = puntaje de caracterizacion (promedio ponderado de las opciones
 *       elegidas, calculado en el backend).
 *   A = antiguedad = min(1, dias naturales desde la fecha ORIGINAL de la
 *       peticion / H), con H = HORIZONTE_ANTIGUEDAD_DIAS (90 por defecto).
 *       Es ESTABLE: no depende de las demas peticiones de la consulta, y
 *       la fecha original se conserva cuando la peticion se reactiva (D-15).
 *
 *   P = kC * C + kS * S + kA * A,  con kC + kS + kA = 1 (factores numericos
 *       configurables en PARAMETRO; por defecto 0,5 / 0,3 / 0,2).
 *
 * Como los tres componentes viven en la misma escala [0,1], ninguno domina
 * por tener un rango mayor: el peso relativo lo deciden SOLO los
 * coeficientes, que estan documentados y son configurables.
 */

export interface Coeficientes {
  caracterizacion: number;
  sisben: number;
  antiguedad: number;
  horizonteDias: number;
}

export interface Componentes {
  sisben: number;
  caracterizacion: number;
  antiguedad: number;
}

export interface Prioridad extends Componentes {
  total: number;
}

const r6 = (x: number) => Number(x.toFixed(6));
const acotar = (x: number) => Math.min(1, Math.max(0, x));

export function normalizarCoeficientes(c: Coeficientes): Coeficientes {
  const suma = c.caracterizacion + c.sisben + c.antiguedad;
  if (!(suma > 0)) return { caracterizacion: 0.5, sisben: 0.3, antiguedad: 0.2, horizonteDias: c.horizonteDias || 90 };
  return {
    caracterizacion: c.caracterizacion / suma,
    sisben: c.sisben / suma,
    antiguedad: c.antiguedad / suma,
    horizonteDias: c.horizonteDias > 0 ? c.horizonteDias : 90,
  };
}

export function componenteAntiguedad(creadaEn: Date, ahora: Date, horizonteDias: number): number {
  const dias = (ahora.getTime() - new Date(creadaEn).getTime()) / 86_400_000;
  return r6(acotar(dias / horizonteDias));
}

export function calcularPrioridad(
  datos: { puntajeSisben: number; puntajeCaracterizacion: number; creadaEn: Date },
  coeficientes: Coeficientes,
  ahora: Date,
): Prioridad {
  const k = normalizarCoeficientes(coeficientes);
  const sisben = r6(acotar(Number(datos.puntajeSisben)));
  const caracterizacion = r6(acotar(Number(datos.puntajeCaracterizacion)));
  const antiguedad = componenteAntiguedad(datos.creadaEn, ahora, k.horizonteDias);
  return {
    sisben,
    caracterizacion,
    antiguedad,
    total: r6(k.caracterizacion * caracterizacion + k.sisben * sisben + k.antiguedad * antiguedad),
  };
}

/** Orden total y reproducible: mayor prioridad, luego la peticion mas antigua, luego id. */
export function compararPrioridad(
  a: { prioridad: Prioridad; creadaEn: Date; peticionId: number },
  b: { prioridad: Prioridad; creadaEn: Date; peticionId: number },
): number {
  return (
    b.prioridad.total - a.prioridad.total ||
    new Date(a.creadaEn).getTime() - new Date(b.creadaEn).getTime() ||
    a.peticionId - b.peticionId
  );
}

/** Texto compacto de los coeficientes usados (se guarda con la asignacion). */
export function describirCoeficientes(c: Coeficientes): string {
  const k = normalizarCoeficientes(c);
  return `kC=${k.caracterizacion.toFixed(4)};kS=${k.sisben.toFixed(4)};kA=${k.antiguedad.toFixed(4)};H=${k.horizonteDias}`;
}
