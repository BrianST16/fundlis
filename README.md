# LIS Dona — MVP funcional

Plataforma web de intermediación supervisada de donaciones y peticiones para el
Laboratorio Integrado de Sistemas (LIS) de la Universidad de Antioquia.

Tres componentes independientes:

| Componente | Tecnología | Puerto |
|---|---|---|
| Frontend | Angular (standalone components) | 4200 |
| Backend | NestJS + TypeScript + TypeORM | 3000 |
| Base de datos | SQL Server Express | 1433 |

> **Estado verificado (2026-11-20):** el backend y el frontend **compilan**
> (`npm run build`, exit 0) y el backend pasa **89/89 pruebas unitarias**
> (`npm test`, 8 suites, datos ficticios, sin BD). **Todavía no se ha
> ejecutado contra SQL Server ni en un navegador**: eso requiere confirmar una
> BD de desarrollo sin datos reales (decisión H-9). Los supuestos marcados como
> PROPUESTA no están aprobados por el equipo ni por el profesor. El estado por
> criterio está en `docs/planeacion/MATRIZ_CUMPLIMIENTO_RUBRICA.md`.

---

## 1. Puesta en marcha

### 1.1 Base de datos

No crees las tablas a mano. Ejecuta los dos scripts en orden:

```bash
sqlcmd -S localhost\SQLEXPRESS -E -i db/01_schema.sql
sqlcmd -S localhost\SQLEXPRESS -E -i db/02_seed.sql
```

O ábrelos en SSMS / Azure Data Studio y ejecútalos completos. El primero crea la
base `LisDona` con 12 tablas, sus llaves, CHECKs, índices, una vista de saldos y
una vista indexada que garantiza "una sola asignación vigente por petición". El
segundo carga los 51 grupos Sisbén, 7 categorías, 5 preguntas de caracterización
con sus opciones y los parámetros de configuración.

El seed termina imprimiendo un conteo: si ves `grupos_sisben = 51`, quedó bien.

### 1.2 Credenciales de Google

1. Entra a Google Cloud Console y crea un proyecto.
2. Configura la pantalla de consentimiento de OAuth.
3. Crea una credencial **ID de cliente de OAuth → Aplicación web**.
4. En *Orígenes autorizados de JavaScript* agrega `http://localhost:4200`.
5. Copia el Client ID. Va en **dos** sitios y debe ser idéntico:
   - `backend/.env` → `GOOGLE_CLIENT_ID`
   - `frontend/src/environments/environment.ts` → `googleClientId`

No hace falta Client Secret: el flujo usa el ID token de Google Identity
Services, que el backend verifica por firma.

### 1.3 Backend

```bash
cd backend
cp .env.example .env     # y complétalo
npm install
npm run start:dev
```

En `.env`, lo que no puede quedar con el valor de ejemplo:

- `DB_PASSWORD` — la clave de tu SQL Server.
- `GOOGLE_CLIENT_ID` — el del paso anterior.
- `JWT_SECRET` — genéralo con `openssl rand -hex 48`. El backend se niega a
  arrancar si tiene menos de 32 caracteres.
- `ADMIN_EMAILS` — **tu correo**. La primera vez que inicies sesión con esa
  cuenta recibes el rol ADMINISTRADOR automáticamente. Es el único rol que no
  otorga otra persona. Acepta varios separados por coma.

Comprueba que levantó: `http://localhost:3000/api/salud` debe responder
`{"estado":"ok","baseDatos":"conectada", ...}`.

### 1.4 Frontend

```bash
cd frontend
npm install
npm start
```

Abre `http://localhost:4200`.

> Las versiones en los `package.json` apuntan a Angular 20 y NestJS 11. Si tu
> equipo ya usa Angular 22 / NestJS 12, sube los rangos o corre
> `npm install <paquete>@latest`; el código no depende de nada específico de esas
> versiones.

---

## 2. Recorrido de la demostración

El flujo completo, en el orden en que conviene mostrarlo:

1. **Entra con tu correo de `ADMIN_EMAILS`.** Caes en *Aprobaciones* como
   administrador. En *Usuarios* puedes otorgar el rol `AUXILIAR_LIS` a otra
   cuenta si quieres separar los papeles en la demostración.
2. **Entra con una cuenta `@udea.edu.co`** (ventana de incógnito). El backend la
   clasifica como ESTUDIANTE. Completa *Mi caracterización* (5 preguntas y grupo
   Sisbén) y registra una o varias peticiones.
3. **Entra con una cuenta de Gmail cualquiera.** Entra como DONADOR. Publica una
   donación con categoría, cantidad y fotografía.
4. **Vuelve a la cuenta del LIS → Aprobaciones.** Aprueba la donación y las
   peticiones.
5. **Emparejamiento.** Elige la donación: el KD-tree propone los estudiantes
   compatibles ordenados por prioridad. En el encabezado se ve cuántos nodos
   visitó el árbol frente a la búsqueda lineal y una marca de verificación de que
   ambos coinciden. Fija la cantidad y confirma el beneficiario.
6. **Custodia y entregas → "Por recibir".** Registra la recepción física con foto
   y el nombre de quien entrega. La asignación pasa a EN_CUSTODIA.
7. **"En custodia" → Registrar entrega.** Con foto y nombre de quien recibe. La
   petición se cierra por entrega.

Para repartir una donación entre varios estudiantes, asigna cantidades parciales
de la misma oferta a peticiones distintas: el saldo se recalcula solo.

---

## 3. Modelo de datos

12 tablas. Las cantidades **no se almacenan**: se derivan de los intentos de
asignación, de modo que hay una sola fuente de verdad.

```
USUARIO ──< USUARIO_ROL
   │
   ├──< CARACTERIZACION ──< RESPUESTA_CARACTERIZACION >── OPCION_CARACTERIZACION
   │         │                                                    │
   │         └── GRUPO_SISBEN                      PREGUNTA_CARACTERIZACION
   │
   ├──< OFERTA >── CATEGORIA ──< PETICION >──┐
   │      │                                   │
   │      └──────< OFERTA_X_PETICION >────────┘
   │                     │
   │                     └──< MOVIMIENTO >── EVIDENCIA
   │
   └──< HISTORIAL_ESTADO                          PARAMETRO
```

### Máquinas de estado

**OFERTA**
`PENDIENTE_APROBACION` → `APROBADA` → `CERRADA`
`PENDIENTE_APROBACION` → `RECHAZADA` · `{PENDIENTE, APROBADA}` → `CANCELADA`

**PETICION**
`PENDIENTE_APROBACION` → `APROBADA` → `CERRADA_ENTREGA` | `CERRADA_INCUMPLIMIENTO`
`PENDIENTE_APROBACION` → `RECHAZADA` · `{PENDIENTE, APROBADA}` → `CANCELADA`

**OFERTA_X_PETICION**
`ASIGNADO` → `EN_CUSTODIA` → `ENTREGADO`
`EN_CUSTODIA` → `DEVOLUCION`
`{ASIGNADO, EN_CUSTODIA}` → `CANCELADO`

No hay recepción ni entrega parcial de una misma asignación: `CANCELADO` no
significa que el producto salió físicamente del LIS, y `DEVOLUCION` no es lo
mismo que cancelar el vínculo.

### Invariantes garantizadas

| Invariante | Dónde se garantiza |
|---|---|
| Σ cantidades asignadas ≤ cantidad de la oferta | transacción con bloqueo de filas en orden fijo |
| Una sola asignación vigente por petición | vista indexada `VW_OXP_VIGENTE` + comprobación en la transacción |
| Máximo 5 peticiones abiertas por estudiante | `MAX_PETICIONES_ACTIVAS` en `PARAMETRO`, verificado al crear |
| Toda recepción y entrega tiene fotografía | `MOVIMIENTO.evidencia_id NOT NULL` |
| Una petición activa fue revisada por alguien | `CK_PETICION_revision` |
| Quien aprueba no es quien publicó | comprobado en el servicio |
| Nunca queda la plataforma sin administradores | comprobado al revocar y al bloquear |

---

## 4. El pilar del algoritmo: KD-tree adaptativo

`backend/src/emparejamiento/kdtree.ts`

Un árbol por categoría. La categoría es una **condición de igualdad**, nunca una
distancia: no tiene sentido medir cuánto dista "Tecnología" de "Ropa y calzado".

Tres dimensiones reales, todas normalizadas a [0,1] donde 1 es mayor necesidad:

0. puntaje de caracterización socioeconómica
1. necesidad asociada al grupo Sisbén
2. antigüedad de la petición

El candidato ideal es el punto (1, 1, 1). Los candidatos se ordenan por distancia
euclídea ponderada a ese punto:

```
d(p) = √( Σ wᵢ · (1 − pᵢ)² )
```

Los pesos están en `PARAMETRO` (0.50 / 0.30 / 0.20 como propuesta) y se
normalizan para que sumen 1. Como las coordenadas están en [0,1] y los pesos
suman 1, la distancia máxima es 1, así que el puntaje de prioridad que ve el
auxiliar es `1 − d(p)`, dentro de [0,1].

**Por qué "adaptativo":** un KD-tree clásico alterna los ejes de corte en orden
fijo (0,1,2,0,1,2…). Esta versión elige en cada nodo el eje de **mayor
dispersión** del subconjunto y corta por su mediana. Con datos desbalanceados
—por ejemplo, si casi todos los estudiantes declaran el mismo grupo Sisbén— eso
produce particiones más útiles y menos nodos visitados.

**Complejidad:** construcción O(n log²n) con esta implementación; k-NN O(log n + k)
esperado y O(n) en el peor caso; memoria O(n).

**Verificación.** `kdtree.spec.ts` compara el árbol contra una búsqueda lineal de
referencia en 400 conjuntos aleatorios, un tercio de ellos con poca granularidad
para forzar empates. Resultado ejecutado el 2026-11-20: **0 discrepancias**
(7/7 pruebas). El desempate es un orden total explícito (distancia, luego
`peticionId`) precisamente para que ambos métodos sean comparables elemento por
elemento.

**Rendimiento y límites (benchmark del 2026-11-20).**
`backend/scripts/benchmark-kdtree.ts` muestra que consultar un árbol **ya
construido** visita una fracción mínima de los nodos (24 de 100.000). En cambio,
**reconstruirlo en cada consulta**, como hace hoy el servicio, es más lento
que un recorrido lineal top-k. Además, el árbol indexa variables de
**prioridad**, no de **compatibilidad**. Es una decisión abierta (H-2):
ver `docs/planeacion/ANALISIS_PILAR_A_KDTREE.md`. La cifra "21,8 %" de una
versión anterior de este README no se verificó y se retiró.

```bash
cd backend && npm test
```

La API además devuelve el diagnóstico en cada consulta
(`nodosVisitadosArbol`, `nodosRecorridoLineal`, `coincideConBusquedaLineal`), que
es lo que se ve en el panel de emparejamiento.

**La decisión nunca es del algoritmo:** el árbol sugiere y ordena; el auxiliar
confirma el beneficiario y fija la cantidad.

---

## 5. Identidad, roles y privacidad

**El perfil se deduce del correo verificado por Google, no de lo que envíe el
navegador.** El backend verifica firma, `iss`, `aud`, `exp` y `email_verified`
del ID token, y de ahí saca el correo:

- dominio `DOMINIO_ESTUDIANTE` (`udea.edu.co`) → `ESTUDIANTE`
- cualquier otro dominio verificado → `DONADOR`

Los perfiles son excluyentes por cuenta: quien quiera participar como ambos
necesita dos cuentas de Google. Los roles `AUXILIAR_LIS` y `ADMINISTRADOR` son
aditivos y los otorga un administrador, salvo el primero, que sale de
`ADMIN_EMAILS`.

Tras verificar el token, el backend emite su propio JWT (8 h) con el id de
usuario, el perfil y los roles. El frontend lo guarda y lo adjunta en cada
petición. Las pantallas que el frontend oculta según el rol son solo comodidad:
el control real está en los guards del backend.

### Matriz de visibilidad

| | Catálogo | Identidades y contactos | Caracterización |
|---|---|---|---|
| Invitado | sí, anónimo | no | no |
| Estudiante | sí, anónimo | no | solo la propia |
| Donador | sí, anónimo | no | no |
| Auxiliar LIS | sí | sí | **no** |
| Administrador | sí | sí | sí |

Las fotografías se guardan dentro de SQL Server (`VARBINARY(MAX)` con MIME,
tamaño y hash SHA-256) y nunca se sirven como URL pública: pasan por
`GET /api/evidencias/:id`, que decide caso por caso quién puede verlas. La foto
de una oferta aprobada es visible porque muestra el producto; la de un movimiento
físico solo la ven el personal del LIS y las dos partes implicadas. El servicio
también comprueba los bytes iniciales del archivo para no aceptar un ejecutable
disfrazado de imagen.

---

## 6. API

Todas las rutas van bajo `/api`. Las marcadas con 🔓 no necesitan token.

| Método | Ruta | Quién |
|---|---|---|
| GET | 🔓 `/salud` | cualquiera |
| POST | 🔓 `/auth/google` | cualquiera |
| GET | `/auth/yo` | autenticado |
| GET | 🔓 `/categorias` | cualquiera |
| POST · PATCH | `/categorias`, `/categorias/:id` | administrador |
| GET | 🔓 `/ofertas/catalogo` | cualquiera |
| GET | `/ofertas/mias` | donador |
| GET | `/ofertas/pendientes` | LIS |
| POST · PATCH | `/ofertas`, `/ofertas/:id`, `/ofertas/:id/cancelar` | donador |
| PATCH | `/ofertas/:id/aprobar` · `/rechazar` · `/cerrar` | LIS |
| GET | 🔓 `/peticiones/catalogo` | cualquiera |
| GET | `/peticiones/mias`, `/peticiones/mi-cupo` | estudiante |
| GET | `/peticiones/pendientes` | LIS |
| POST · PATCH | `/peticiones`, `/peticiones/:id`, `/peticiones/:id/cancelar` | estudiante |
| PATCH | `/peticiones/:id/aprobar` · `/rechazar` | LIS |
| GET · PUT | `/caracterizacion/formulario`, `/caracterizacion/mia` | estudiante |
| GET | `/caracterizacion/usuario/:id` | administrador |
| GET | `/emparejamiento/oferta/:id` | LIS |
| GET | `/asignaciones`, `/asignaciones/:id` | LIS · partes implicadas |
| GET | `/asignaciones/mias` | autenticado |
| POST | `/asignaciones` | LIS |
| POST | `/asignaciones/:id/recepcion` · `/entrega` · `/cancelar` · `/marcar-devolucion` · `/devolucion` | LIS |
| POST | `/evidencias` | autenticado |
| GET | 🔓 `/evidencias/:id` | según el caso |
| GET · POST · PATCH | `/usuarios/...` | administrador |
| GET | `/plazos/bandeja?estado=VENCIDO` · `/plazos/resumen` · `/plazos/calendario?anio=` | LIS |
| GET | `/plazos/mios` | autenticado (solo sus propios plazos) |
| GET | `/analitica/indicadores` · `/analitica/ranking/estudiantes` · `/analitica/ranking/donadores` · `/analitica/alertas` | LIS |

Notas de privacidad (2026-11-20): el token JWT solo prueba la identidad; el
estado y los roles se releen de la BD en cada petición, así que un bloqueo o una
revocación surte efecto inmediato. Las fotos de movimientos físicos
(recepción, entrega, devolución) solo las ve el personal del LIS.

---

## 7. Supuestos tomados (PROPUESTA, sin aprobar)

Estos puntos estaban abiertos en el anteproyecto y hubo que resolverlos para que
el MVP funcionara. Conviene revisarlos con el equipo y con el profesor.

1. **Dimensiones del KD-tree:** caracterización, Sisbén y antigüedad, con el
   punto ideal (1,1,1) y distancia euclídea ponderada. Los pesos 0.50 / 0.30 /
   0.20 son un punto de partida, configurables en `PARAMETRO`.
2. **Escala de Sisbén:** A = 1.00 descendiendo hasta D ≈ 0.01, monótona dentro de
   cada letra y entre letras. Es una propuesta, no una escala oficial.
3. **Antigüedad:** días desde la creación divididos por el máximo entre los
   candidatos de esa consulta. Si todas las peticiones son del mismo instante, la
   dimensión no discrimina y queda en 0 para todas.
4. **Cancelar una oferta:** el donador solo puede hacerlo mientras no tenga
   ninguna asignación. Después debe intervenir el LIS. Editar una oferta ya
   aprobada la devuelve a revisión.
5. **Cancelar una petición:** el estudiante puede antes y después de la
   aprobación, pero no si tiene una asignación vigente.
6. **Límite de 5 peticiones:** cuenta los estados `PENDIENTE_APROBACION` y
   `APROBADA`, así que una petición ya asignada sigue contando hasta que se
   cierre.
7. **Recepción incompleta:** si llegan menos unidades de las asignadas, se
   cancela el intento y el sistema crea una oferta nueva, ya aprobada, por las
   unidades que sí llegaron.
8. **Primer administrador:** sale de `ADMIN_EMAILS`. Si ese correo es
   institucional, su perfil será ESTUDIANTE y además tendrá el rol
   ADMINISTRADOR; el rol no depende del perfil.
9. **Fotografías:** JPEG, PNG o WebP, máximo 2 MB, dentro de SQL Server.

## 8. Qué incluye y qué falta (actualizado 2026-11-20)

**Agregado en los lotes del 2026-11-20 (con pruebas unitarias):**

- **Pilar B (parcial):** calendario hábil colombiano con festivos **calculados**
  (Ley 51 de 1983 y Pascua) y cierres del LIS configurables
  (`PARAMETRO.CIERRES_LIS`); plazos de 10 y 3 días hábiles; bandeja
  *Plazos y tareas*, donde lo vencido es una tarea `DEFINIR_ESTADO` con sus
  acciones; plazos propios en *Mis movimientos*.
- **Pilar C:** indicadores, ranking de estudiantes y de donadores (separado de
  la prioridad) y alertas de incumplimiento; pantalla *Analítica*. La fórmula
  está en `backend/src/analitica/formulas.ts`.
- **Correcciones:**
  - el catálogo oculta las peticiones asignadas;
  - una recepción incompleta ya no duplica inventario;
  - el límite de 5 es transaccional;
  - la devolución exige la cantidad completa;
  - IDOR de fotos cerrado;
  - un auxiliar no puede ser una cuenta UdeA;
  - `/salud` no expone errores del motor.

**Sigue fuera o bloqueado:**

- Tareas y notificaciones **persistentes**, **correo**, aplazar o extender
  plazos y suspensión anticipada por vacaciones: requieren esquema nuevo (H-9) y
  SMTP (H-6).
- Destino institucional `LOCAL` y ubicación física del producto: diseño en
  `docs/planeacion/DISENO_LOCAL_Y_UBICACION_FISICA.md` (H-3, H-9).
- Eliminación administrativa con reautenticación de Google (H-9).
- Árbol sobre atributos de compatibilidad (H-2).

## 9. Documentación de planeación

| Documento | Contenido |
|---|---|
| `docs/planeacion/PLAN_CIERRE_LIS.md` | Backlog, bloqueos y estado por tarea |
| `docs/planeacion/MATRIZ_CUMPLIMIENTO_RUBRICA.md` | Estado y evidencia por criterio (provisional) |
| `docs/planeacion/REGISTRO_DECISIONES.md` | Decisiones técnicas provisionales y cómo revertirlas |
| `docs/planeacion/ANALISIS_PILAR_A_KDTREE.md` | Benchmark y alternativas del árbol |
| `docs/planeacion/DISENO_LOCAL_Y_UBICACION_FISICA.md` | Modelo propuesto para LOCAL y lote físico |
| `docs/planeacion/INFORME_ETAPA_A_2026-11-20.md` | Línea base de la auditoría |

## 10. Pruebas

```bash
cd backend
npm test                                              # 89 pruebas unitarias, sin BD
npx ts-node --transpile-only scripts/benchmark-kdtree.ts   # benchmark del KD-tree
```

## 11. Pendiente de confirmar con el profesor

El anteproyecto registra que las directrices pedían **MySQL y JavaScript**,
mientras que el equipo decidió **SQL Server y TypeScript** (D-31, D-32). Conviene
tener esa autorización por escrito como evidencia de la rúbrica antes de la
sustentación.
