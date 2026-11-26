import {
  AtributosOferta,
  AtributosPeticion,
  cajaParaOferta,
  cajaParaPeticion,
  esCompatible,
  motivoIncompatibilidad,
  puntoOferta,
  puntoPeticion,
} from './compatibilidad';
import { KdTreeAdaptativo, PuntoKd, rangoLineal } from './kdtree';

/** Generador reproducible: las pruebas no dependen de Math.random. */
function aleatorio(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const entero = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

describe('KdTreeAdaptativo: búsqueda por rango ortogonal', () => {
  it('coincide con el filtro lineal en 400 conjuntos aleatorios (k = 2..4, con empates)', () => {
    let discrepancias = 0;
    for (let caso = 0; caso < 400; caso++) {
      const r = aleatorio(caso + 1);
      const k = entero(r, 2, 4);
      const n = entero(r, 0, 250);
      const gran = caso % 3 === 0 ? 3 : 50; // un tercio con muchos valores repetidos
      const puntos: PuntoKd<null>[] = Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        coordenadas: Array.from({ length: k }, () => entero(r, 0, gran)),
        dato: null,
      }));
      const min = Array.from({ length: k }, () => entero(r, 0, gran));
      const max = min.map((m) => m + entero(r, 0, gran));
      const arbol = new KdTreeAdaptativo(puntos, k);
      const a = arbol.buscarRango(min, max).map((p) => p.id).join(',');
      const b = rangoLineal(puntos, min, max).map((p) => p.id).join(',');
      if (a !== b) discrepancias++;
    }
    expect(discrepancias).toBe(0);
  });

  it('poda: una consulta selectiva visita muy pocos nodos', () => {
    const r = aleatorio(99);
    const puntos: PuntoKd<null>[] = Array.from({ length: 5000 }, (_, i) => ({
      id: i + 1,
      coordenadas: [entero(r, 0, 1000), entero(r, 0, 1000), entero(r, 0, 1000)],
      dato: null,
    }));
    const arbol = new KdTreeAdaptativo(puntos, 3);
    arbol.buscarRango([100, 100, 100], [140, 140, 140]);
    expect(arbol.nodosVisitados).toBeLessThan(puntos.length * 0.1);
    expect(arbol.altura).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(puntos.length + 1)));
  });

  it('eje adaptativo: corta primero por la dimension de mayor dispersion', () => {
    // La dimension 1 varia de 0 a 1000; la 0 casi no varia.
    const puntos: PuntoKd<null>[] = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, coordenadas: [1, i * 20], dato: null }));
    const arbol = new KdTreeAdaptativo(puntos, 2);
    arbol.buscarRango([0, 0], [2, 2000], true);
    expect(arbol.traza[0].eje).toBe(1);
  });

  it('arbol vacio y validacion de dimensiones', () => {
    expect(new KdTreeAdaptativo([], 3).buscarRango([0, 0, 0], [1, 1, 1])).toEqual([]);
    expect(() => new KdTreeAdaptativo([{ id: 1, coordenadas: [1, 2], dato: null }], 3)).toThrow();
    expect(() => new KdTreeAdaptativo([], 3).buscarRango([0], [1])).toThrow();
  });

  it('la traza registra visita, pertenencia y decisiones de poda', () => {
    const puntos: PuntoKd<null>[] = [
      { id: 1, coordenadas: [1, 1], dato: null },
      { id: 2, coordenadas: [5, 5], dato: null },
      { id: 3, coordenadas: [9, 9], dato: null },
    ];
    const arbol = new KdTreeAdaptativo(puntos, 2);
    const r = arbol.buscarRango([4, 4], [6, 6], true);
    expect(r.map((p) => p.id)).toEqual([2]);
    expect(arbol.traza[0]).toMatchObject({ nodoId: 2, dentroDeLaCaja: true });
    expect(arbol.traza.length).toBe(arbol.nodosVisitados);
  });
});

describe('Compatibilidad con atributos reales (D-41)', () => {
  const pet = (estadoMinimo: number, medidaMin: number | null = null, medidaMax: number | null = null): AtributosPeticion => ({
    estadoMinimo,
    medidaMin,
    medidaMax,
  });
  const ofe = (estadoConservacion: number, medida: number | null = null): AtributosOferta => ({ estadoConservacion, medida });

  it('ejemplos del dominio', () => {
    expect(esCompatible(ofe(4, 3), pet(3, 2, 4))).toBe(true); // "como nuevo", talla M para quien acepta S-L
    expect(esCompatible(ofe(2, 3), pet(3, 2, 4))).toBe(false); // estado insuficiente
    expect(esCompatible(ofe(5, 6), pet(1, 2, 4))).toBe(false); // talla fuera de rango
    expect(esCompatible(ofe(3, null), pet(1))).toBe(true); // categoria sin medida
    expect(esCompatible(ofe(3, null), pet(1, 2, 4))).toBe(false); // medida desconocida: conservador
    expect(motivoIncompatibilidad(ofe(2, 3), pet(3))).toContain('estado mínimo 3');
  });

  it('la caja 3D de una oferta equivale al predicado, en 2000 pares aleatorios', () => {
    const r = aleatorio(5);
    for (let i = 0; i < 2000; i++) {
      const abierta = r() < 0.3;
      const a = entero(r, 1, 7);
      const p = pet(entero(r, 1, 5), abierta ? null : a, abierta ? null : entero(r, a, 7));
      const o = ofe(entero(r, 1, 5), r() < 0.1 ? null : entero(r, 1, 7));
      const caja = cajaParaOferta(o);
      const pt = puntoPeticion(p);
      const enCaja = pt.every((v, j) => v >= caja.min[j] && v <= caja.max[j]);
      expect(enCaja).toBe(esCompatible(o, p));
    }
  });

  it('la caja 2D de una petición (sentido inverso) equivale al predicado, en 2000 pares', () => {
    const r = aleatorio(6);
    for (let i = 0; i < 2000; i++) {
      const tipo = r();
      const a = entero(r, 1, 7);
      const p =
        tipo < 0.3 ? pet(entero(r, 1, 5)) : tipo < 0.5 ? pet(entero(r, 1, 5), a, null) : pet(entero(r, 1, 5), a, entero(r, a, 7));
      const o = ofe(entero(r, 1, 5), r() < 0.1 ? null : entero(r, 1, 7));
      const caja = cajaParaPeticion(p);
      const pt = puntoOferta(o);
      const enCaja = pt.every((v, j) => v >= caja.min[j] && v <= caja.max[j]);
      expect(enCaja).toBe(esCompatible(o, p));
    }
  });

  it('la categoría nunca es una coordenada: los puntos solo tienen atributos del producto', () => {
    expect(puntoPeticion(pet(3, 2, 4))).toHaveLength(3);
    expect(puntoOferta(ofe(3, 2))).toHaveLength(2);
  });
});
