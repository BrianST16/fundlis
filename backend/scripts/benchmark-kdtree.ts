/**
 * Benchmark REPRODUCIBLE del KD-tree de compatibilidad (D-41).
 *   cd backend && npx ts-node --transpile-only scripts/benchmark-kdtree.ts
 *
 * Datos sinteticos con semilla fija que imitan el dominio real:
 *   peticion = (estadoMinimo 1..5, talla minima, talla maxima) en escala 1..7;
 *              la mitad no restringe la talla (rango abierto).
 *   oferta   = (estado de conservacion 1..5, talla 1..7).
 *
 * Mide para cada n:
 *   A. filtro lineal con el predicado esCompatible (lo que haria un sistema sin arbol);
 *   B. construir el arbol + consultar (lo que hace hoy el servicio en cada peticion HTTP);
 *   C. consultar un arbol ya construido;
 *   D. construir una vez y atender Q = 100 consultas (costo amortizado por consulta).
 * Ademas comprueba en cada consulta que el arbol y el filtro lineal devuelven
 * EXACTAMENTE el mismo conjunto.
 */
import { cajaParaOferta, esCompatible, puntoPeticion } from '../src/emparejamiento/compatibilidad';
import { KdTreeAdaptativo, PuntoKd } from '../src/emparejamiento/kdtree';

function aleatorio(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const entero = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

interface Pet { id: number; estadoMinimo: number; medidaMin: number | null; medidaMax: number | null }
interface Ofe { estadoConservacion: number; medida: number | null }

/**
 * Escenario 1 "LIS actual": talla ordinal 1..7, la mitad sin restriccion
 *   -> consultas POCO selectivas (muchas peticiones compatibles).
 * Escenario 2 "selectivo": medida continua 1..100 (p. ej. capacidad o
 *   numero de calzado fino) con rangos estrechos (ancho <= 4) y estado
 *   minimo alto -> pocas peticiones compatibles por oferta.
 */
const ESCENARIO = (process.argv[2] ?? 'lis') as 'lis' | 'selectivo';

function peticiones(n: number, r: () => number): Pet[] {
  return Array.from({ length: n }, (_, i) => {
    if (ESCENARIO === 'selectivo') {
      const a = entero(r, 1, 96);
      return { id: i + 1, estadoMinimo: entero(r, 3, 5), medidaMin: a, medidaMax: a + entero(r, 0, 4) };
    }
    const abierta = r() < 0.5;
    const a = entero(r, 1, 7);
    const b = entero(r, a, 7);
    return { id: i + 1, estadoMinimo: entero(r, 1, 5), medidaMin: abierta ? null : a, medidaMax: abierta ? null : b };
  });
}

function ofertas(q: number, r: () => number): Ofe[] {
  return Array.from({ length: q }, () =>
    ESCENARIO === 'selectivo'
      ? { estadoConservacion: entero(r, 1, 5), medida: entero(r, 1, 100) }
      : { estadoConservacion: entero(r, 1, 5), medida: entero(r, 1, 7) },
  );
}

function medir(fn: () => void, repeticiones: number): number {
  fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < repeticiones; i++) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / repeticiones;
}

const Q = 100;
console.log(`Escenario: ${ESCENARIO}`);
console.log('n;A_lineal_ms;B_construir+consultar_ms;C_consulta_arbol_ms;D_amortizado_Q100_ms;construccion_ms;nodos_visitados_prom;%nodos;compatibles_prom;coinciden');
for (const n of [100, 1_000, 10_000, 100_000]) {
  const r = aleatorio(42);
  const pets = peticiones(n, r);
  const ofs = ofertas(Q, aleatorio(7));
  const puntos: PuntoKd<Pet>[] = pets.map((p) => ({ id: p.id, coordenadas: puntoPeticion(p), dato: p }));
  const rep = n <= 1_000 ? 50 : n <= 10_000 ? 10 : 3;

  // Verificacion de equivalencia en las Q consultas.
  const arbol = new KdTreeAdaptativo(puntos, 3);
  let coinciden = true;
  let visitados = 0;
  let compatibles = 0;
  for (const o of ofs) {
    const caja = cajaParaOferta(o);
    const delArbol = arbol.buscarRango(caja.min, caja.max).map((x) => x.id).join(',');
    visitados += arbol.nodosVisitados;
    const lineal = pets.filter((p) => esCompatible(o, p)).map((p) => p.id).join(',');
    compatibles += lineal ? lineal.split(',').length : 0;
    if (delArbol !== lineal) coinciden = false;
  }

  let k = 0;
  const siguiente = () => ofs[k++ % Q];
  const a = medir(() => { const o = siguiente(); pets.filter((p) => esCompatible(o, p)); }, rep * 5);
  const b = medir(() => { const o = siguiente(); const c = cajaParaOferta(o); new KdTreeAdaptativo(puntos, 3).buscarRango(c.min, c.max); }, rep);
  const c = medir(() => { const o = siguiente(); const cj = cajaParaOferta(o); arbol.buscarRango(cj.min, cj.max); }, rep * 5);
  const construccion = medir(() => new KdTreeAdaptativo(puntos, 3), rep);
  const d = construccion / Q + c;

  console.log(
    [n, a, b, c, d, construccion].map((x, i) => (i === 0 ? x : (x as number).toFixed(4))).join(';') +
      `;${(visitados / Q).toFixed(1)};${((100 * visitados) / Q / n).toFixed(2)};${(compatibles / Q).toFixed(1)};${coinciden}`,
  );
}
