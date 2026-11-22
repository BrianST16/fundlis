**F1 — Anteproyecto LIS: propuesta para revisión**

**Estado:** BORRADOR en Plan mode. No se ha escrito ningún archivo del repositorio ni se ha tocado código. **Convención:** \[PROF\] directriz del profesor · \[EQ\] decisión/aclaración del equipo · \[CRUD\] hecho verificado · \[PROP\] propuesta técnica · \[PEND\] pendiente de confirmación.

**Contexto**

Se inicia formalmente la Fase 1 (Anteproyecto) del proyecto LIS. La auditoría F0 es la línea base. El usuario aportó 6 aclaraciones nuevas (SQL Server, TypeScript, BD desechable, paralelo Fundación↔Donador, ignorar históricos, fotos en BD) que cambian el estado de varios pendientes (P-01, P-02, P-13, P-15, P-16). El resultado esperado de esta fase es un anteproyecto aprobado, guardado en docs/planeacion/01_anteproyecto.md, con objetivos medibles y matriz de trazabilidad a la rúbrica.

**Verificación de raíz:** el workspace abierto es …/Manejo de donaciones LIS/Proyecto Fund y contiene backend/, frontend/, docs/, prompts/, CLAUDE.md → **raíz correcta**. No hay que reabrir VS Code.

**A. Diagnóstico de suficiencia de la información**

| **Tema**                                                                 | **Suficiente para F1**           | **Comentario**                                                                                           |
| ------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Problema, actores, flujo, reglas                                         | Sí                               | Directrices + D-01…D-30 cubren todo lo que pide un anteproyecto.                                         |
| Stack                                                                    | Sí (con las aclaraciones nuevas) | SQL Server + NestJS/TS aceptados por el equipo, condicionados a capas bien diferenciadas y demo en vivo. |
| Fotos                                                                    | Sí a nivel de enfoque            | Se puede almacenar en SQL Server; detalle en F4/F6. **No hace falta cambiar de motor.**                  |
| Fórmulas (prioridad, ranking), plazos de aplazamiento, LOCAL, calendario | No, pero **no bloquean F1**      | Se declaran como pendientes con fase de resolución.                                                      |

**Conclusión:** la información alcanza para un anteproyecto completo. Ningún pendiente bloquea esta fase.

**A.1 Aclaraciones nuevas del usuario → registro propuesto (se escribirá tras aprobación)**

| **ID** | **Enunciado**                                                                                                                                                      | **Origen**                   | **Efecto**                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| D-31   | SQL Server se mantiene como motor, siempre que la capa de datos esté diferenciada y pueda demostrarse en vivo.                                                     | \[EQ\] respuesta del usuario | Cierra P-01 (parte motor). Prevalece sobre "MySQL" de las directrices por ser aclaración expresa posterior (nivel 1 de la jerarquía). |
| D-32   | Backend en NestJS/TypeScript se acepta, siempre que las capas estén correctamente diferenciadas.                                                                   | \[EQ\]                       | Cierra P-02.                                                                                                                          |
| D-33   | La BD FundacionUniversitaria fue de prueba del CRUD; no hay datos que conservar. Se creará una BD nueva según el modelo de identidad (F3/F4) mediante migraciones. | \[EQ\]                       | Cierra P-16 y la parte de datos de P-01. \[PROP\] No borrar la BD vieja; crear una nueva (nombre a decidir en F4).                    |
| D-34   | tipoPersona = Fundacion puede tomarse como **antecedente conceptual** de DONADOR, sin migración de datos ni mapeo automático (el proyecto cambió).                 | \[EQ\]                       | Cierra P-15. Abre P-21 (¿donador puede ser organización?).                                                                            |
| D-35   | Ignorar los documentos "histórico".                                                                                                                                | \[EQ\]                       | Sin impacto en reglas.                                                                                                                |
| D-36   | Fotos de evidencia almacenadas **dentro de SQL Server**, de forma íntegra.                                                                                         | \[EQ\] preferencia           | P-13 pasa a "enfoque decidido; detalle técnico pendiente F4/F6".                                                                      |

**Sobre fotos en SQL Server (\[PROP\], detalle en F4/F6):** es viable sin cambiar de motor. Enfoque: tabla de evidencia separada con VARBINARY(MAX), tipo MIME, tamaño y hash SHA-256 (integridad), servida **solo** por un endpoint autenticado/autorizado (nunca URL pública). Riesgo a controlar: SQL Server Express limita cada BD a **10 GB** → imponer tamaño máximo por foto y compresión/redimensionado. Con ~500 KB por foto caben >15.000 fotos, suficiente para el MVP.

**Recomendación (no bloqueante):** pedir al profesor una confirmación escrita breve de D-31/D-32 para adjuntarla como evidencia de la rúbrica (ver sección H, paso 2).

**B. Índice propuesto de docs/planeacion/01_anteproyecto.md**

1. Control del documento (versión, fecha, autores, estado, convención de etiquetas)
2. Título tentativo
3. Contexto institucional del LIS
4. Situación problemática y planteamiento del problema
5. Pregunta orientadora
6. Justificación (social, institucional, técnica, académica)
7. Objetivo general y objetivos específicos con indicadores
8. Alcance, delimitaciones y exclusiones
9. Actores y responsabilidades
10. Descripción de la solución y flujo general
11. Pilares diferenciadores (A emparejamiento, B ciclo de vida, C analítica)
12. MVP por niveles y entregables verificables
13. Viabilidad, restricciones y riesgos
14. Matriz de trazabilidad a la rúbrica
15. Supuestos, decisiones y preguntas abiertas
16. Control de coherencia
17. Próximos pasos (F2)

**C. Borrador integral**

**1\. Título tentativo**

**"Plataforma web de intermediación supervisada de donaciones y peticiones para el Laboratorio Integrado de Sistemas (LIS) de la Universidad de Antioquia, con emparejamiento multidimensional basado en árboles espaciales"** Nombre corto: _LIS Dona_. \[PROP\]

**2\. Contexto institucional**

El LIS, como laboratorio de la Universidad de Antioquia, actúa como intermediario entre personas externas dispuestas a donar productos y estudiantes con necesidades. Hoy no existe un sistema que centralice ofertas, necesidades, custodia física y entregas: la gestión es informal (mensajes, listas, memoria del personal), sin trazabilidad ni criterios de prioridad explícitos. \[EQ/PROF\]

**3\. Situación problemática y planteamiento**

- Las ofertas y necesidades no están en un catálogo único ni anónimo.
- No hay un criterio objetivo y auditable para decidir **a quién** asignar un producto escaso.
- No hay control de cantidades (una oferta puede repartirse entre varios estudiantes) ni de plazos de entrega/recogida.
- El LIS custodia productos físicamente sin registro de entrada, permanencia, salida ni evidencia.
- Los datos personales y de vulnerabilidad (caracterización, Sisbén) requieren protección estricta.
- Los incumplimientos (donador que no entrega, estudiante que no recoge) no tienen procedimiento ni consecuencias medibles.

**Problema:** el LIS carece de una herramienta que permita publicar, priorizar, asignar y trazar donaciones de forma controlada, privada y verificable, desde la oferta hasta la entrega final.

**4\. Pregunta orientadora**

¿Cómo puede una plataforma web de tres capas, con autenticación institucional y un motor de emparejamiento basado en una estructura de datos espacial, apoyar al LIS para asignar donaciones de forma priorizada, trazable y respetuosa de la privacidad?

**5\. Justificación**

- **Social:** dirige recursos hacia estudiantes con mayor necesidad (caracterización + Sisbén + antigüedad) y reduce desperdicio por ofertas no aprovechadas.
- **Institucional:** da al LIS control, trazabilidad, evidencia fotográfica y auditoría; reduce riesgos de pérdida o mala entrega.
- **Técnica:** integra autenticación federada (Google OIDC), autorización por rol y por campo, transacciones con invariantes de cantidad, calendario hábil colombiano y notificaciones en dos canales.
- **Académica (Estructura de Datos):** aplica una estructura no trivial (KD-tree adaptativo o R-tree) a un problema real, con análisis de complejidad, comparación con búsqueda lineal y pruebas.

**6\. Objetivos → ver sección D.**

**7\. Alcance, delimitaciones y exclusiones**

**Incluye (MVP):** cinco actores; Google OIDC con regla de dominio por perfil; caracterización por opción única + Sisbén seleccionado; publicación y aprobación de ofertas/peticiones; catálogo anónimo; emparejamiento semiautomático con confirmación humana; OFERTA_X_PETICION con intentos históricos; recepción, custodia, entrega, devolución, cancelación y destino LOCAL; plazos hábiles; tareas DEFINIR_ESTADO; buzón interno + correo; fotos obligatorias almacenadas en BD; analítica y rankings; auditoría y eliminación excepcional con reautenticación.

**Delimitaciones:** solo productos físicos (no dinero) \[PROP\]; un único punto físico (el LIS) \[PROP\]; comunidad UdeA como beneficiaria (estudiantes @udea.edu.co) \[PROF\].

**Exclusiones \[PROP\]:** carga de certificado Sisbén (evolución futura \[EQ\]); recepción/entrega parcial \[PROF\]; donaciones monetarias/pagos; transporte o domicilios; chat directo entre donador y estudiante; app móvil nativa; integración con sistemas institucionales UdeA distintos de Google.

**8\. Actores y responsabilidades**

| **Actor**     | **Acceso**                             | **Puede**                                                                                                                            | **No puede**                                     |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Invitado      | Sin cuenta                             | Ver catálogo anónimo                                                                                                                 | Publicar, ver identidades                        |
| Estudiante    | Google @udea.edu.co                    | Caracterizarse, elegir Sisbén, crear/cancelar peticiones (máx. 5)                                                                    | Publicar ofertas, ver identidades                |
| Donador       | Google no UdeA                         | Publicar ofertas con cantidad, cancelar antes de asignación                                                                          | Cancelar tras asignación, ver identidades        |
| Auxiliar LIS  | Google no UdeA, rol otorgado por admin | Aprobar/rechazar, asignar, registrar recepción/entrega/devolución, atender tareas, ver contactos                                     | Ver caracterización sensible, aceptar para LOCAL |
| Administrador | \[PEND P-03\]                          | Todo lo del auxiliar + caracterización, usuarios/roles/bloqueos, aceptación LOCAL, emparejamientos críticos, eliminación excepcional | —                                                |
| LOCAL         | No es usuario                          | Destino institucional, última opción                                                                                                 | —                                                |

**9\. Solución y flujo general**

Arquitectura en **tres componentes independientes**: Angular (presentación) → API NestJS (negocio, seguridad, algoritmo, calendario, notificaciones) → SQL Server (datos, fotos, auditoría). \[EQ D-31/D-32\]

flowchart LR

E\[Estudiante: caracterización + petición\] --> AP{Aprobación LIS}

D\[Donador: oferta con cantidad\] --> AP

AP --> CAT\[Catálogo anónimo\]

CAT --> M\[Motor: árbol espacial + prioridad\]

M --> H\[Auxiliar confirma y fija cantidad\]

H --> OXP\[OFERTA_X_PETICION: ASIGNADO\]

OXP -->|≤10 días hábiles, foto| C\[EN_CUSTODIA\]

OXP -->|vence| T1\[DEFINIR_ESTADO: aplazar o CANCELADO\]

C -->|≤3 días hábiles, foto| ENT\[ENTREGADO\]

C -->|vence| T2\[DEFINIR_ESTADO: +3 días / reasignar / DEVOLUCION / LOCAL\]

**10\. Pilares diferenciadores**

- **A — Emparejamiento:** filtro por categoría (igualdad, no distancia) + árbol KD adaptativo o R-tree sobre dimensiones reales compatibles \[PEND P-09\]; prioridad = f(caracterización, Sisbén, antigüedad) \[PEND P-10\]; el sistema **sugiere**, el auxiliar **decide**. LOCAL siempre al final.
- **B — Ciclo de vida:** estados separados (intento de asignación / ubicación física del producto / bitácora inmutable); control de cantidades transaccional; calendario hábil colombiano parametrizable (festivos, cierres LIS, suspensión anticipada por vacaciones); vencimientos → tareas DEFINIR_ESTADO; notificaciones buzón + correo.
- **C — Analítica:** indicadores operativos; ranking de estudiantes (peticiones, ayudas, incumplimientos) y de donadores (completadas vs. fallidas), **separado** del puntaje de prioridad; alertas de incumplimiento. Fórmulas \[PEND P-11\].

**11\. MVP por niveles (ver sección E)**

**12\. Viabilidad y riesgos (ver sección F)**

**D. Objetivos con indicadores**

**Objetivo general:** Desarrollar una plataforma web de tres capas que permita al LIS gestionar de forma priorizada, privada y trazable la intermediación de donaciones y peticiones de productos, desde su publicación hasta su entrega, devolución o destino institucional.

| **ID** | **Objetivo específico**                                                                                                                 | **Indicador de cumplimiento**                                                                                                                                                                                                                                                            | **Evidencia**                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| OE1    | Implementar la solución como tres componentes independientes (Angular, API NestJS, SQL Server) con capas diferenciadas.                 | 3 componentes que arrancan y se configuran por separado; endpoint de salud responde 200 e informa conexión a BD; 0 secretos en el código.                                                                                                                                                | Demo en vivo, capturas, URL/puertos, diagrama de despliegue.          |
| OE2    | Garantizar autenticación Google verificada en servidor, autorización por rol y privacidad por campo.                                    | 100 % de endpoints no públicos rechazan sin token (401) o rol incorrecto (403) en pruebas; ninguna respuesta a invitado/estudiante/donador contiene identidad o contacto; dominio @udea.edu.co exigido solo al estudiante.                                                               | Pruebas automatizadas de RBAC/privacidad, matriz de visibilidad.      |
| OE3    | Implementar el flujo central de intermediación con trazabilidad completa en OFERTA_X_PETICION.                                          | Escenario completo publicación→aprobación→asignación→custodia→entrega ejecutado con datos ficticios; Σ asignado ≤ cantidad de la oferta y ≤1 asignación vigente por petición, garantizados en BD y probados con concurrencia; recorrido de un producto reconstruible desde el historial. | Prueba e2e, prueba de concurrencia, consulta de historial.            |
| OE4    | Construir un motor de emparejamiento con KD-tree adaptativo o R-tree (elegido y justificado en F5) y puntaje de prioridad configurable. | Resultados idénticos a una búsqueda lineal de referencia en ≥N conjuntos ficticios (N se fija en F5); complejidad documentada y medida; 0 asignaciones sin confirmación humana; LOCAL siempre última opción.                                                                             | Pruebas unitarias, benchmark, documento algorítmico.                  |
| OE5    | Automatizar el ciclo de vida con plazos en días hábiles colombianos, tareas DEFINIR_ESTADO y notificaciones en dos canales.             | Casos de prueba de calendario (fines de semana, festivos trasladables, cierres LIS) pasan al 100 %; cada vencimiento genera 1 tarea + notificación interna + correo al auxiliar y al usuario implicado.                                                                                  | Pruebas de calendario, bitácora de notificaciones, correos de prueba. |
| OE6    | Ofrecer analítica operativa, rankings de comportamiento y alertas de incumplimiento.                                                    | Indicadores y rankings calculados por el sistema coinciden con el cálculo manual sobre un dataset ficticio de referencia.                                                                                                                                                                | Panel, dataset de prueba, hoja de verificación.                       |
| OE7    | Asegurar calidad y defensa: evidencia fotográfica privada, auditoría, pruebas y documentación.                                          | Fotos accesibles solo por endpoint autorizado (pruebas 401/403) y con hash verificado; cada cambio de estado y eliminación excepcional registra actor, fecha, motivo y reautenticación; matriz de evidencias completa.                                                                   | Pruebas, registros de auditoría, manuales, matriz final.              |

**E. MVP por niveles**

| **Nivel**        | **Contenido**                                                                                                             | **Criterio** | **Entregable verificable**                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------- |
| N0 Higiene       | Secretos a variables de entorno, .gitignore, CORS restringido, BD nueva por migraciones, endpoint de salud                | 1, 7         | 3 componentes arrancando; repo sin secretos           |
| N1 Ruta vertical | Login Google + roles + publicar oferta/petición + aprobar + catálogo anónimo                                              | 1, 2, 3      | Demo login por perfil y catálogo sin datos personales |
| N2 Flujo central | Asignación manual con cantidad, recepción con foto, custodia, entrega con foto, cancelación, devolución, LOCAL, historial | 3            | Escenario e2e completo                                |
| N3 Pilar A       | Árbol espacial + prioridad + sugerencias                                                                                  | 4            | Pruebas vs. búsqueda lineal                           |
| N4 Pilar B       | Calendario hábil, vencimientos, DEFINIR_ESTADO, buzón + correo                                                            | 5            | Pruebas de calendario y notificaciones                |
| N5 Pilar C       | Indicadores, rankings, alertas                                                                                            | 6            | Panel validado contra dataset                         |
| N6 Defensa       | Eliminación auditada con reautenticación, pruebas finales, despliegue, manuales                                           | 7            | Matriz de evidencias                                  |

**F. Viabilidad, restricciones y riesgos**

| **Aspecto**          | **Situación**                                                                    | **Mitigación**                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Stack                | Angular 22 / NestJS 12 / TypeORM / SQL Server ya funcionando en el CRUD \[CRUD\] | Reutilizar patrón controller/service/DTO y ValidationPipe.                                                                                |
| Seguridad actual     | Credenciales en código, CORS abierto, datos expuestos, DELETE físico \[CRUD\]    | Se corrige en N0/N1 antes del primer commit.                                                                                              |
| SQL Server Express   | Límite 10 GB por BD; fotos en BD \[EQ D-36\]                                     | Tamaño máximo y compresión de fotos; tabla de contenido separada.                                                                         |
| Google OIDC          | Requiere proyecto y Client ID en Google Cloud Console (paso manual)              | Se detalla paso a paso en F3.                                                                                                             |
| Correo               | Requiere cuenta SMTP o servicio transaccional (paso manual)                      | Se decide en F6.                                                                                                                          |
| Festivos colombianos | Festivos trasladables (Ley Emiliani) y Semana Santa variable                     | Calendario parametrizable en BD; fuente y responsable en F2/F6 \[PEND P-12\].                                                             |
| Concurrencia         | Dos auxiliares asignando la misma oferta                                         | Transacciones + restricciones en BD (p. ej., índice único filtrado de SQL Server para "una asignación vigente por petición") \[PROP F4\]. |
| Despliegue           | Demo en vivo aceptada \[EQ\]; entorno exacto por definir                         | F6/F9.                                                                                                                                    |
| Alcance              | Muchas reglas para un semestre                                                   | MVP por niveles; pilares después de la ruta vertical.                                                                                     |

**G. Supuestos, decisiones y preguntas**

**G.1 Pendientes que NO bloquean F1 (fase de resolución)**

P-03 (dominio/provisión admin, F3) · P-04 (¿peticiones asignadas cuentan en el límite de 5?, F2 — \[PROP\] sí cuentan, porque siguen "hechas" y no cerradas) · P-05 (modelo LOCAL, F2/F4) · P-06 (entrega incompleta, F2/F4) · P-07 (duración/número de aplazamientos del donador, F2) · P-08 (custodia LOCAL 3 días, F2) · P-09/P-10/P-11 (dimensiones, fórmulas, ranking, F5) · P-12 (festivos/cierres, F2/F6) · P-14 (reautenticación, F3/F6) · P-17 (foto en devolución, F2/F4) · P-18 (inventario LOCAL, F2/F4) · P-19 (aprobación parcial de oferta, F2) · P-20 (política de contacto, F2/F3).

**G.2 Pendientes nuevos detectados (se registrarán tras aprobación)**

| **ID** | **Pendiente**                                                                                                                                                   | **Fase** |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| P-21   | ¿El donador puede ser una organización (persona jurídica) además de persona natural? (derivado del paralelo con Fundacion, D-34)                                | F2/F3    |
| P-22   | Si una oferta está parcialmente asignada, ¿el donador puede cancelar el **remanente no asignado**? (la regla solo prohíbe cancelar lo asignado)                 | F2       |
| P-23   | Al **reasignar** un producto que ya está EN_CUSTODIA, el nuevo intento en OFERTA_X_PETICION ¿nace directamente en EN_CUSTODIA y qué plazo del estudiante corre? | F2/F4    |
| P-24   | Detalle de fotos en BD: tamaño máximo, formatos, compresión, retención y si la devolución también exige foto (enlaza P-17).                                     | F4/F6    |

**G.3 Estado actualizado de pendientes existentes**

P-01 → CERRADO por D-31/D-33 · P-02 → CERRADO por D-32 · P-13 → enfoque decidido (D-36), detalle P-24 · P-15 → CERRADO por D-34 · P-16 → CERRADO por D-33.

**H. Matriz de trazabilidad a la rúbrica**

| **Criterio de rúbrica \[PROF\]**                | **Objetivo** | **Funcionalidad / módulo**                                                                          | **Diseño en** | **Prueba**                                               | **Evidencia**                        |
| ----------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------- | ------------------------------------ |
| 1\. Tres componentes independientes             | OE1          | Angular, API NestJS, SQL Server; endpoint de salud; config por entorno                              | F6            | Arranque independiente, health check                     | Demo en vivo, diagrama de despliegue |
| 2\. Google Auth + dominio institucional         | OE2          | Verificación ID token en servidor; regla de dominio por perfil; alta de perfiles excluyentes        | F3            | Tokens inválidos/expirados/dominio incorrecto rechazados | Video/captura de login por perfil    |
| 3\. Capas, roles, permisos, protección de datos | OE1, OE2     | Guards RBAC, DTO de salida por rol, catálogo anónimo, caracterización solo admin                    | F3, F6        | Pruebas 401/403 y de campos expuestos                    | Matriz de visibilidad + resultados   |
| 4\. Flujo LIS completo                          | OE3          | Ofertas, peticiones, aprobación, OFERTA_X_PETICION, custodia, entrega, devolución, LOCAL, historial | F2, F4        | e2e, concurrencia, invariantes                           | Escenario demo + historial           |
| 5a. Emparejamiento KD/R-tree + prioridad        | OE4          | Árbol espacial, puntaje, sugerencias, confirmación humana                                           | F5            | Árbol vs. búsqueda lineal; complejidad                   | Documento algorítmico + benchmark    |
| 5b. Ciclo de vida, plazos, notificaciones       | OE5          | Calendario hábil, vencimientos, DEFINIR_ESTADO, buzón + correo                                      | F2, F6        | Casos de calendario y notificaciones                     | Bitácora + correos                   |
| 5c. Analítica y ranking                         | OE6          | Indicadores, rankings, alertas                                                                      | F5            | Dataset de referencia                                    | Panel                                |
| Calidad/pruebas/documentación                   | OE7          | Fotos privadas en BD, auditoría, eliminación con reautenticación                                    | F4, F8, F9    | Acceso a fotos, registros de auditoría                   | Manuales, matriz de evidencias       |

**I. Control de coherencia**

| **#** | **Tensión**                                                                       | **Resolución**                                                                                                                             |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T1    | Directrices dicen MySQL/JavaScript; se usará SQL Server/TypeScript.               | Prevalece la aclaración expresa posterior del usuario (jerarquía nivel 1). Se recomienda confirmación escrita del profesor como evidencia. |
| T2    | "Almacenamiento privado" de fotos vs. fotos en BD.                                | Compatible: la BD no es pública; las fotos se sirven solo vía endpoint autorizado. Vigilar límite de 10 GB.                                |
| T3    | Orden de rúbrica (A antes que B) vs. dependencia técnica.                         | Los plazos (B) dependen de los estados del flujo (N2), no del algoritmo (A); el orden N3→N4 se mantiene.                                   |
| T4    | Donador "no puede cancelar después de asignada" con oferta parcialmente asignada. | Abierto como P-22; no se asume.                                                                                                            |
| T5    | Reasignación de producto ya en custodia.                                          | Abierto como P-23; no se trata como cancelación que libera disponibilidad.                                                                 |
| T6    | CANCELADO vs DEVOLUCION.                                                          | Se mantienen distintos; el anteproyecto no los usa como sinónimos.                                                                         |
| T7    | Petición sin cantidad.                                                            | El anteproyecto no menciona cantidad solicitada; la cantidad vive en la asignación.                                                        |
| T8    | Categoría en el árbol.                                                            | Se usa como filtro de igualdad/partición, nunca como distancia.                                                                            |

Sin contradicciones con las reglas no negociables.

**J. Pasos tras la aprobación (incluye pasos manuales)**

**Paso 1 — Revisión (usted, manual).** Lea este borrador. Anote cambios en: título, objetivos/indicadores, exclusiones (sección 7) y la propuesta de P-04 (asignadas cuentan en el límite de 5).

**Paso 2 — Confirmación del profesor (usted, manual, recomendado, no bloqueante).** Envíe un correo breve: _"Profesor, confirmamos que usaremos SQL Server como motor y NestJS (TypeScript, que compila a JavaScript) en el backend, manteniendo tres capas diferenciadas y componentes independientes con demostración en vivo. ¿Está de acuerdo?"_ Guarde la respuesta (PDF o captura) para la matriz de evidencias.

**Paso 3 — Aprobar y cambiar de modo (usted, manual).** En el diálogo de aprobación del plan que aparecerá en VS Code:

1. Si quiere cambios, elija seguir planeando y escriba los ajustes.
2. Si aprueba, elija la opción de aprobar **con aprobación manual de ediciones** (no la de aceptar ediciones automáticamente), para revisar cada archivo antes de que se escriba. _Justificación del momento:_ el contenido ya estaría aprobado, y la única acción siguiente es escribir documentos, que requiere modo de edición.

**Paso 4 — Ejecución limitada (Claude), solo documentación:**

1. Crear docs/planeacion/01_anteproyecto.md con las secciones B (índice) y C–I, versión 1.0, fecha 2026-11-18.
2. Actualizar docs/01_decisiones_y_pendientes.md: agregar D-31…D-36, P-21…P-24 y marcar el nuevo estado de P-01, P-02, P-13, P-15, P-16 (sección G.3).
3. **No** se toca código, BD, dependencias ni git (sin commits).

**Paso 5 — Verificación.**

- git status debe mostrar solo docs/planeacion/01_anteproyecto.md (nuevo) y docs/01_decisiones_y_pendientes.md (modificado) como cambios respecto al estado inicial.
- Se mostrará el resumen/diff de ambos archivos.
- Usted revisa y aprueba el documento versionado → se vuelve a Plan mode para **F2 — Requisitos y procesos**.