/**
 * KD-TREE ADAPTATIVO CON BUSQUEDA POR RANGO (Pilar A, D-41).
 * =========================================================================
 *
 * Que resuelve
 * ------------
 * Dentro de una categoria (filtrada por IGUALDAD, nunca como distancia),
 * encontrar los elementos cuyos atributos de compatibilidad caen dentro de
 * una "caja" k-dimensional:  min[i] <= x[i] <= max[i]  para todo i.
 * Ejemplo (ver compatibilidad.ts): las peticiones compatibles con una oferta
 * son las que exigen un estado minimo <= el estado de la oferta y aceptan un
 * rango de talla que contiene la talla de la oferta. Eso es una consulta de
 * rango ortogonal en 3 dimensiones, que un ordenamiento por un solo puntaje
 * no puede resolver.
 *
 * Construccion (adaptativa)
 * -------------------------
 * Un KD-tree clasico alterna los ejes en orden fijo (0,1,2,0,...). Este elige
 * en cada nodo el eje de MAYOR DISPERSION (max - min) del subconjunto y corta
 * por la MEDIANA de ese eje. El punto mediano queda en el nodo; los menores o
 * iguales a la izquierda y los mayores o iguales a la derecha.
 *
 * Consulta por rango
 * ------------------
 * En cada nodo con eje e y valor v = punto[e]:
 *  - si el punto esta dentro de la caja, se reporta;
 *  - se baja a la izquierda solo si min[e] <= v (alli todo es <= v);
 *  - se baja a la derecha  solo si max[e] >= v (alli todo es >= v).
 * Las ramas que no pueden intersectar la caja se PODAN.
 *
 * Complejidad (n puntos, k dimensiones, m resultados)
 * ---------------------------------------------------
 *  construccion: O(n log^2 n) con esta implementacion (ordena en cada nivel);
 *  consulta:     O(n^(1-1/k) + m) en el peor caso para un arbol balanceado
 *                (resultado clasico de Lee y Wong, 1977); mucho menos cuando
 *                la caja es selectiva. Peor caso degenerado: O(n).
 *  memoria:      O(n).
 * El costo real se mide en scripts/benchmark-kdtree.ts, INCLUYENDO la
 * construccion, frente a un filtro lineal O(n).
 */

export interface PuntoKd<T> {
  id: number;
  coordenadas: number[];
  dato: T;
}

interface Nodo<T> {
  punto: PuntoKd<T>;
  eje: number;
  izquierdo: Nodo<T> | null;
  derecho: Nodo<T> | null;
}

/** Traza de una consulta, para la explicacion paso a paso. */
export interface PasoTraza {
  nodoId: number;
  eje: number;
  valor: number;
  dentroDeLaCaja: boolean;
  bajaIzquierda: boolean;
  bajaDerecha: boolean;
}

export class KdTreeAdaptativo<T> {
  private readonly raiz: Nodo<T> | null;
  private alturaArbol = 0;
  /** Nodos visitados en la ultima consulta (metrica del benchmark). */
  nodosVisitados = 0;
  /** Traza de la ultima consulta (solo si se pidio). */
  traza: PasoTraza[] = [];

  constructor(
    puntos: PuntoKd<T>[],
    readonly dimensiones: number,
  ) {
    for (const p of puntos) {
      if (p.coordenadas.length !== dimensiones || p.coordenadas.some((c) => Number.isNaN(c))) {
        throw new Error(`El punto ${p.id} no tiene ${dimensiones} coordenadas numericas.`);
      }
    }
    this.raiz = this.construir([...puntos], 0);
  }

  get altura(): number {
    return this.alturaArbol;
  }

  /** Eje de mayor dispersion: alli la particion separa mejor los datos. */
  private ejeDeMayorDispersion(puntos: PuntoKd<T>[]): number {
    let mejorEje = 0;
    let mejor = -1;
    for (let e = 0; e < this.dimensiones; e++) {
      let min = Infinity;
      let max = -Infinity;
      for (const p of puntos) {
        const v = p.coordenadas[e];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max - min > mejor) {
        mejor = max - min;
        mejorEje = e;
      }
    }
    return mejorEje;
  }

  private construir(puntos: PuntoKd<T>[], profundidad: number): Nodo<T> | null {
    if (!puntos.length) return null;
    if (profundidad + 1 > this.alturaArbol) this.alturaArbol = profundidad + 1;
    const eje = this.ejeDeMayorDispersion(puntos);
    puntos.sort((a, b) => a.coordenadas[eje] - b.coordenadas[eje] || a.id - b.id);
    const medio = Math.floor(puntos.length / 2);
    return {
      punto: puntos[medio],
      eje,
      izquierdo: this.construir(puntos.slice(0, medio), profundidad + 1),
      derecho: this.construir(puntos.slice(medio + 1), profundidad + 1),
    };
  }

  /** Todos los puntos con min[i] <= x[i] <= max[i]. Resultado ordenado por id. */
  buscarRango(min: number[], max: number[], conTraza = false): PuntoKd<T>[] {
    if (min.length !== this.dimensiones || max.length !== this.dimensiones) {
      throw new Error('La caja de consulta no tiene las dimensiones del arbol.');
    }
    this.nodosVisitados = 0;
    this.traza = [];
    const salida: PuntoKd<T>[] = [];

    const visitar = (nodo: Nodo<T> | null) => {
      if (!nodo) return;
      this.nodosVisitados++;
      const c = nodo.punto.coordenadas;
      const dentro = c.every((v, i) => v >= min[i] && v <= max[i]);
      if (dentro) salida.push(nodo.punto);

      const v = c[nodo.eje];
      const izq = min[nodo.eje] <= v;
      const der = max[nodo.eje] >= v;
      if (conTraza) {
        this.traza.push({ nodoId: nodo.punto.id, eje: nodo.eje, valor: v, dentroDeLaCaja: dentro, bajaIzquierda: izq, bajaDerecha: der });
      }
      if (izq) visitar(nodo.izquierdo);
      if (der) visitar(nodo.derecho);
    };

    visitar(this.raiz);
    return salida.sort((a, b) => a.id - b.id);
  }
}

/** Referencia lineal O(n): mismo criterio, para verificar el arbol. */
export function rangoLineal<T>(puntos: PuntoKd<T>[], min: number[], max: number[]): PuntoKd<T>[] {
  return puntos
    .filter((p) => p.coordenadas.every((v, i) => v >= min[i] && v <= max[i]))
    .sort((a, b) => a.id - b.id);
}
