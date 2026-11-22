# Prompt 00 — Auditoría integral del estado actual

## Contexto

El usuario ha avanzado considerablemente desde la auditoría inicial. El documento `docs/DIAGNOSTICO_CRUD_BASE.md` es únicamente una línea base histórica. No asumas que sus hallazgos siguen vigentes.

## Objetivo

Verificar el estado real y actual del proyecto, determinar qué funciona, auditar el anteproyecto generado y evaluar el cumplimiento de la rúbrica/directrices. Identificar exactamente qué falta para terminar.

## Reglas de seguridad

- Comienza en Plan mode.
- Esta primera exploración no debe modificar código, documentos, configuraciones ni BD.
- No instales dependencias, no ejecutes migraciones ni seeds, no borres archivos, no hagas commits/pushes.
- Nunca imprimas secretos ni valores de `.env`.
- No uses bases de producción ni datos personales reales.
- Antes de ejecutar pruebas/builds que creen artefactos, presenta los comandos, alcance y efectos esperados. Espera aprobación para pasar a Manual y ejecutarlos.

## Paso 1 — Confirmar workspace

- Determina la ruta raíz del workspace.
- Verifica que contiene frontend, backend y documentación/BD si existen.
- Comprueba que no estás en una subcarpeta (`frontend`) ni en una copia equivocada.
- Revisa `git status --short`, ramas y commits sin revelar secretos.
- Si no es la raíz correcta, detente y explica cómo abrirla.

## Paso 2 — Identificar las fuentes

Lee `CLAUDE.md`, directrices, registro de decisiones, resumen del proyecto y diagnóstico anterior si existen.

Busca dentro del repositorio y subcarpetas el anteproyecto generado. No presupongas nombre ni ruta. Busca documentos `.md`, `.docx`, `.pdf`, `.odt` y similares con nombres que contengan anteproyecto, proyecto, definición, propuesta o formulación. Para cada candidato registra nombre, ruta, fecha/modificación si disponible, versión y señales de aprobación.

- Si hay un único anteproyecto claramente vigente, úsalo.
- Si hay varios y no está claro cuál es el vigente, no elijas arbitrariamente: presenta la lista y pide identificación.
- Si no hay anteproyecto, informa que no se encontró y solicita su incorporación. No redactes uno como sustituto durante esta auditoría.

Busca además la rúbrica oficial, guía de evaluación, enunciado, anexos y criterios del profesor. Si solo encuentras un resumen de criterios en las directrices, indícalo y trata la auditoría como provisional. No inventes ponderaciones, porcentajes, puntajes ni entregables ausentes.

## Paso 3 — Auditoría técnica del repositorio actual

Inspecciona, sin cambiar:

- Estructura de carpetas y tecnologías/versions reales.
- `package.json`, scripts, lockfiles y dependencias.
- Frontend: rutas, páginas, componentes, guards, interceptors, servicios, formularios, manejo de errores y variables de entorno.
- Backend: módulos, controladores, DTOs, validaciones, servicios, repositorios, guards, estrategias de autenticación, autorización, CORS, logging y manejo de excepciones.
- Datos: entidades, relaciones, índices, restricciones, migraciones, scripts y conexión configurada (sin mostrar secretos).
- Archivos de infraestructura y despliegue: Docker, CI/CD, hosting, README, `.env.example`, `.gitignore`.
- Pruebas existentes: unitarias, integración y e2e. Inspecciona su configuración y dependencias.
- Evidencia de los tres componentes desplegables: frontend, backend/API y BD.

Compara la implementación actual con `DIAGNOSTICO_CRUD_BASE.md` y destaca qué ha cambiado desde la línea base anterior.

## Paso 4 — Diseñar y ejecutar verificación funcional segura

Primero presenta un plan de validación que clasifique cada comando:

- Lectura/inspección sin efectos persistentes.
- Lint o análisis estático.
- Pruebas unitarias.
- Pruebas de integración/e2e.
- Build/compilación.
- Arranque de frontend y backend.
- Smoke tests HTTP.
- Verificación de conexión a BD.

Para cada comando indica script real, carpeta, si escribe artefactos, si requiere servicios, si toca BD y riesgo.

No inventes scripts. Obtén los scripts reales de `package.json`.

Prioriza:
1. Lint/typecheck/build sin conexión a datos reales.
2. Pruebas unitarias aisladas.
3. Pruebas de integración solo con base de pruebas identificada.
4. Arranque local y verificaciones HTTP de lectura.
5. Flujos completos solo con datos ficticios y entorno de desarrollo.

No envíes POST/PUT/PATCH/DELETE a una BD cuya naturaleza de desarrollo/prueba no esté demostrada. No ejecutes pruebas e2e que puedan alterar datos reales.

Cuando termine la inspección, espera autorización para pasar a Manual y ejecutar las pruebas/builds aprobados. Informa resultados exactos: comando, código de salida, tests pasados/fallidos/omitidos y mensajes relevantes sin secretos.

## Paso 5 — Auditoría del anteproyecto

Evalúa el documento localizado según:

- Correspondencia con el problema real del LIS.
- Justificación técnica, social y académica.
- Coherencia entre objetivo general y objetivos específicos.
- Objetivos específicos medibles/verificables.
- Actores, roles y privacidad correctamente descritos.
- Alcance, exclusiones y límites realistas.
- Descripción de solución y flujo central LIS.
- Tres pilares diferenciadores descritos sin prometer implementaciones inexistentes.
- Viabilidad técnica y stack realmente permitido.
- MVP y priorización.
- Coherencia con las directrices y aclaraciones vigentes.
- Alineación con la rúbrica oficial, cuando esté disponible.
- Referencias, estilo académico, consistencia terminológica y afirmaciones sin respaldo.

Distingue calidad del documento (anteproyecto) de grado de implementación del software. Un objetivo escrito no demuestra que la función esté implementada.

## Paso 6 — Matriz de cumplimiento

Usa como mínimo los criterios base que aparecen en las directrices del proyecto:

1. Tres componentes desplegables e identificables: frontend, API/backend y BD.
2. Autenticación Google y restricción institucional para estudiantes.
3. Arquitectura en capas, RBAC en backend, privacidad y protección de información.
4. Flujo de intermediación LIS: publicación, aprobación, catálogo anónimo, asignación, recepción, custodia, entrega/devolución y trazabilidad.
5. Pilar algorítmico: estructura KD/R, compatibilidad, puntuación de prioridad y confirmación humana.
6. Pilar de ciclo de vida: plazos hábiles, tareas `DEFINIR_ESTADO`, aplazamientos/reasignación/devolución y notificación dual.
7. Pilar analítico: ranking de estudiantes, ranking de donadores y alertas de incumplimiento.
8. Pruebas, seguridad, documentación y evidencia demostrable.

Si la rúbrica oficial añade o cambia criterios, adapta la matriz y conserva ambas fuentes diferenciadas.

Para cada criterio registra:
- Estado: IMPLEMENTADO Y VERIFICADO / IMPLEMENTADO SIN PRUEBA / PARCIAL / SOLO DISEÑADO / AUSENTE / BLOQUEADO / NO VERIFICABLE.
- Evidencia concreta: ruta, clase, endpoint, entidad, test, comando o URL.
- Brecha exacta.
- Riesgo/severidad.
- Acción necesaria.
- Prueba de aceptación que cerraría la brecha.

No marques como implementado algo que solo aparece en un documento o una pantalla sin backend.

## Paso 7 — Plan para terminar

Clasifica brechas:
- P0: bloquea arquitectura, seguridad, datos o decisiones de stack.
- P1: requisito obligatorio de la rúbrica/MVP.
- P2: necesario para cerrar flujos y calidad.
- P3: mejora o ampliación no necesaria para aprobar.

Propón orden por dependencias, no por preferencia personal. Para cada trabajo indica módulos/archivos probablemente afectados, dependencias, riesgos, criterios de aceptación, pruebas y evidencia de rúbrica. No estimes fechas ni prometas duración.

## Entregable final de esta auditoría

Presenta en la conversación, sin guardar archivos todavía:

A. Resumen ejecutivo del estado actual.
B. Workspace, fuentes encontradas y documento de anteproyecto identificado.
C. Rúbrica oficial localizada o declaración de auditoría provisional.
D. Verificación técnica: qué inspeccionaste y qué pruebas ejecutaste/no ejecutaste.
E. Matriz de cumplimiento de rúbrica con evidencia.
F. Auditoría del anteproyecto: fortalezas, contradicciones, omisiones y correcciones concretas.
G. Inventario de funcionalidades: implementado, parcial, ausente.
H. Decisiones bloqueantes (especialmente MySQL vs SQL Server y JavaScript vs TypeScript, si siguen abiertas).
I. Backlog priorizado para terminar el proyecto, con dependencias y pruebas de aceptación.
J. Recomendación del siguiente paso y modo de permisos.

Detente al finalizar. No implementes las brechas, no modifiques el anteproyecto ni guardes el informe hasta que el usuario y su supervisor revisen el resultado.
