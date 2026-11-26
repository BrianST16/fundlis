# Análisis del Pilar A: KD-tree adaptativo de compatibilidad

| Campo | Valor |
|---|---|
| Fecha | 2026-11-26 (reemplaza la versión del 2026-11-20, que analizaba el árbol de prioridad ya retirado) |
| Decisión vigente | **D-41**: el árbol busca **compatibilidad** sobre atributos reales del producto; la categoría se filtra por igualdad, nunca como distancia; la prioridad (D-38) ordena después a los compatibles. Resuelve H-2 y P-09. |
| Código | `backend/src/emparejamiento/kdtree.ts`, `compatibilidad.ts`, `prioridad.ts`, `emparejamiento.service.ts` |
| Evidencia | `kdtree.spec.ts` (9 casos) y `prioridad.spec.ts` (6), dentro de 237/237 pruebas; `backend/scripts/benchmark-kdtree.ts` ejecutado el 2026-11-26 en los escenarios `lis` y `selectivo` |

## 1. Qué problema resuelve

Cuando el LIS elige una donación para emparejar, debe encontrar las peticiones **compatibles** con ella:

1. **Misma categoría.** Es una condición de igualdad. No tiene sentido medir la "distancia" entre *Tecnología* y *Ropa*.
2. **Estado de conservación.** Cada petición exige un estado mínimo (1 a 5) y la oferta declara su estado.
3. **Medida o talla**, cuando la categoría la usa (`CATEGORIA.medida_nombre`). La petición acepta un rango `[medidaMin, medidaMax]`, abierto si no lo restringe. La oferta declara un valor.

Una petición es compatible con la oferta *o* cuando se cumplen las tres condiciones:

```
estadoMinimo(p) ≤ estado(o)   y   medidaMin(p) ≤ medida(o) ≤ medidaMax(p)
```

Cada petición es un **punto en 3 dimensiones**: `(estadoMinimo, medidaMin, medidaMax)`. Un rango abierto se representa con ±10⁹ (`SIN_LIMITE`). Las condiciones anteriores equivalen a que ese punto caiga dentro de una **caja**:

```
estadoMinimo ∈ [1, estado(o)]
medidaMin    ∈ [−∞, medida(o)]
medidaMax    ∈ [medida(o), +∞]
```

Esto es una **búsqueda por rango ortogonal**, el problema para el que existe el KD-tree. Un orden por un solo puntaje no lo resuelve, porque las tres condiciones son independientes. Por eso se usa el árbol para la compatibilidad y la fórmula de prioridad solo para ordenar.

Si la oferta no declara medida, solo son compatibles las peticiones que tampoco la restringen. Es la regla conservadora de `cajaParaOferta`.

## 2. Cómo funciona el árbol

**Construcción adaptativa** (`KdTreeAdaptativo`):

- Un KD-tree clásico alterna los ejes en orden fijo (0, 1, 2, 0…).
- Este elige en cada nodo el **eje de mayor dispersión** (máximo − mínimo) del subconjunto y corta por la **mediana**. El punto mediano queda en el nodo.
- Resultado: un árbol balanceado de altura ⌈log₂(n+1)⌉.

**Consulta por rango** (`buscarRango(min, max)`), en cada nodo con eje *e* y valor *v*:

1. Si el punto está dentro de la caja, se reporta.
2. Se baja a la izquierda solo si `min[e] ≤ v`, porque allí todo es ≤ v.
3. Se baja a la derecha solo si `max[e] ≥ v`, porque allí todo es ≥ v.

Las ramas que no pueden tocar la caja **se podan**.

**Complejidad** (n peticiones, k = 3 dimensiones, m resultados):

| Operación | Costo |
|---|---|
| Construcción (implementación actual, ordena en cada nivel) | O(n log² n) |
| Consulta, árbol balanceado | O(n^(1−1/k) + m) en el peor caso (Lee y Wong, 1977) |
| Memoria | O(n) |

**Sentido inverso.** Desde una petición se buscan las ofertas compatibles con un árbol de 2 dimensiones: la oferta es el punto `(estado, medida)` y la petición la caja (`ofertasParaPeticion`, `GET /api/emparejamiento/peticion/:id`).

**Flujo completo** (`emparejamiento.service.ts`):

1. Filtra por categoría (igualdad).
2. Descarta las peticiones con un intento vigente y las de cuentas bloqueadas.
3. Construye el árbol y consulta la caja de la oferta.
4. **Verifica** el resultado contra el filtro lineal `rangoLineal` en cada consulta.
5. Ordena los compatibles por prioridad: P = 0,5·C + 0,3·S + 0,2·A, con A = min(1, días/90) (D-38).
6. Pone **Local** siempre al final (D-19).
7. El auxiliar confirma el beneficiario y la cantidad. **La decisión es humana.**

La respuesta incluye un diagnóstico que se ve en la pantalla *Emparejamiento*:

- `msConstruccion` y `msConsulta`;
- `nodosVisitados` y altura del árbol;
- cuántas peticiones de la categoría son compatibles y cuántas se excluyeron;
- la caja de búsqueda (`cajaMin`, `cajaMax`);
- `coincideConFiltroLineal`.

## 3. ¿Se aplica correctamente? Sí, con evidencia

| Comprobación | Resultado |
|---|---|
| `kdtree.spec.ts`, 9 casos en verde (2026-11-26, dentro de 237/237): <br>• árbol = filtro lineal en 400 conjuntos aleatorios (k = 2 a 4, con empates); <br>• poda en consulta selectiva; <br>• eje adaptativo; <br>• árbol vacío y validación de dimensiones; <br>• traza de poda; <br>• caja 3D y caja 2D = predicado de compatibilidad en 2.000 pares cada una; <br>• la categoría nunca es coordenada; <br>• ejemplos del dominio | 9/9 |
| Benchmark, 8 configuraciones (2 escenarios × 4 tamaños) | `coinciden = true` en todas |
| Producción: cada consulta compara árbol y lineal | `coincideConFiltroLineal` visible en la UI |
| Datos de demostración (`03_demo_presentacion.sql`, chaqueta) | 2 compatibles y 2 excluidas, por estado y por talla |

Con la decisión D-41, el árbol ya **no** es un "ordenamiento disfrazado": la versión del 2026-11-20 indexaba la prioridad y consultaba siempre el punto fijo (1,1,1). Ahora resuelve una consulta multidimensional que el orden por puntaje no puede resolver.

## 4. Benchmark (2026-11-26)

Comando, desde `backend/`:

```bash
npx ts-node --transpile-only scripts/benchmark-kdtree.ts [lis|selectivo]
```

Tiempos promedio en ms por consulta. Semilla fija.

| Columna | Qué mide |
|---|---|
| **A** | Filtro lineal |
| **B** | Construir árbol + consultar: es lo que hace hoy el servicio |
| **C** | Solo consultar un árbol ya construido |
| **D** | Construir una vez y consultar 100 veces, costo por consulta |

### Escenario `lis`: datos como los del LIS

Talla ordinal 1–7, la mitad de las peticiones sin restricción y estado mínimo 1–5. Resultado: **~42 % de las peticiones son compatibles con cada oferta**.

| n | A lineal | B construir + consultar | C solo consulta | D amortizado (Q = 100) | Construcción | Nodos visitados | Compatibles | Coinciden |
|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| 100 | 0,008 | 0,241 | 0,015 | 0,016 | 0,063 | 63 % | 42 | sí |
| 1.000 | 0,033 | 1,555 | 0,139 | 0,152 | 1,351 | 50 % | 421 | sí |
| 10.000 | 0,352 | 19,756 | 1,342 | 1,511 | 16,962 | 45 % | 4.190 | sí |
| 100.000 | 3,867 | 297,550 | 25,209 | 27,658 | 244,948 | 44 % | 41.947 | sí |

### Escenario `selectivo`: medida continua 1–100 con rangos estrechos

Ancho del rango ≤ 4 y estado mínimo alto. Resultado: **~1 % de las peticiones son compatibles**.

| n | A lineal | B construir + consultar | C solo consulta | D amortizado (Q = 100) | Construcción | Nodos visitados | Compatibles | Coinciden |
|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| 100 | 0,006 | 0,225 | 0,010 | 0,010 | 0,082 | 25 % | 1 | sí |
| 1.000 | 0,020 | 1,714 | 0,006 | 0,023 | 1,696 | 9,6 % | 12 | sí |
| 10.000 | 0,195 | 29,671 | **0,075** | 0,355 | 27,969 | 4,5 % | 126 | sí |
| 100.000 | 1,872 | 427,005 | **0,891** | 5,058 | 416,685 | 3,0 % | 1.261 | sí |

### Cómo leerlo (para la sustentación)

1. **La poda funciona y crece con el tamaño.** Con consultas selectivas, el árbol visita solo el **3 % de los nodos** con n = 100.000, y la consulta pura (C) es **2,1 veces más rápida** que el filtro lineal. Es el comportamiento sublineal que predice la teoría.
2. **Con los datos del LIS, el resultado es casi la mitad del conjunto.** Si el 42 % de las peticiones son compatibles, ningún índice puede visitar menos del 42 % de los nodos: el costo está acotado por m, el tamaño de la salida. El árbol visita el 44 %, prácticamente el óptimo. El filtro lineal gana por factores constantes: un `filter` sobre un arreglo contiguo contra una recursión con objetos.
3. **Hoy el costo lo domina la construcción.** El servicio reconstruye el árbol en cada consulta (columna B). Con n = 1.000, construir toma 1,35 de los 1,55 ms. La construcción es O(n log² n) porque ordena y copia (`slice`) en cada nivel.
4. **Para el volumen real del LIS no importa.** Con decenas o cientos de peticiones por categoría, todo tarda menos de 2 ms. El argumento académico es la **adecuación de la estructura** a un problema de rango multidimensional, más la verificación en cada consulta. No es la velocidad a esta escala.
5. Las cifras de la versión anterior de este documento (0,02 % de nodos, 24 de 100.000) correspondían al árbol de prioridad con k-NN y **no aplican** al árbol actual.

## 5. Debilidades detectadas

| ID | Debilidad | Efecto |
|---|---|---|
| K1 | **Se reconstruye en cada consulta.** | La construcción es el 85–98 % del tiempo. La UI muestra `msConstruccion` aparte, pero el costo existe. |
| K2 | **El centinela ±10⁹ distorsiona el eje adaptativo.** Si un subconjunto tiene una sola petición sin rango, la dispersión de `medidaMin` y `medidaMax` pasa a ~10⁹. | El árbol casi nunca corta por `estadoMinimo`, aunque sea el eje que mejor separa. Lo "adaptativo" queda neutralizado en datos como los del LIS: el resultado sigue siendo **correcto**, pero se poda menos. |
| K3 | **Construcción O(n log² n)** con `sort` + `slice` por nivel. | Con n = 100.000 tarda 245–417 ms. Selección por mediana (quickselect) y partición en el mismo arreglo la bajan a O(n log n) esperado. |
| K4 | **Hojas de un solo punto.** | Mucha recursión y muchos objetos. Con "cubetas" de 8–16 puntos en las hojas se recorren menos nodos y se aprovecha el arreglo contiguo. |
| K5 | **El sentido inverso no se usa en la interfaz.** | `GET /api/emparejamiento/peticion/:id` existe y está probado, pero ninguna pantalla lo llama. En la sustentación solo se ve la mitad del pilar. |
| K6 | **Estado mínimo con solo 5 valores.** | Muchos empates en ese eje. No es un error, pero hace que la poda dependa sobre todo de la medida. |

## 6. Mejoras propuestas, en orden de valor para la sustentación

| # | Mejora | Qué resuelve | Esfuerzo | Riesgo |
|---|---|---|---|---|
| M1 | **Sentido inverso en *Emparejamiento*:** pestaña "Desde una petición" que muestra las donaciones compatibles (árbol 2D), con el mismo diagnóstico. | K5. El árbol se usa en los dos sentidos y se ve. | Bajo (solo frontend; el endpoint existe) | Bajo |
| M2 | **Corregir el eje adaptativo:** sustituir ±10⁹ por los límites reales del dominio (medida mínima − 1 y máxima + 1 de la categoría, o normalizar cada eje a [0,1]). Equivale a la misma caja, así que el resultado no cambia. | K2. El eje de mayor dispersión vuelve a tener sentido; más poda con los mismos datos. | Bajo (`compatibilidad.ts`) + pruebas | Bajo: la verificación lineal lo confirma en cada consulta |
| M3 | **Construcción O(n log n) con cubetas en las hojas:** quickselect sobre un arreglo de índices, sin `slice`, y hojas de hasta 8–16 puntos. | K3, K4. Construcción y consulta más rápidas (medir con el benchmark). | Medio (`kdtree.ts`) | Bajo: lo cubren `kdtree.spec.ts` y el benchmark |
| M4 | **Caché del árbol por categoría:** invalidarlo cuando una petición se aprueba, asigna, cierra, cancela o cambia la cuenta. | K1. Muchas consultas sobre el mismo árbol (columna D frente a B: ~10 veces menos tiempo con n = 1.000). | Medio: la invalidación toca varios servicios. Con un solo proceso basta un `Map` en memoria. | Medio: un árbol desactualizado daría candidatos viejos. Se mitiga porque cada consulta se verifica contra el filtro lineal y la asignación revalida en su transacción. |
| M5 | **Insignia en *Aprobaciones*:** "N peticiones compatibles" junto a cada donación por aprobar, calculada con el árbol. | Uso adicional y visible del pilar. Ayuda a decidir. | Bajo–medio | Bajo |

**Recomendación:**

1. Aplicar **M1 + M2** primero: poco riesgo y alto valor demostrativo.
2. Después **M3**, que da una mejora medible en el benchmark.
3. **M4** solo si se quiere defender el rendimiento a gran escala. A la escala del LIS no aporta y añade un riesgo de invalidación.

## 7. Preguntas probables y respuestas

- **¿Por qué no un filtro lineal, si con sus datos es más rápido?** Con 42 % de compatibles, cualquier método debe recorrer al menos ese 42 %: el árbol visita el 44 %. Cuando la consulta es selectiva, el árbol visita el 3 % y gana. La estructura escala; el lineal no. Además, el árbol se verifica contra el lineal en cada consulta.
- **¿Qué tiene de adaptativo?** Elige en cada nodo el eje de mayor dispersión, en lugar de alternarlos en orden fijo. Si se aplica M2, se puede mostrar el efecto en el benchmark.
- **¿Por qué KD-tree y no R-tree?** Las peticiones son puntos, no rectángulos, y el conjunto se reconstruye desde la BD. El KD-tree es más simple de construir balanceado y de verificar. El R-tree conviene cuando hay inserciones y borrados frecuentes sobre objetos con extensión.
- **¿La categoría es una dimensión?** No. Es un filtro por igualdad antes del árbol (D-41).
- **¿El algoritmo decide?** No. Propone y ordena; el auxiliar confirma el beneficiario y la cantidad.
