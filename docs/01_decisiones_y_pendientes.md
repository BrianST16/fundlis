# 01 — Registro de decisiones y pendientes

> Estados: **CONFIRMADA** = decisión expresa del profesor o equipo; **PROPUESTA** = recomendación aún no aprobada; **PENDIENTE** = requiere definición o confirmación. No convertir propuestas en reglas implementadas.

## 1. Decisiones confirmadas

| ID | Decisión | Origen/estado |
|---|---|---|
| D-01 | Invitado consulta sin cuenta; las ofertas y peticiones se muestran anónimamente. | Directriz profesor — CONFIRMADA |
| D-02 | Estudiante usa Google y correo verificado `@udea.edu.co`. | Directriz profesor — CONFIRMADA |
| D-03 | Donador usa Google sin dominio institucional UdeA; cuenta distinta de la de estudiante. | Aclaración del equipo — CONFIRMADA |
| D-04 | Auxiliar se registra con Google usando correo diferente al institucional UdeA. | Aclaración del equipo — CONFIRMADA |
| D-05 | Perfiles de estudiante y donador son excluyentes por cuenta; una persona que desempeñe ambos papeles requiere cuentas distintas. | Aclaración del equipo — CONFIRMADA |
| D-06 | Solo auxiliares y administradores consultan identidades/contactos; solo administrador consulta caracterización sensible. | Directriz profesor — CONFIRMADA |
| D-07 | Oferta se registra por donador autenticado y requiere aprobación del LIS. | Directriz profesor — CONFIRMADA |
| D-08 | Petición se registra por estudiante y requiere aprobación. | Directriz profesor — CONFIRMADA |
| D-09 | Máximo cinco peticiones hechas por estudiante, incluyendo pendientes de aprobación y activas. | Aclaración del equipo — CONFIRMADA; precisar asignadas |
| D-10 | PETICION no contiene cantidad solicitada. La cantidad se define en cada asignación. | Aclaración del equipo — CONFIRMADA |
| D-11 | Tabla puente llamada `OFERTA_X_PETICION`; reemplaza el nombre conceptual anterior `MEDIACION`, no su función. | Aclaración del equipo — CONFIRMADA |
| D-12 | Una oferta puede dividirse entre varias peticiones. Cada petición puede tener una sola asignación vigente, pero varios intentos históricos. | Aclaración del equipo — CONFIRMADA |
| D-13 | Estados de intento: `ASIGNADO`, `EN_CUSTODIA`, `ENTREGADO`, `DEVOLUCION`, `CANCELADO`. | Cuatro estados iniciales del profesor + `CANCELADO` del equipo — CONFIRMADA por equipo |
| D-14 | No se permite recepción ni entrega parcial de una misma asignación. | Directriz profesor — CONFIRMADA |
| D-15 | Si donador incumple antes de recepción física: cancelar intento, liberar cantidad y reactivar la petición conservando su fecha original. | Aclaración del equipo — CONFIRMADA |
| D-16 | Si estudiante no recoge y se cancela la asignación para reasignar/devolver, cerrar la petición original por incumplimiento. | Aclaración del equipo — CONFIRMADA |
| D-17 | Si hay entrega al estudiante, la petición se cierra por entrega. | Aclaración del equipo — CONFIRMADA |
| D-18 | Si donador entrega menos de lo asignado, cancelar intento y crear una oferta nueva por la cantidad correspondiente. | Aclaración del equipo — CONFIRMADA; detallar manejo de evidencia/incidencia |
| D-19 | `LOCAL` es sujeto/destinatario institucional, nunca una cuenta ni petición vacía; aparece al final de la lista de posibles recibidores. | Aclaración del equipo — CONFIRMADA |
| D-20 | La aceptación de donación para LOCAL requiere autorización del administrador; el auxiliar puede gestionar espera/custodia. | Aclaración del equipo — CONFIRMADA |
| D-21 | Donador tiene diez días hábiles desde notificación de asignación para entregar al LIS. | Directriz profesor — CONFIRMADA |
| D-22 | Estudiante tiene tres días hábiles desde `EN_CUSTODIA` para recoger; auxiliar puede aplazar tres días hábiles adicionales, reasignar o iniciar devolución. | Directriz profesor — CONFIRMADA |
| D-23 | Si vence el plazo del donador, tarea `DEFINIR_ESTADO`, alertas bilaterales; auxiliar contacta y decide aplazar (duración por definir) o cancelar. | Aclaración del equipo — CONFIRMADA |
| D-24 | Plazos en días hábiles colombianos; suspender recepción de donaciones durante vacaciones con anticipación. | Aclaración del equipo — CONFIRMADA |
| D-25 | Caracterización por preguntas de opción única puntuadas; Sisbén se selecciona, con puntaje por grupo. No certificado en MVP. | Aclaración del equipo — CONFIRMADA |
| D-26 | Prioridad de emparejamiento combina caracterización, Sisbén y antigüedad. Pesos y escalas por definir. | Directriz profesor — CONFIRMADA en variables; fórmula pendiente |
| D-27 | Ranking de conducta separado de prioridad: estudiantes por peticiones/ayudas/incumplimientos; donadores por completadas frente a fallidas. | Directriz profesor — CONFIRMADA en criterios; fórmula pendiente |
| D-28 | Notificaciones por buzón interno y correo; alertar al auxiliar y usuario ante asignación, cambios, cancelaciones y vencimientos. | Directriz profesor — CONFIRMADA |
| D-29 | Fotos obligatorias en recepción física y entrega final. | Directriz profesor — CONFIRMADA |
| D-30 | Eliminación excepcional requiere justificación, reautenticación Google y auditoría; no almacenar contraseña Google. | Aclaración del equipo — CONFIRMADA |
| D-31 | SQL Server se mantiene como motor, siempre que la capa de datos esté diferenciada y pueda demostrarse en vivo. Prevalece sobre "MySQL" de las directrices por ser aclaración expresa posterior. | Aclaración del equipo (anteproyecto, A.1) — CONFIRMADA por equipo; **falta confirmación escrita del profesor** |
| D-32 | Backend en NestJS/TypeScript (compila a JavaScript), con capas correctamente diferenciadas. | Aclaración del equipo — CONFIRMADA por equipo; **falta confirmación escrita del profesor** |
| D-33 | La BD `FundacionUniversitaria` fue de prueba del CRUD; no hay datos que conservar. Se usa una BD nueva (`LisDona`, scripts en `db/`). | Aclaración del equipo — CONFIRMADA |
| D-34 | `tipoPersona = Fundacion` es solo antecedente conceptual de DONADOR; sin migración ni mapeo automático. | Aclaración del equipo — CONFIRMADA |
| D-35 | Los documentos "histórico" se ignoran. | Aclaración del equipo — CONFIRMADA |
| D-36 | Fotografías de evidencia almacenadas dentro de SQL Server (VARBINARY + MIME + tamaño + SHA-256), servidas solo por endpoint autorizado. | Aclaración del equipo — CONFIRMADA (detalle técnico en P-24) |
| D-37 | Se autoriza modificar la **BD experimental** (`LisDona`, local) en esquema y datos con scripts versionados, previa verificación del destino y respaldo. No incluye cambiar de motor ni operar sobre producción. | `prompts/INDICACIONES_COMPLEMENTARIAS_LIS_CLAUDE.md` §2 — CONFIRMADA por equipo |
| D-38 | El puntaje de prioridad es un **número real con escala documentada**, nunca un porcentaje. Se guardan por separado los componentes Sisbén, caracterización y antigüedad y el total. La antigüedad es estable y reproducible a partir de la fecha original de la petición (no se normaliza por consulta). Los coeficientes son factores numéricos configurables. | Indicaciones §3 — CONFIRMADA por equipo |
| D-39 | El auxiliar ve el orden y los componentes numéricos, pero **no** las respuestas de caracterización ni el grupo Sisbén del estudiante (dato sensible, solo administrador). | Indicaciones §3.7 + D-06 — CONFIRMADA |
| D-40 | El puntaje de comportamiento (analítica) es independiente de la prioridad. Estudiantes: indicador con explicación de factores. Donadores: **indicador directo** de completadas frente a fallidas. Sin incumplimiento sin evento registrado. Con dataset ficticio y hoja de validación manual. | Indicaciones §4 — CONFIRMADA |
| D-41 | El KD-tree busca **compatibilidad** sobre atributos reales del producto: categoría por igualdad exacta y nunca como distancia. La prioridad ordena después a los compatibles. Se exige una explicación académica con benchmark que incluya la construcción del árbol. **Resuelve H-2 a favor de la alternativa (B).** | Indicaciones §5 — CONFIRMADA por equipo |
| D-42 | Notificaciones en dos canales (bandeja interna persistente + correo al email registrado) para los eventos de §6, con reintentos, idempotencia, sin revertir la operación de negocio si el correo falla, y sin revelar identidades entre donador y estudiante. | Indicaciones §6 — CONFIRMADA |
| D-43 | LOCAL: última opción siempre; el **auxiliar** puede iniciar **custodia temporal**; la **aceptación institucional permanente** la autoriza el **administrador**; operaciones distintas; ubicación física separada del intento y del historial; trazabilidad completa; nunca una petición ficticia. **Resuelve H-3.** | Indicaciones §7 — CONFIRMADA |
| D-44 | El objetivo es una demo **en tiempo real** (Angular → API → BD experimental) con datos ficticios, cuentas o roles de prueba, un procedimiento para restaurar el escenario y un guion. | Indicaciones §8–§9 — CONFIRMADA |
| D-45 | Nuevo rol **SUPERUSUARIO** (mantenimiento) con acceso total: hereda todo lo del administrador. Se asigna o retira **solo por script de BD** (`db/scripts/asignar_superusuario.sql`, migración 007), nunca desde la interfaz ni la API. Es el **único** que otorga, revoca, bloquea o desbloquea a un ADMINISTRADOR; el administrador sigue gestionando AUXILIAR_LIS. Reglas validadas en backend (`UsuariosService`), no solo ocultando botones. El superusuario no recibe las notificaciones operativas del LIS. Se mantiene `ADMIN_EMAILS` para crear el primer administrador. Los cambios de rol se reflejan en la sesión del frontend sin recargar (refresco de `/auth/yo` cada 60 s, al enfocar la pestaña y ante un 403). | Aclaración del equipo (correcciones 2 y 3, 2026-11-24) — CONFIRMADA |
| D-46 | **Certificado de estudio vigente, OPCIONAL** (por ahora). El correo `@udea.edu.co` no distingue estudiantes de profesores/administrativos; el estudiante puede subir su certificado (PDF/JPEG/PNG, máx. `MAX_BYTES_EVIDENCIA`) y el **administrador** lo marca `VALIDADO` o `RECHAZADO` (con motivo). No afecta el puntaje ni bloquea peticiones. Dato sensible: solo lo ven su dueño y el administrador (no el auxiliar); por eso va en tabla propia `CERTIFICADO_ESTUDIO` (migración 008) y no en `EVIDENCIA`. Uno vigente por estudiante; reemplazar vuelve a `PENDIENTE`; todo queda en `HISTORIAL_ESTADO`. La **caracterización sigue siendo obligatoria** para crear peticiones (sin cambios en el cálculo del puntaje). No confundir con el certificado **Sisbén** de D-25, que sigue fuera del MVP. | Aclaración del equipo (corrección 4, 2026-11-24) — CONFIRMADA |
| D-47 | **Revisión de la propia donación.** Un AUXILIAR_LIS **no puede aprobar ni rechazar** sus propias ofertas (403); las revisa otro auxiliar o un administrador. El **ADMINISTRADOR** (y el SUPERUSUARIO) **sí puede**, y el historial registra "Autoaprobada por un administrador". Validado en backend (`OfertasService.validarRevisionPropia`); en Angular solo se ocultan los botones. Antes el backend bloqueaba la autoaprobación a todos (incluido el administrador) y no bloqueaba el autorrechazo. | Aclaración del equipo (corrección 5, 2026-11-24) — CONFIRMADA |
| D-48 | **Reasignación directa desde custodia.** Un producto `EN_CUSTODIA` (ya recibido en el LIS) se reasigna a otra petición **sin repetir la recepción**: en **una sola transacción** se cancela el intento actual (la petición original se cierra por incumplimiento, D-16) y se crea el intento nuevo directamente `EN_CUSTODIA` sobre el mismo lote, sin movimiento ni foto nuevos. Queda en `HISTORIAL_ESTADO` (intento viejo `CANCELADO` → `REASIGNADA`, intento nuevo `EN_CUSTODIA`, lote `REASIGNADO`). Se avisa al estudiante original, al nuevo y **al donador** (`DONACION_REASIGNADA`, sin identidades, D-42); el aviso al donador aplica también a la reasignación de lotes y desde LOCAL. Endpoint `POST /asignaciones/:id/reasignar`; botón "Reasignar a otra petición" en Custodia, que abre Emparejamiento con los candidatos del lote (KD-tree + prioridad). La decisión `REASIGNAR` de la tarea `DEFINIR_ESTADO` usa la misma operación (antes eran dos transacciones). | Aclaración del equipo (corrección 6, 2026-11-24) — CONFIRMADA |
| D-49 | **Donador recurrente en Aprobaciones** (uso del ranking de donadores, adelanta la corrección 11). Un donador es "recurrente" cuando tiene **3 o más donaciones completadas** (el producto llegó completo al LIS, según `clasificarCompromisoDonador`). El umbral es el parámetro `MIN_DONACIONES_RECURRENTE` (migración 009, por defecto 3). En Aprobaciones cada oferta muestra la insignia "★ Donador recurrente" y el historial del donador (completadas, fallidas, tasa de cumplimiento); un donador sin compromisos aparece como "nuevo". Es **informativo**: no aprueba automáticamente, y la regla de D-47 sigue aplicando. | Aclaración del equipo (2026-11-24) — CONFIRMADA |
| D-50 | **LOCAL con consentimiento del donador** (correcciones 7 y 8; precisa D-20 y D-43). (a) Lo que está en **custodia temporal LOCAL se puede emparejar** desde Emparejamiento (KD-tree + prioridad) y pasa directo a `EN_CUSTODIA` del estudiante, sin nueva recepción; el destino LOCAL se cierra `REASIGNADO` en la misma transacción. (b) Que el producto **quede para el LIS** lo **propone solo el administrador** (se elimina la solicitud del auxiliar), con motivo: estado `PROPUESTO_DONADOR`. El donador recibe el **motivo** por bandeja y correo (corrección 7) y en "Mis donaciones" **acepta o rechaza** (corrección 8). Acepta → `ACEPTADO` (lote `PATRIMONIO_LIS`, autoriza el admin que propuso). Rechaza → `POR_DEVOLVER` y el LIS lo devuelve con foto → `DEVUELTO`. El admin puede retirar la propuesta → `CUSTODIA_TEMPORAL`. (c) Plazo de respuesta `PLAZO_RESPUESTA_DONADOR_LOCAL` (5 días hábiles): recordatorio el día previo y, al vencer, tarea `DEFINIR_ESTADO` + aviso bilateral; decisiones: seguir esperando, retirar propuesta o pasar a devolución. **Nunca se acepta por silencio.** (d) El personal LIS ve nombre y correo del donador para contactarlo directamente. Migración 010 (estados, columnas de propuesta/respuesta, vista indexada de titular por lote ampliada). | Aclaración del equipo (correcciones 7 y 8, 2026-11-24) — CONFIRMADA |
| D-51 | **Foto de la entrega al donador, solo por bandeja** (corrección 9). Al registrar la entrega final, el donador recibe en su **bandeja interna** (no por correo: `soloBandeja`) un aviso con la **foto adjunta** (`NOTIFICACION.evidencia_id`, migración 011). Aplica también cuando el producto llegó por reasignación o desde LOCAL. Excepción puntual a H-7d: esa foto solo la ve el **destinatario** de la notificación; las demás fotos de movimientos siguen siendo solo del personal LIS. En el formulario de entrega se indica al auxiliar fotografiar el producto y evitar rostros o datos del estudiante (D-42). | Aclaración del equipo (corrección 9, 2026-11-24) — CONFIRMADA |
| D-52 | **Trazabilidad de una donación** (corrección 10). Solo **administrador** (y superusuario). `GET /trazabilidad/oferta/:id` une en una línea de tiempo el historial de la oferta, de cada asignación, de sus lotes y de sus destinos LOCAL, más los movimientos físicos (quién entregó o recibió, cantidad, observaciones y foto), con el nombre de quien actuó. Solo lectura. En la interfaz: botón "Trazabilidad" en Custodia y en LOCAL, y buscador por número de donación; panel compacto con filtros (todo / estados / movimientos / con foto), una línea por evento y detalle y foto solo al expandir. | Aclaración del equipo (corrección 10, 2026-11-24) — CONFIRMADA |
| D-53 | **Correo fuera del alcance por ahora** (corrección 12). Las notificaciones se entregan solo por la bandeja interna. La cola de correo (`CORREO_SALIDA`) sigue existiendo pero sin proveedor configurado; queda **pendiente** configurar el proveedor, las plantillas y las variables de entorno. | Aclaración del equipo (2026-11-24) — PENDIENTE (aplazada) |

## 2. Pendientes que deben resolverse por fase

| ID | Pendiente | Cuándo resolver |
|---|---|---|
| P-01 | Confirmar con el profesor si MySQL es obligatorio frente al SQL Server actual. Verificar si la BD contiene datos que conservar y buscar scripts externos. | Antes del diseño físico/migración (F4/F6) |
| P-02 | Confirmar si NestJS con TypeScript cumple el requisito académico de backend JavaScript. | Antes de cerrar arquitectura (F6) |
| P-03 | Definir dominio/provisión del administrador y cómo se inicializa la primera cuenta administradora. | F3 |
| P-04 | Definir si peticiones asignadas siguen contando dentro del límite de cinco (se confirma el conteo de pendientes y activas). | F2 |
| P-05 | Definir el modelo correcto de destino LOCAL sin petición ficticia y sin FK ambigua. | F2/F4 |
| P-06 | Definir cómo registrar el producto y evidencia cuando el donador entrega menos cantidad: incidencia, cancelación del intento, nueva oferta y aprobación. | F2/F4 |
| P-07 | Definir duración del aplazamiento de diez días del donador y número máximo de aplazamientos. | F2 |
| P-08 | Definir desde qué evento corre la custodia adicional de tres días relacionada con LOCAL y cómo interactúa con devolución/reasignación. | F2 |
| P-09 | Definir dimensiones de compatibilidad del KD/R-tree además de categoría; no hay cantidad solicitada en PETICION. | F5 |
| P-10 | Definir preguntas de caracterización, opciones, puntuación, grupos Sisbén, escalas, pesos, normalización, faltantes y desempates. | F5 |
| P-11 | Definir fórmulas/criterios exactos del ranking de estudiantes y donadores. | F5 |
| P-12 | Definir fuente/calendario de festivos colombianos, responsable de actualización y fechas de cierre vacacional del LIS. | F2/F6 |
| P-13 | Elegir almacenamiento privado de fotos y reglas de tamaño, tipos, acceso, retención y despliegue. | F6 |
| P-14 | Definir flujo de reautenticación Google (por ejemplo, volver a autenticar/solicitar interacción) y ventana de validez para eliminaciones. | F3/F6 |
| P-15 | Confirmar si el antiguo `tipoPersona = Fundacion` significa DONADOR o tenía otro significado; no mapearlo automáticamente. | F4 |
| P-16 | Confirmar si existen datos reales en SQL Server Express y si deben migrarse; el esquema no se verificó y no hay migraciones. | F4/F6 |
| P-17 | Definir si una devolución requiere fotografía y cómo se registra la salida física al donador. | F2/F4 |
| P-18 | Definir si la aceptación LOCAL crea inventario institucional permanente y quién registra cada movimiento físico. | F2/F4 |
| P-19 | Definir si una oferta creada por donador puede aprobarse parcialmente o siempre se aprueba/rechaza completa. | F2 |
| P-20 | Definir política de contacto y visibilidad entre auxiliar, donador y estudiante durante la mediación, manteniendo el anonimato entre usuarios. | F2/F3 |
| P-21 | ¿El donador puede ser una organización (persona jurídica) además de persona natural? (derivado de D-34) | F2/F3 |
| P-22 | Si una oferta está parcialmente asignada, ¿el donador puede cancelar el remanente no asignado? | F2 |
| P-23 | Al reasignar un producto que ya está EN_CUSTODIA, ¿cómo nace el nuevo intento y qué plazo corre? Requiere separar ubicación física del intento. | F2/F4 |
| P-24 | Fotos en BD: tamaño máximo, formatos, compresión y retención; ¿la devolución exige foto? (enlaza P-17) | F4/F6 |
| P-25 | Punto exacto de inicio del plazo del donador: "notificación de asignación". Mientras no exista registro de notificación se usa la fecha de asignación (la notificación es inmediata). | F2/F6 |

### 2.1 Estado actualizado de pendientes (2026-11-20)

| ID | Estado |
|---|---|
| P-01 | **Cerrado provisionalmente** por D-31/D-33. Falta la confirmación escrita del profesor (evidencia de rúbrica). |
| P-02 | **Cerrado provisionalmente** por D-32. Falta la confirmación escrita del profesor. |
| P-03 | Implementado como PROPUESTA: primer administrador por `ADMIN_EMAILS` (README §7.8). Pendiente de aprobación. |
| P-04 | Implementado como PROPUESTA (H-7a): cuentan `PENDIENTE_APROBACION` y `APROBADA`; una petición con asignación vigente sigue consumiendo cupo hasta su estado terminal. |
| P-09 | **Bloqueante académico (H-2).** El código actual construye el KD-tree sobre dimensiones de prioridad. La hipótesis de diseño es separar compatibilidad (árbol) de prioridad (orden). Ver `planeacion/ANALISIS_PILAR_A_KDTREE.md`. |
| P-13 | Enfoque decidido (D-36); detalle en P-24. Implementado: JPEG/PNG/WebP, máximo 2 MB, verificación de firma binaria. |
| P-15 | **Cerrado** por D-34. |
| P-16 | **Cerrado** por D-33. |
| P-19 | Implementado como PROPUESTA (H-7b): la oferta se aprueba o rechaza completa. |
| P-20 | Implementado como PROPUESTA (H-7d): las fotos de movimientos físicos solo las ve el personal del LIS. |
| P-22 | Implementado como PROPUESTA (H-7c): el donador no cancela una oferta con cualquier intento de asignación; el remanente no se cancela automáticamente. |

Las decisiones técnicas provisionales tomadas durante la implementación se registran en `docs/planeacion/REGISTRO_DECISIONES.md`.

## 3. Hallazgos técnicos verificados

> **Actualización 2026-11-20 (auditoría Etapa A):** los hallazgos de esta sección describen el CRUD anterior y ya **no** corresponden al código actual. El estado vigente está en `docs/planeacion/INFORME_ETAPA_A_2026-11-20.md` y `docs/planeacion/MATRIZ_CUMPLIMIENTO_RUBRICA.md`. Se conservan como antecedente histórico.

### Hallazgos de la línea base F0 (históricos)

- CRUD: Angular 22.1.7; NestJS 12.0.3 con TypeScript; TypeORM 1.1.1; `mssql` 12.7.2; SQL Server Express.
- Entidad única `Persona`; no existen módulos LIS de negocio ni autenticación.
- Credenciales de BD en `backend/src/app.module.ts`: no reproducir; migrar a variables de entorno y evaluar rotación si reales.
- CORS abierto; información personal expuesta; PUT acepta `any`; DELETE físico.
- No se encontraron migraciones/scripts de esquema; sincronización TypeORM desactivada.
- Repositorio auditado con cero commits y archivos sin seguimiento; revisar secretos antes del primer commit.
- Pruebas no ejecutadas; la auditoría detectó posibles fallos por inspección.
- Workspace que se debe abrir: raíz completa `Manejo de donaciones LIS/Proyecto Fund`, no una copia o subcarpeta `Estructura de datos/frontend`.
