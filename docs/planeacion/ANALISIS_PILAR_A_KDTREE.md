# Análisis del Pilar A: KD-tree (decisión H-2 / P-09)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-20 |
| Tarea | T6.1 del `PLAN_CIERRE_LIS.md` |
| Estado | Análisis técnico [PROP]. **No cambia el algoritmo productivo.** La decisión corresponde al equipo y al profesor. |
| Evidencia | `backend/src/emparejamiento/kdtree.spec.ts` (7/7, exit 0) y `backend/scripts/benchmark-kdtree.ts` (ejecutado el 2026-11-20) |

## 1. Qué hace hoy el sistema [CÓD]

1. Filtra las peticiones por **categoría** (igualdad) y descarta las que ya tienen un intento vigente.
2. Construye un **KD-tree adaptativo** en cada consulta. Cada nodo corta por el eje de mayor dispersión y por la mediana. Los puntos tienen tres coordenadas en [0,1]: caracterización, Sisbén y antigüedad.
3. Busca los *k* puntos más cercanos al **punto fijo (1,1,1)** con la distancia euclídea ponderada d(p) = √(Σ wᵢ(1−pᵢ)²). La prioridad es 1 − d(p).
4. Compara el resultado con una búsqueda lineal en cada consulta y lo muestra en la UI.
5. El auxiliar confirma el beneficiario y la cantidad (decisión humana).

**Corrección verificada:** las 7 pruebas pasan. El árbol coincide elemento por elemento con la búsqueda lineal en 400 conjuntos aleatorios, incluidos casos con empates.

## 2. Benchmark (datos sintéticos uniformes, semilla 42, k = 10)

Equipo: Node 24.21, Intel Core i7-1255U. Tiempos en ms por consulta (promedio).

| n | A. lineal + ordenar todo | B. lineal top-k | C. construir árbol + consultar (**actual**) | D. consultar árbol ya construido | Nodos visitados (D) | Coincide con lineal |
|---:|---:|---:|---:|---:|---:|:---:|
| 100 | 0,026 | 0,009 | 0,064 | 0,005 | 48 (48 %) | sí |
| 1.000 | 0,177 | 0,025 | 1,002 | 0,002 | 44 (4,4 %) | sí |
| 10.000 | 2,381 | 0,090 | 18,224 | 0,002 | 36 (0,36 %) | sí |
| 100.000 | 54,563 | 1,212 | 259,157 | 0,021 | 24 (0,02 %) | sí |

**Lectura:**

1. **Como se usa hoy (C), el árbol es la opción más lenta:** con n = 100.000 es unas 200 veces más lento que un recorrido lineal top-k (B). La construcción O(n log² n) domina, y la métrica "nodos visitados" que muestra la UI no la incluye. El dato "21,8 %" del README no se reproduce con esta métrica y se retira.
2. **Consultar un árbol ya construido (D) sí es muy eficiente:** visita solo una fracción ínfima de los nodos. El árbol aporta valor real **solo si se reutiliza** entre consultas.
3. **El problema conceptual sigue:** la consulta es siempre el mismo punto (1,1,1) y d(p) es una función escalar de cada punto. Ordenar por d(p) resuelve exactamente lo mismo en O(n log k). Un evaluador puede describirlo como un "ordenamiento disfrazado de búsqueda espacial".
4. El volumen real del LIS (decenas o cientos de peticiones por categoría) hace que cualquier variante sea instantánea. **El argumento académico no puede ser el rendimiento:** tiene que ser la **adecuación de la estructura al problema**.

## 3. Lo que pide la directriz [PROF]

> §7: "1. Filtrar ofertas/peticiones compatibles, comenzando por categoría y disponibilidad. Definir otras dimensiones reales (tipo, talla, características) sin convertir identificadores de categoría en distancias numéricas. 2. Implementar un árbol KD adaptativo o un árbol R… 3. Calcular prioridad por tres variables… 4. El motor sugiere el orden; auxiliar/administrador valida."

La directriz separa **compatibilidad** (pasos 1 y 2, el árbol) de **prioridad** (paso 3, el orden). La implementación actual fusiona los dos pasos: el árbol indexa la prioridad.

## 4. Alternativas

| | (A) Reforzar el árbol de prioridad | (B) Árbol de compatibilidad + prioridad como orden (**hipótesis recomendada**) |
|---|---|---|
| Qué indexa el árbol | Caracterización, Sisbén, antigüedad | Atributos **reales del producto y de la necesidad** dentro de cada categoría (p. ej. talla numérica, estado de conservación 1–5, rango de uso o especificación numérica) |
| Consulta | k-NN al punto ideal + consultas por **rango o umbral** ("caracterización ≥ 0,8 y Sisbén A–B") | **Búsqueda por rango o vecindad** desde los atributos de la oferta: "peticiones compatibles con este producto". Después se ordena por prioridad. |
| Cambios de datos | Ninguno | Atributos de compatibilidad en OFERTA y PETICION, por categoría (esquema nuevo, requiere H-9) |
| Ventaja | Sin cambios de esquema; con caché por categoría el árbol sí rinde (columna D) | Cumple la directriz literalmente; la búsqueda espacial resuelve un problema que un orden escalar no resuelve |
| Riesgo | Sigue siendo discutible que sea "compatibilidad" | Hay que definir qué atributos tiene cada categoría (decisión de negocio) y pedirlos en los formularios |
| Esfuerzo | Bajo | Medio |

### Diseño propuesto para (B)

1. `CATEGORIA_ATRIBUTO`: atributos numéricos u ordinales por categoría, con rango y tolerancia. Ejemplos:
   - Ropa: talla (escala ordinal) y estado.
   - Tecnología: RAM en GB y antigüedad del equipo.
2. La oferta declara **valores**; la petición declara **requisitos** (mínimo, máximo o valor deseado). La petición sigue sin cantidad.
3. Un árbol por categoría sobre los valores normalizados de las **peticiones**, **cacheado** e invalidado cuando una petición se aprueba, cierra o asigna.
4. La consulta por **rango** con los valores de la oferta devuelve las peticiones compatibles; si no hay compatibles exactas, el **k-NN** devuelve las más cercanas.
5. Las compatibles se ordenan por **prioridad** (caracterización, Sisbén, antigüedad) con la fórmula actual, que ya está probada.
6. LOCAL siempre al final (T6.3).
7. Pruebas: equivalencia con el filtro lineal por rango y benchmark que incluya la construcción y la reutilización.

## 5. Recomendación

1. **Pedir al profesor** que confirme el enfoque (B) y que diga qué atributos de compatibilidad espera por categoría.
2. Mientras tanto se mantiene el algoritmo actual (correcto y probado) y se documenta en la sustentación **con sus límites**. El benchmark de este documento es la evidencia.
3. Si el profesor acepta (A): implementar la caché del árbol por categoría y las consultas por rango (sin esquema nuevo). Retirar de la UI la métrica de nodos visitados sin el costo de construcción, o mostrar ambas.

## 6. Pregunta concreta para el profesor

> "Nuestro motor filtra por categoría y ordena por prioridad (caracterización, Sisbén, antigüedad). Hoy el KD-tree indexa esas tres variables de prioridad. ¿Espera que el árbol indexe **atributos de compatibilidad del producto** (talla, estado, especificaciones) y que la prioridad solo ordene a los compatibles? Si es así, ¿qué atributos considera mínimos por categoría?"
