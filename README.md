# LIS Dona — MVP funcional

Plataforma web de intermediación supervisada de donaciones y peticiones para el
Laboratorio Integrado de Sistemas (LIS) de la Universidad de Antioquia.

Tres componentes independientes:

| Componente | Tecnología | Puerto |
|---|---|---|
| Frontend | Angular (standalone components) | 4200 |
| Backend | NestJS + TypeScript + TypeORM | 3000 |
| Base de datos | PostgreSQL 17 en Supabase (esquema `lis`) | 5432 (Session pooler) |

> **Estado verificado (2026-11-27):**
>
> - **Pruebas:** el backend pasa **242/242 pruebas unitarias** (`npm test`, 19
>   suites, datos ficticios, sin BD).
> - **Compilación:** backend y frontend compilan para producción.
> - **Base de datos:** PostgreSQL 17 en Supabase (D-68). `verificar-bd` pasa sus
>   12 controles de seguridad.
> - **Prueba de humo:** `scripts/e2e/humo-postgres.js` hace 34 verificaciones
>   HTTP → API → Supabase, todas en verde.
> - **Pendientes:** correo (D-53, fuera del alcance por ahora) y despliegue.
> - **Decisiones:** las vigentes están en `docs/01_decisiones_y_pendientes.md`.

---

## 1. Puesta en marcha

### 1.1 Base de datos (PostgreSQL en Supabase)

El motor de BD es libre; lo obligatorio es la arquitectura en capas (D-68). La BD
es PostgreSQL en Supabase, en el esquema `lis`. Ese esquema **no** se publica por
la API REST de Supabase.

**1. Proyecto de Supabase.** Del panel se toman:

- en *Connect → Session pooler*, el **host** (`aws-…pooler.supabase.com`,
  puerto 5432, funciona con IPv4). La conexión directa solo tiene IPv6;
- en *Database → SSL*, el **certificado CA**. Se copia como
  `backend/certs/supabase-dev-ca.crt`; la carpeta no se sube al repositorio;
- el ref del proyecto y la clave del usuario `postgres`.

**2. `backend/.env`.** Ver `backend/.env.example`:

| Variable | Valor |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_SCHEMA` | host del pooler, `5432`, `postgres`, `lis` |
| `DB_USER`, `DB_PASSWORD` | usuario de la aplicación `lis_app.<ref>` y una clave propia de 24 caracteres o más |
| `DB_SSL_CA` | ruta al certificado |
| `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD` | `postgres.<ref>` y su clave. Solo los usan los scripts, nunca el servidor |
| `BD_PROYECTO_PERMITIDO` | el ref. Los scripts no operan sobre ningún otro proyecto |

**3. Crear y verificar la BD.** Desde `backend/`:

```bash
node scripts/db/migrar.js --estado   # migraciones aplicadas y pendientes
node scripts/db/migrar.js            # 001 esquema, 002 datos base, 003 seguridad
node scripts/db/usuario-app.js       # activa lis_app con DB_PASSWORD (no la imprime)
node scripts/db/verificar-bd.js      # 12 controles de seguridad
node scripts/db/demo.js              # datos de demostración con imágenes (§2.1)
```

Sobre las migraciones (`db/postgres/migraciones/`):

- se registran en `lis.esquema_version` y cada una corre en una transacción;
- si una migración ya aplicada cambia, el ejecutor se detiene;
- los datos base son 51 grupos Sisbén, 7 categorías, 5 preguntas con 18
  opciones y 23 parámetros.

**Superusuario (D-45).** Es el único rol que gestiona administradores y nunca se
otorga desde la interfaz. La persona inicia sesión una vez y luego se ejecuta
`node scripts/db/superusuario.js asignar|quitar correo@dominio`. Queda en el
historial.

**Datos de demostración.**

- `node scripts/db/demo.js` carga el escenario **ficticio** de la presentación
  (§2.1), con una imagen por producto y fotos de recepción y entrega.
- Es repetible: borra solo lo demo y lo vuelve a sembrar, en una transacción.
- Las imágenes están en `db/postgres/demo/imagenes/`, generadas con
  `generar_imagenes.py`. Cualquier `.jpg` se puede cambiar por una foto real con
  el mismo nombre (máximo 2 MB).

La versión anterior en SQL Server se conserva como histórico en `db/sqlserver/`
y `backend/scripts/db/sqlserver/`.

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

- `DB_PASSWORD` — la clave de `lis_app` (la asigna `scripts/db/usuario-app.js`).
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

### 1.5 Despliegue (tres componentes por separado)

Lista de verificación. Nada de esto está automatizado todavía.

**Base de datos (Supabase)**
1. La presentación usa el mismo proyecto de Supabase ya creado y verificado
   (§1.1). Para un proyecto nuevo, se repiten los pasos de §1.1 con su host, su
   certificado y su ref en `BD_PROYECTO_PERMITIDO`.
2. En *API → Settings → Exposed schemas*, comprobar que `lis` **no** aparece.
3. Los respaldos los hace Supabase. Antes de un cambio grande, se puede exportar
   con `pg_dump` usando la cadena del administrador.

**Backend (NestJS) en Render.** `render.yaml` (Blueprint) crea el servicio `lis-dona-api`:

- región Ohio, la misma zona AWS que Supabase;
- build `npm ci --include=dev && npm run build` y salud en `/api/salud`;
- `JWT_SECRET` generado por Render.

Las claves se cargan en el panel y el certificado va como *Secret File* `supabase-ca.crt`.

1. Variables de entorno, **no** un `.env` subido al repositorio. Ver
   `backend/.env.example`. En producción:
   - `NODE_ENV=production` y un `JWT_SECRET` nuevo y largo;
   - `CORS_ORIGINS` = URL pública del frontend, y `ADMIN_EMAILS`;
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_SCHEMA`, `DB_USER` y `DB_PASSWORD`
     de `lis_app`. **Nunca** el usuario administrador;
   - `DB_SSL_CA_PEM` con el contenido del certificado. Los saltos de línea se
     pueden escribir como `\n`. Sin certificado, el backend no arranca.
2. `npm ci && npm run build && npm run start:prod`, que sirve en `PORT` con el
   prefijo `/api`.
3. Detrás del proxy del hosting: `TRUST_PROXY=1`, para que el límite de
   peticiones por IP (D-65) vea la IP real y no la del proxy. Las cabeceras de
   seguridad de la API (nosniff, anti-iframe, CSP, y HSTS con
   `NODE_ENV=production`) ya las pone el backend.
4. Comprobar `GET https://TU-BACKEND/api/salud` → `"baseDatos":"conectada"`.

**Frontend (Angular) en Vercel.** `frontend/vercel.json` define:

- el build y la carpeta `dist/lis-dona/browser`;
- la reescritura de rutas a `index.html`;
- las cabeceras de seguridad (CSP con la URL de la API, nosniff, anti-iframe y HSTS).

En Vercel, el *Root Directory* es `frontend`.

1. En `frontend/src/environments/environment.prod.ts`, poner `apiUrl` con la URL
   pública del backend terminada en `/api`. `googleClientId` debe ser el mismo
   del backend.
2. `npm ci && npx ng build` → publicar `frontend/dist/lis-dona/browser/`.
3. **Reescritura SPA (corrección 1):** el servidor estático debe responder
   `index.html` en cualquier ruta que no sea un archivo. Por ejemplo, Netlify:
   `/* /index.html 200`; Vercel: `rewrites` a `/index.html`; Nginx:
   `try_files $uri $uri/ /index.html;`; Firebase: `"rewrites": [{"source": "**", "destination": "/index.html"}]`.
   Sin esto, recargar `/lis/...` devuelve 404.
4. **Cabeceras de seguridad del frontend (S5, D-65):** configurarlas en el
   hosting (Netlify `_headers`, Vercel `headers`, Nginx `add_header`). La CSP
   debe permitir Google Identity Services; probarla iniciando sesión antes de
   darla por buena:
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://TU-BACKEND https://accounts.google.com/gsi/; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' blob: data: https://*.googleusercontent.com; frame-ancestors 'none'
   X-Content-Type-Options: nosniff
   Referrer-Policy: strict-origin-when-cross-origin
   Strict-Transport-Security: max-age=31536000; includeSubDomains
   ```
   `'unsafe-inline'` en `script-src` es por el pequeño script de `index.html`
   que aplica el modo oscuro antes de cargar; se puede cambiar por su hash.
   Esta CSP es la mitigación principal de S5 (token en `localStorage`): sin
   scripts de terceros no autorizados, un XSS no puede robarlo.

**Google OAuth**
- En Google Cloud Console, agregar la URL pública del frontend en *Orígenes
  autorizados de JavaScript*. Sin eso, el botón de Google falla en producción.

**Prueba final:** iniciar sesión con Google, recargar (F5) una ruta anidada como
`/lis/custodia` y comprobar que no queda en blanco.

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
5. **Emparejamiento.** Elige la donación (con foto y descripción). El KD-tree
   encuentra las peticiones **compatibles** por estado y talla, y la prioridad las
   ordena. El diagnóstico muestra compatibles y excluidas, nodos visitados,
   tiempos de construcción y consulta, y la verificación contra el filtro lineal.
   **Local** aparece siempre al final. Fija la cantidad y confirma el
   beneficiario.
6. **Entregas y plazos → "Por recibir".** Registra la recepción física con foto
   y el nombre de quien entrega. La asignación pasa a EN_CUSTODIA.
7. **"En custodia" → Registrar entrega.** Con foto y nombre de quien recibe. La
   petición se cierra por entrega y el donador recibe la foto en su bandeja.
8. **Lo que vence** aparece como decisión pendiente en la tarjeta de su objeto:
   en *Entregas y plazos* para las asignaciones y en *Local y lotes* para Local y
   los lotes. El menú muestra el número de decisiones pendientes.

Para repartir una donación entre varios estudiantes, asigna cantidades parciales
de la misma oferta a peticiones distintas: el saldo se recalcula solo.

### 2.1 Escenario de demostración (`node scripts/db/demo.js`)

Todo es ficticio y está marcado con `[DEMO]`. Las cuentas demo no pueden iniciar
sesión: entra con tu cuenta de administrador para ver el LIS. Después de cargarlo,
en *Entregas y plazos* pulsa **Revisar ahora** para generar las tareas vencidas.

| Pantalla | Qué se puede mostrar |
|---|---|
| Aprobaciones | Oferta de donador **★ recurrente** (D-49), de uno nuevo, de uno con fallas y una **propia del auxiliar** (D-47) |
| Emparejamiento | Chaqueta (KD-tree: 2 peticiones compatibles y 2 excluidas por estado o talla); lotes disponibles: tablet sin destino, resmas recibidas incompletas y videoproyector en custodia LOCAL |
| Entregas y plazos | Aviso **DEFINIR_ESTADO** y filtro *Vencidas* (D-59): donador que no entregó (**dar más tiempo** o cancelar) y estudiante que no recogió (dar más tiempo, **reasignar** —corrección 6—, custodia Local o devolución); asignación en plazo (registrar recepción); en custodia reciente (registrar **entrega con foto**, corrección 9); cancelar con causa (D-57); devolución pendiente; **Trazabilidad** |
| Local y lotes | Espera de recepción, custodia temporal, **propuesta al donador** en plazo y vencida, **por devolver** (rechazó) y **aceptado** (D-50); las tareas DEFINIR_ESTADO de Local y del lote sin destino aparecen primero y se deciden en su tarjeta o fila (D-59) |
| Mis donaciones / Mis peticiones | Seguimiento de cada asignación dentro de su tarjeta: estado, siguiente paso y plazo en días hábiles (D-54) |
| Analítica | Estudiantes **en riesgo** resaltados (filtro *Solo en riesgo*); el aviso llega a la bandeja del personal del LIS tras *Revisar ahora* (D-55). Ranking de donadores con ★ recurrente, cumplimiento y alertas por fallas |
| Usuarios | Superusuario, administrador, auxiliares, cuenta bloqueada, y certificados validado, pendiente y **rechazado (docente)** (D-46); estudiante con 5 peticiones abiertas (límite) |

Para mostrar también las pantallas del **donador** y del **estudiante**:

1. Pon tus correos reales en `DEMO_EMAIL_DONADOR` y `DEMO_EMAIL_ESTUDIANTE` del
   `.env`. Esas cuentas deben haber iniciado sesión al menos una vez.
2. Vuelve a ejecutar el script.

El donador verá una propuesta de Local para aceptar o rechazar y la foto de la
entrega en su bandeja. El estudiante verá un producto listo para recoger.

---

## 3. Modelo de datos

22 tablas en el esquema `lis`: `db/postgres/migraciones/001_esquema.sql`. Los saldos **no se
almacenan**: se derivan de los intentos de asignación y de los lotes físicos
(`vw_oferta_saldo`), de modo que hay una sola fuente de verdad.

| Grupo | Tablas |
|---|---|
| Identidad | `USUARIO`, `USUARIO_ROL` |
| Caracterización | `CARACTERIZACION`, `PREGUNTA_CARACTERIZACION`, `OPCION_CARACTERIZACION`, `RESPUESTA_CARACTERIZACION`, `GRUPO_SISBEN`, `CERTIFICADO_ESTUDIO` |
| Flujo central | `CATEGORIA`, `OFERTA`, `PETICION`, `OFERTA_X_PETICION` |
| Ubicación física y Local | `LOTE_FISICO`, `DESTINO_LOCAL`, `MOVIMIENTO`, `EVIDENCIA` |
| Ciclo de vida | `TAREA`, `NOTIFICACION`, `CORREO_SALIDA`, `CIERRE_LIS`, `PARAMETRO` |
| Auditoría | `HISTORIAL_ESTADO` (inmutable: un trigger rechaza `UPDATE`, `DELETE` y `TRUNCATE`) |

```
USUARIO ──< USUARIO_ROL
   ├──< CARACTERIZACION ──< RESPUESTA ── OPCION ── PREGUNTA      (+ GRUPO_SISBEN, CERTIFICADO_ESTUDIO)
   ├──< OFERTA >── CATEGORIA ──< PETICION
   │      ├──< OFERTA_X_PETICION >──────────┘   (intento de asignación)
   │      ├──< LOTE_FISICO   (dónde está físicamente el producto)
   │      └──< DESTINO_LOCAL (destino institucional, nunca una petición ficticia)
   │                MOVIMIENTO ── EVIDENCIA      (recepción, entrega, devolución con foto)
   ├──< TAREA (DEFINIR_ESTADO) · NOTIFICACION ──< CORREO_SALIDA
   └──< HISTORIAL_ESTADO                         PARAMETRO · CIERRE_LIS
```

### Máquinas de estado

**OFERTA**
`PENDIENTE_APROBACION` → `APROBADA` → `CERRADA` (también automática al agotarse
el saldo, D-64)
`PENDIENTE_APROBACION` → `RECHAZADA` · `{PENDIENTE, APROBADA}` → `CANCELADA`

**PETICION**
`PENDIENTE_APROBACION` → `APROBADA` → `CERRADA_ENTREGA` | `CERRADA_INCUMPLIMIENTO`
`PENDIENTE_APROBACION` → `RECHAZADA` · `{PENDIENTE, APROBADA}` → `CANCELADA`

**OFERTA_X_PETICION**
`ASIGNADO` → `EN_CUSTODIA` → `ENTREGADO`
`EN_CUSTODIA` → `DEVOLUCION`
`{ASIGNADO, EN_CUSTODIA}` → `CANCELADO`

**DESTINO_LOCAL**
`ESPERA_RECEPCION` → `CUSTODIA_TEMPORAL` → `PROPUESTO_DONADOR` → `ACEPTADO` |
`POR_DEVOLVER` → `DEVUELTO`
`CUSTODIA_TEMPORAL` → `REASIGNADO` (se empareja con un estudiante) ·
`ESPERA_RECEPCION` → `CANCELADO`

**TAREA** `ABIERTA` → `RESUELTA`, con la decisión y su motivo.

No hay recepción ni entrega parcial de una misma asignación: `CANCELADO` no
significa que el producto salió físicamente del LIS, y `DEVOLUCION` no es lo
mismo que cancelar el vínculo.

### Plazos y esperas (días hábiles de Colombia, parámetros en `PARAMETRO`)

| Situación | Plazo | Al vencer |
|---|---|---|
| Donador lleva el producto al LIS | 10 | Una prórroga de 5, o cancelar |
| Estudiante recoge | 3 | Una extensión de 3, reasignar, custodia Local o devolución |
| Donador lleva el producto destinado a Local | 10 | Una prórroga de 5, o cancelar (D-61) |
| Custodia temporal Local y lote sin destino | 3 | Esperar 5 más, hasta 2 veces (D-60) |
| Propuesta al donador para que quede en el LIS | 5 | Esperar sin tope, siempre con fecha (D-61) |
| Devolución que el donador no retira | 5 | Una espera; después el administrador decide: custodia Local o recibir para el LIS. El administrador puede dar más tiempo aunque no queden esperas (D-62). |

### Invariantes garantizadas

| Invariante | Dónde se garantiza |
|---|---|
| Σ cantidades asignadas ≤ cantidad de la oferta | transacción con bloqueo de filas en orden fijo |
| Una sola asignación vigente por petición | índice único parcial `ux_oxp_vigente_por_peticion` + comprobación en la transacción |
| Máximo 5 peticiones abiertas por estudiante | `MAX_PETICIONES_ACTIVAS` en `PARAMETRO`, verificado al crear |
| Toda recepción y entrega tiene fotografía | `MOVIMIENTO.evidencia_id NOT NULL` |
| Una petición activa fue revisada por alguien | `CK_PETICION_revision` |
| Quien aprueba no es quien publicó | comprobado en el servicio |
| Nunca queda la plataforma sin administradores | comprobado al revocar y al bloquear |
| Un lote físico tiene un solo titular vigente (intento o Local) | índices únicos parciales `ux_lote_titular_oxp` y `ux_lote_titular_local` |
| Una tarea o un aviso no se duplican | índices únicos `ux_tarea_clave` y `ux_notif_usuario_clave` |
| El historial no se altera | triggers `tr_historial_inmutable` y `tr_historial_sin_truncate`, y `lis_app` sin UPDATE ni DELETE |
| Una tarea se cierra con la acción que la resuelve | `cerrarTareasDe` en la misma transacción (D-56) |
| Una cuenta con mediaciones en curso no se bloquea | `UsuariosService.bloquear`, que además cierra sus publicaciones (D-64) |

---

## 4. El pilar del algoritmo: KD-tree adaptativo de compatibilidad

`backend/src/emparejamiento/kdtree.ts` · `compatibilidad.ts` · `prioridad.ts`.
Análisis completo, benchmark y mejoras: `docs/planeacion/ANALISIS_PILAR_A_KDTREE.md`.

**Qué busca (D-41).** Las peticiones **compatibles** con una donación:

1. **Misma categoría.** Se filtra por igualdad, nunca como distancia: no tiene
   sentido medir cuánto dista "Tecnología" de "Ropa y calzado".
2. **Estado.** El estado de conservación de la oferta es mayor o igual al estado
   mínimo que exige la petición.
3. **Medida.** La talla o medida de la oferta cae dentro del rango que acepta la
   petición, cuando la categoría usa medida.

Cada petición es un punto 3D `(estadoMinimo, medidaMin, medidaMax)`, y la oferta
define una caja:

```
estadoMinimo ∈ [1, estado]   medidaMin ∈ [−∞, medida]   medidaMax ∈ [medida, +∞]
```

Es una **búsqueda por rango ortogonal**, el problema para el que existe el
KD-tree. Ordenar por un solo puntaje no la resuelve. El sentido inverso, de una
petición a las ofertas compatibles, usa un árbol 2D (`GET
/api/emparejamiento/peticion/:id`).

**Por qué "adaptativo".** Un KD-tree clásico alterna los ejes en orden fijo.
Este elige en cada nodo el eje de **mayor dispersión** y corta por su mediana.
La consulta poda las ramas que no pueden tocar la caja.

**Después, la prioridad (D-38).** Solo los compatibles se ordenan por

```
P = 0,5·C + 0,3·S + 0,2·A        A = min(1, días desde la petición / 90)
```

con caracterización C, Sisbén S y antigüedad A en [0,1]. Los pesos y el
horizonte están en `PARAMETRO`. P es un número real, no un porcentaje.
**Local** aparece siempre al final de la lista.

**Complejidad:**

- construcción O(n log² n);
- consulta O(n^(1−1/k) + m), donde m es el número de resultados;
- memoria O(n).

**Verificación:**

- `kdtree.spec.ts` (9 casos) compara el árbol con el filtro lineal en 400
  conjuntos aleatorios. También comprueba que las cajas 3D y 2D equivalen al
  predicado de compatibilidad en 2.000 pares cada una.
- En producción, **cada consulta** se compara con el filtro lineal; la
  pantalla muestra `coincideConFiltroLineal`, los nodos visitados y los tiempos
  de construcción y consulta.

**Benchmark (2026-11-26), en ms por consulta.** "Coincide" = coincide con el
filtro lineal.

| Escenario | n | Filtro lineal | Construir + consultar (hoy) | Solo consultar | Nodos visitados | Coincide |
|---|---:|---:|---:|---:|---:|:---:|
| `lis`: ~42 % compatibles | 1.000 | 0,033 | 1,555 | 0,139 | 50 % | sí |
| `lis` | 100.000 | 3,867 | 297,550 | 25,209 | 44 % | sí |
| `selectivo`: ~1 % compatibles | 1.000 | 0,020 | 1,714 | 0,006 | 9,6 % | sí |
| `selectivo` | 100.000 | 1,872 | 427,005 | **0,891** | **3,0 %** | sí |

Cómo leer la tabla:

- **Consulta selectiva:** el árbol poda el 97 % de los nodos y la consulta es
  unas 2 veces más rápida que el filtro lineal.
- **Datos del LIS:** casi la mitad de las peticiones son compatibles, así que
  ningún índice puede visitar menos de ese 42 %. El árbol visita el 44 %, y el
  filtro lineal gana por factores constantes.
- **Costo actual:** lo domina la **construcción**, porque el árbol se
  reconstruye en cada consulta.
- **Volumen real del LIS:** todo tarda menos de 2 ms.

```bash
cd backend
npx ts-node --transpile-only scripts/benchmark-kdtree.ts lis
npx ts-node --transpile-only scripts/benchmark-kdtree.ts selectivo
```

**La decisión nunca es del algoritmo:** el árbol encuentra los compatibles y
la prioridad los ordena; el auxiliar confirma el beneficiario y fija la cantidad.

---

## 5. Identidad, roles y privacidad

**El perfil se deduce del correo verificado por Google, no de lo que envíe el
navegador.** El backend verifica firma, `iss`, `aud`, `exp` y `email_verified`
del ID token, y de ahí saca el correo:

- dominio `DOMINIO_ESTUDIANTE` (`udea.edu.co`) → `ESTUDIANTE`
- cualquier otro dominio verificado → `DONADOR`

Los perfiles son excluyentes por cuenta: quien quiera participar como ambos
necesita dos cuentas de Google. Los roles son aditivos:

| Rol | Quién lo otorga | Qué agrega |
|---|---|---|
| `AUXILIAR_LIS` | un administrador. Solo a cuentas no institucionales. | Operación del LIS |
| `ADMINISTRADOR` | el primero sale de `ADMIN_EMAILS`; los demás los otorga solo un superusuario | Caracterización sensible, usuarios, Local para el LIS, trazabilidad |
| `SUPERUSUARIO` | **solo por script** (`scripts/db/superusuario.js`, D-45) | Gestiona a los administradores; hereda todo |

Tras verificar el token, el backend emite su propio JWT (8 h) con el id de
usuario, el perfil y los roles. El frontend lo guarda y lo adjunta en cada
petición.

**El control real está en el backend.** `JwtGuard` y `RolesGuard` son
globales: toda ruta exige sesión salvo las marcadas `@Publico`. El estado y los
roles se **releen de la BD en cada petición**, así que un bloqueo o una
revocación surte efecto inmediato (403). Las pantallas que Angular oculta
según el rol son solo comodidad.

Otras defensas del backend (D-65):

- `ValidationPipe` con `whitelist` y `forbidNonWhitelisted`;
- cabeceras de seguridad (CSP cerrada, nosniff, anti-iframe, HSTS en
  producción);
- límite de peticiones por IP (login 10/min, fotos 30, certificado 10,
  general 300) con respuesta 429;
- nombres de archivo saneados en las descargas;
- en la BD:
  - el usuario de la aplicación `lis_app` con mínimo privilegio;
  - RLS en todas las tablas;
  - el esquema `lis` sin acceso para los roles públicos de Supabase;
  - TLS verificado (`db/postgres/migraciones/003_seguridad.sql`).

### Matriz de visibilidad

| | Catálogo | Identidades y contactos | Caracterización |
|---|---|---|---|
| Invitado | sí, anónimo | no | no |
| Estudiante | sí, anónimo | no | solo la propia |
| Donador | sí, anónimo | no | no |
| Auxiliar LIS | sí | sí | **no** |
| Administrador | sí | sí | sí |

Las fotografías se guardan dentro de la BD (`bytea` con MIME,
tamaño y hash SHA-256) y nunca se sirven como URL pública: pasan por
`GET /api/evidencias/:id`, que decide caso por caso quién puede verlas. La foto
de una oferta aprobada es visible porque muestra el producto. La de un
movimiento físico (recepción, entrega, devolución) solo la ve el personal del LIS.
Hay una excepción: el donador recibe en su bandeja la foto de la entrega final,
y solo él la ve (D-51). El servicio también comprueba los bytes iniciales del
archivo para no aceptar un ejecutable disfrazado de imagen. El certificado de
estudio (opcional, D-46) solo lo ven su dueño y el administrador, y se sirve con
`Cache-Control: no-store`.

---

## 6. API

Todas las rutas van bajo `/api`. Las marcadas con 🔓 no necesitan token.

**Quién puede llamarlas:**

- **LIS** = `AUXILIAR_LIS` o superior.
- **Admin** = `ADMINISTRADOR` o `SUPERUSUARIO`.
- **Autenticado** = cualquier sesión. El servicio filtra lo propio.

### Acceso, catálogo y categorías

| Método | Ruta | Quién |
|---|---|---|
| GET | 🔓 `/salud` | cualquiera |
| POST | 🔓 `/auth/google` | cualquiera (límite de 10 por minuto por IP) |
| GET · POST | `/auth/yo` · `/auth/salir` | autenticado |
| GET | 🔓 `/categorias` | cualquiera |
| POST · PATCH | `/categorias` · `/categorias/:id` · `/categorias/:id/medida` | admin |
| GET | 🔓 `/ofertas/catalogo` · 🔓 `/ofertas/:id` | cualquiera (anónimo) |
| GET | 🔓 `/peticiones/catalogo` · 🔓 `/peticiones/:id` | cualquiera (anónimo) |

### Ofertas y peticiones

| Método | Ruta | Quién |
|---|---|---|
| GET | `/ofertas/mias` | donador |
| POST · PATCH | `/ofertas` · `/ofertas/:id` · `/ofertas/:id/cancelar` | donador |
| GET | `/ofertas/pendientes` · `/ofertas/:id/historial` | LIS |
| PATCH | `/ofertas/:id/aprobar` · `/rechazar` · `/cerrar` | LIS (no puede aprobar las propias, salvo admin, D-47) |
| GET | `/peticiones/mias` · `/peticiones/mi-cupo` | estudiante |
| POST · PATCH | `/peticiones` · `/peticiones/:id` · `/peticiones/:id/cancelar` | estudiante |
| GET | `/peticiones/pendientes` · `/peticiones/:id/historial` | LIS |
| PATCH | `/peticiones/:id/aprobar` · `/rechazar` | LIS |

### Caracterización

| Método | Ruta | Quién |
|---|---|---|
| GET | `/caracterizacion/formulario` | autenticado |
| GET · PUT | `/caracterizacion/mia` | estudiante |
| GET · PUT · DELETE | `/caracterizacion/mia/certificado` (+ `/archivo`) | estudiante |
| GET | `/caracterizacion/usuario/:id` (+ `/certificado`, `/certificado/archivo`) | admin |
| PATCH | `/caracterizacion/usuario/:id/certificado/revision` | admin |

### Emparejamiento, asignaciones y Local

| Método | Ruta | Quién |
|---|---|---|
| GET | `/emparejamiento/oferta/:id` · `/lote/:id` · `/peticion/:id` | LIS |
| GET | `/asignaciones` | LIS |
| GET | `/asignaciones/mias` · `/asignaciones/:id` | autenticado (solo lo propio) |
| POST | `/asignaciones` · `/asignaciones/desde-lote` | LIS |
| POST | `/asignaciones/:id/recepcion` · `/entrega` · `/cancelar` · `/reasignar` · `/prorrogar` · `/marcar-devolucion` · `/devolucion` | LIS |
| GET | `/local` · `/local/lotes` · `/local/:id` | LIS |
| POST | `/local/desde-oferta` · `/desde-lote` · `/:id/recepcion` · `/:id/cancelar` · `/:id/devolucion` | LIS |
| POST | `/local/:id/proponer` · `/:id/retirar-propuesta` | admin |
| GET · POST | `/local/donador/propuestas` · `/local/donador/propuestas/:id/responder` | donador |

### Evidencias, tareas, plazos y avisos

| Método | Ruta | Quién |
|---|---|---|
| POST | `/evidencias` | autenticado |
| GET | 🔓 `/evidencias/:id` | según el caso, que decide el servicio |
| GET · POST | `/tareas` · `/tareas/revisar` · `/tareas/:id/resolver` | LIS |
| GET | `/plazos/bandeja` · `/plazos/resumen` · `/plazos/calendario?anio=` | LIS |
| GET | `/plazos/mios` | autenticado (solo sus propios plazos) |
| GET · PATCH | `/notificaciones` · `/no-leidas` · `/leer-todas` · `/:id/leida` | autenticado |
| GET · POST | `/notificaciones/correo/estado` · `/procesar` · `/reencolar` | admin |

### Analítica, trazabilidad y usuarios

| Método | Ruta | Quién |
|---|---|---|
| GET | `/analitica/indicadores` · `/ranking/estudiantes` · `/ranking/donadores` · `/alertas` | LIS |
| GET | `/trazabilidad/oferta/:id` | admin |
| GET | `/usuarios` · `/usuarios/:id` | admin |
| POST · PATCH | `/usuarios/:id/roles` · `/roles/revocar` · `/bloquear` · `/desbloquear` | admin (el rol y el bloqueo de un administrador, solo el superusuario) |

---

## 7. Supuestos tomados (PROPUESTA, sin aprobar)

Estos puntos estaban abiertos en el anteproyecto y hubo que resolverlos para que
el MVP funcionara. Conviene revisarlos con el equipo y con el profesor.

1. **Pesos de prioridad:** 0,50 para caracterización, 0,30 para Sisbén y 0,20
   para antigüedad, con un horizonte de 90 días. La fórmula está confirmada
   (D-38); los valores son una propuesta y se pueden configurar en `PARAMETRO`.
2. **Escala de Sisbén:** `GRUPO_SISBEN.puntaje_necesidad`, de A = 1,00
   descendiendo hasta D, monótona dentro de cada letra y entre letras. Es una
   equivalencia del proyecto, no una escala oficial del DNP.
3. **Atributos de compatibilidad:** estado de conservación de 1 a 5 y una medida
   numérica por categoría (`CATEGORIA.medida_nombre`). Si la oferta no declara
   medida, solo son compatibles las peticiones sin rango.
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
9. **Fotografías:** JPEG, PNG o WebP, máximo 2 MB, dentro de la BD (`bytea`). Supabase Storage queda para después (P-61).
10. **Plazos de las esperas:** los valores de la tabla del §3 (5 días hábiles, 2
    esperas, 1 prórroga, etc.) se acordaron con el equipo. Un panel para que el
    administrador los edite queda fuera del alcance (P-60).

## 8. Qué incluye y qué falta (actualizado 2026-11-26)

**Incluido y probado.** Cada punto tiene pruebas unitarias, y el flujo se probó
a mano contra la BD de desarrollo.

- **Identidad:** Google OIDC verificado en el backend, perfil por dominio,
  perfiles excluyentes, roles auxiliar, administrador y superusuario, y bloqueo
  con efecto inmediato.
- **Flujo central:**
  - publicar y aprobar ofertas y peticiones;
  - catálogo anónimo y límite de 5;
  - `OFERTA_X_PETICION` con fraccionamiento y una sola asignación vigente;
  - recepción y entrega con foto, sin recepción parcial;
  - devolución, reasignación desde custodia y cancelación con causa (D-57);
  - cierre automático de ofertas agotadas (D-64).
- **Local:**
  - espera de recepción, custodia temporal y emparejamiento desde Local;
  - propuesta al donador con su consentimiento y aceptación por el
    administrador;
  - devolución y trazabilidad (D-43, D-50, D-52).
- **Pilar A, emparejamiento:** KD-tree adaptativo de compatibilidad, prioridad
  ponderada, Local al final, verificación lineal en cada consulta y confirmación
  humana.
- **Pilar B, ciclo de vida:**
  - calendario hábil colombiano con festivos calculados y cierres del LIS;
  - la recepción de donaciones se suspende `DIAS_ANTICIPACION_CIERRE` días
    hábiles antes de un cierre;
  - plazos, prórrogas y esperas con tope;
  - tareas `DEFINIR_ESTADO` que se deciden en la tarjeta de su objeto;
  - revisor automático cada 15 minutos;
  - avisos en la bandeja interna, con foto de la entrega para el donador.
- **Pilar C, analítica:** indicadores, ranking de estudiantes y de donadores
  separado de la prioridad, alertas, estudiantes en riesgo resaltados y
  avisados al personal (D-55), y donador recurrente en *Aprobaciones* (D-49).
- **Seguridad:**
  - guards globales y validación estricta;
  - cabeceras de seguridad y límite de peticiones;
  - historial inmutable;
  - usuario de BD con mínimo privilegio;
  - privacidad de fotos y caracterización en el backend.
- **Interfaz:** menú lateral plegable con contadores, paginación, modo oscuro y
  paleta de cuatro colores (D-63, D-67).

**Fuera del alcance o pendiente:**

- **Correo:** la cola `CORREO_SALIDA` existe, pero no hay proveedor
  configurado (D-53).
- **Eliminación excepcional con reautenticación de Google** (D-30, P-14): no
  implementada.
- **Panel de parámetros para el administrador** (P-60).
- **Despliegue del backend y el frontend, y pruebas con Postman:** fases
  siguientes. La BD ya está en Supabase (D-68).
- **`npm audit` del backend:** 6 avisos en dependencias. El más alto es
  nodemailer, que solo afecta al correo, hoy apagado. Falta aplicar
  `npm audit fix`, que requiere aprobación.
- **Mejoras propuestas del KD-tree** (M1–M5 del análisis del Pilar A).

## 9. Documentación

**Vigente (para la sustentación):**

| Documento | Contenido |
|---|---|
| `README.md` | Puesta en marcha, demo, modelo, algoritmo, seguridad y API |
| `docs/01_decisiones_y_pendientes.md` | Decisiones D-01 a D-67 y pendientes: la fuente de verdad del negocio |
| `docs/planeacion/ANALISIS_PILAR_A_KDTREE.md` | El KD-tree: qué resuelve, verificación, benchmark del 2026-11-26, debilidades y mejoras |
| `docs/planeacion/MATRIZ_CUMPLIMIENTO_RUBRICA.md` | Estado y evidencia por criterio R1 a R8 (provisional: no hay rúbrica oficial) |
| `docs/00_directrices_profesor.md` | Directrices del profesor |
| `docs/RESUMEN_PROYECTO_LIS.md` | Resumen ejecutivo del negocio |

**Histórico (línea base del 2026-11-20; no describe el estado actual):**

- `docs/planeacion/INFORME_ETAPA_A_2026-11-20.md`
- `PLAN_CIERRE_LIS.md`
- `REGISTRO_DECISIONES.md`
- `DISENO_LOCAL_Y_UBICACION_FISICA.md`
- `docs/DIAGNOSTICO_CRUD_BASE.md`
- `docs/Anteproyecto_completo.md`: documento académico original, no se
  modifica.

## 10. Pruebas

```bash
cd backend
npm test        # 242 pruebas unitarias en 19 suites, datos ficticios, sin BD
npx ts-node --transpile-only scripts/benchmark-kdtree.ts lis         # benchmark, datos tipo LIS
npx ts-node --transpile-only scripts/benchmark-kdtree.ts selectivo   # benchmark, consultas selectivas
```

| Suite | Qué cubre |
|---|---|
| `auth`, `jwt.guard`, `seguridad`, `seguridad-http` | Token de Google, dominio, bloqueo inmediato, RBAC, IDOR de fotos, cabeceras, límite de peticiones, nombres de archivo |
| `flujo-integridad`, `saldo`, `cancelar-dto` | Catálogo anónimo, límite de 5, saldos, recepción incompleta, devolución, cancelación con causa |
| `kdtree`, `prioridad` | Árbol frente a filtro lineal, compatibilidad 3D y 2D, fórmula de prioridad |
| `calendario`, `pilares-b-c`, `tareas/*`, `local-notificaciones` | Días hábiles y festivos, plazos, esperas y prórrogas, tareas, Local, avisos, ranking y alertas |
| `certificado`, `trazabilidad` | Certificado de estudio, línea de tiempo de una donación |
| `bd-config` | TLS obligatorio hacia la BD, opciones de TypeORM, duplicados de Postgres (23505) |

Prueba de humo contra la BD de desarrollo. Escribe solo sobre datos demo, así
que después hay que recargar la demo:

```bash
node scripts/db/demo.js && PORT=3100 node dist/main.js     # en otra terminal: la API
node scripts/e2e/humo-postgres.js                           # 34 verificaciones HTTP -> API -> Supabase
node scripts/db/demo.js                                     # dejar la demo como estaba
```

## 11. Motor de base de datos y lenguaje del backend

El motor de BD es libre: MySQL era la idea inicial, no una obligación. Lo
obligatorio es la **arquitectura en capas** (D-68). La BD pasó de SQL Server a
**PostgreSQL en Supabase**, con las mismas reglas e invariantes y la seguridad
adaptada a Supabase (`003_seguridad.sql`). El backend está en TypeScript, que
compila a JavaScript (D-32).
