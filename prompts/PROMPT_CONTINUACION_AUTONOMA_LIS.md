# Protocolo de continuación autónoma — LIS Dona

**Uso:** pegar este prompt en una conversación nueva de Claude Code desde la raíz real del repositorio, con Auto Mode habilitado si está disponible.

## 1. Objetivo y prioridad de esta instrucción

Para esta etapa, este prompt autoriza la continuación autónoma por lotes y prevalece sobre instrucciones anteriores de aprobación manual de cada fase o de cada archivo, pero **no** prevalece sobre las directrices del profesor, las reglas de negocio aprobadas ni las restricciones de seguridad de este documento.

Continuar el proyecto LIS Dona con autonomía operativa por lotes. Reducir las interrupciones y no pedir aprobación para cada decisión técnica menor. Trabajar hasta completar las tareas que no dependan de decisiones externas o de riesgos críticos, registrando evidencia y manteniendo el proyecto ejecutable.

La Etapa A ya tiene V1 completada: `npm test -- --no-cache` en backend, `npm run build` en backend y `npm run build` en frontend terminaron con código 0, según el informe de auditoría del 20-11-2026. No repitas estas verificaciones salvo que un cambio posterior las invalide.

## 2. Contexto que debes leer

Lee, en este orden:

1. `CLAUDE.md`.
2. `docs/00_directrices_profesor.md`.
3. `docs/01_decisiones_y_pendientes.md`.
4. El informe completo de Etapa A más reciente.
5. `prompts/01_PLAN_DE_CIERRE.md`.
6. El anteproyecto `docs/Anteproyecto_completo.md` y cualquier versión posterior que encuentres.
7. Código, esquema SQL, README y pruebas actuales.

El código y el informe de auditoría pueden haber cambiado desde el 20-11-2026. Inspecciona el estado actual antes de actuar. No supongas que los hallazgos anteriores siguen vigentes.

## 3. Jerarquía de autoridad

1. Directrices explícitas del profesor.
2. Aclaraciones explícitas del equipo.
3. Decisiones formalmente aprobadas y registradas.
4. Anteproyecto aprobado.
5. Propuestas técnicas documentadas como provisionales.
6. Código existente, que demuestra implementación pero no define por sí solo la regla de negocio.

No conviertas una propuesta en decisión aprobada. Distingue siempre `[PROF]`, `[EQ]`, `[PROP]`, `[PEND]` y `[CÓD]`.

## 4. Política de autonomía

Trabaja de forma autónoma y continua cuando la acción sea reversible, esté dentro del alcance aprobado y no comprometa datos reales, seguridad ni decisiones del profesor.

### Puedes decidir y ejecutar sin preguntar, documentando la decisión

- Organización interna de carpetas y nombres de archivos no contractuales.
- Refactorizaciones locales que preserven comportamiento y contratos.
- DTOs, validaciones, manejo de errores, logging sin datos sensibles y limpieza técnica.
- Pruebas unitarias, de integración sobre dobles/mocks y pruebas que usen exclusivamente datos ficticios.
- Mejoras de accesibilidad, interfaz y experiencia que no cambien reglas de negocio.
- Documentación técnica, diagramas, matrices de trazabilidad y actualización de READMEs.
- Selección de patrones y dependencias menores, siempre que justifiques la necesidad, compruebes compatibilidad y no alteres el stack aprobado.
- Decisiones técnicas reversibles: registra alternativa elegida, motivo, impacto y cómo revertirla.

### Debes detenerte y pedir autorización expresa solo para

- Conectarte a una base de datos cuya condición de desarrollo/pruebas y ausencia de datos reales no haya sido confirmada.
- Crear, borrar, restaurar, migrar o alterar esquemas/datos de una base de datos.
- Ejecutar comandos destructivos o borrar/modificar grandes conjuntos de archivos.
- Cambiar el motor de base de datos, framework principal, lenguaje, proveedor de identidad o arquitectura de despliegue.
- Añadir credenciales, enviar correos reales, publicar/desplegar o acceder a infraestructura externa.
- Cambiar una regla de negocio confirmada o decidir algo que el profesor deba validar.
- Hacer `git push`, publicar el repositorio o desplegar. Sí puedes inicializar Git localmente y preparar un commit base, pero solo después de revisar `.gitignore`, inspeccionar los archivos candidatos y verificar que `.env`, secretos, certificados, datos personales, `node_modules`, `dist` y cachés no estén staged. Nunca uses `git add .` sin revisar; muestra `git status` y `git diff --cached --stat` antes del commit. Si hay cualquier duda sobre secretos, no hagas el commit.

No preguntes por detalles menores. Si falta información no bloqueante, toma la alternativa más conservadora y reversible, márcala `[PROP]`, configúrala para poder cambiarse y continúa. Agrupa las decisiones pendientes en un único informe por lote, no interrumpas el trabajo por cada una.

## 5. Tratamiento de las decisiones H-1 a H-9

Usa estas instrucciones como política provisional para que el trabajo no se detenga innecesariamente:

- **H-1 — SQL Server / NestJS / TypeScript:** el código actual usa SQL Server Express, NestJS y TypeScript. Considéralos la línea base de implementación provisional. No migres a MySQL ni cambies TypeScript a JavaScript por iniciativa propia. Registra que la directriz inicial mencionaba MySQL/JavaScript y que se requiere confirmación escrita del profesor. Continúa tareas independientes del motor y evita añadir dependencia innecesaria al esquema hasta resolver la discrepancia.
- **H-2 — KD-tree:** prepara la comparación técnica y académica. Como hipótesis de diseño, prioriza separar compatibilidad de prioridad: el árbol debe buscar candidatos compatibles por atributos reales del producto y la prioridad socioeconómica/Sisbén/antigüedad debe ordenar los candidatos después. No uses identificadores de categoría como distancia ni presentes una ordenación escalar como búsqueda espacial. No reemplaces el algoritmo productivo hasta contar con atributos de compatibilidad justificados y registrar la decisión académica. Construye pruebas/benchmark aislados si no alteran el comportamiento principal.
- **H-3 — LOCAL y ubicación física:** diseña LOCAL como sujeto institucional/receptor final, no como usuario ni petición ficticia. Debe aparecer al final de la lista de posibles recibidores y su aceptación requiere autorización del administrador. Separa el intento de asignación de la ubicación/estado físico del producto. Elige un modelo normalizado que preserve recepciones y reasignaciones sin recepciones ficticias; documenta el diseño antes de migrar.
- **H-4 — Plazos, aplazamientos y festivos:** respeta 10 días hábiles para entrega del donador y 3 días hábiles para recogida del estudiante, con calendario `America/Bogota`, fines de semana, festivos colombianos y cierres del LIS. La tarea `DEFINIR_ESTADO` debe generar alerta bilateral y permitir decisión del auxiliar. Trata cualquier plazo adicional aún no fijado como parámetro configurable y propuesta, no como constante irreversible. La custodia/destino LOCAL contempla el periodo adicional de tres días indicado por el equipo; la espera puede gestionarla el auxiliar y la aceptación de la donación por LOCAL corresponde al administrador. Registra el punto exacto desde el que corre cada plazo y las reglas de extensión como decisiones por confirmar si las fuentes no lo precisan.
- **H-5 — Fórmula del ranking:** mantén separados prioridad de asignación y reputación/comportamiento. Diseña componentes normalizados, fórmula transparente, parámetros configurables y ejemplos reproducibles. Puedes proponer pesos y escenarios, pero no declares pesos definitivos ni los hardcodees como política aprobada sin aprobación del equipo.
- **H-6 — Reautenticación y correo:** diseña reautenticación con Google mediante una nueva autenticación interactiva y validación en backend de la evidencia temporal disponible; no almacenes contraseñas de Google. Para notificaciones, utiliza una interfaz/adaptador de correo y bandeja de salida; SMTP y credenciales quedan en variables de entorno. No envíes correos reales ni inventes credenciales.
- **H-7 — Supuestos:** (a) límite de cinco: cuenta las peticiones hechas que estén pendientes de aprobación o activas; una petición con asignación vigente sigue consumiendo cupo hasta su estado terminal; (b) preserva la aprobación explícita de ofertas y peticiones, como indican las directrices; (c) no canceles automáticamente una cantidad remanente disponible de una oferta si no existe regla que lo ordene; (d) por privacidad, restringe fotografías de movimientos a personal autorizado del LIS/administrador por defecto. El estudiante y donador reciben estados y notificaciones, no acceso indiscriminado a evidencias que puedan revelar identidades. Registra estos supuestos y verifica que coinciden con las decisiones vigentes.
- **H-8 — Anteproyecto:** trata `docs/Anteproyecto_completo.md` como el candidato vigente identificado en la auditoría, pero aún no aprobado. Conserva el original y prepara una versión académica corregida independiente; no confundas el texto de trabajo con aprobación oficial.
- **H-9 — Base de datos:** no presupongas que `LisDona` es de desarrollo ni que carece de datos reales. No te conectes ni ejecutes V2 hasta que el usuario confirme explícitamente esa condición. Mientras tanto, usa pruebas sin BD, mocks o una BD desechable creada solo tras autorización.

Si el repositorio contiene información más reciente que contradice alguna de estas instrucciones, detalla la contradicción y conserva la opción más segura hasta que se aclare.

## 6. Secuencia automática de trabajo

### Lote A — Plan de cierre

1. Relee el estado actual del repositorio.
2. Revalida el backlog de Etapa A contra el código actual.
3. Convierte cada brecha en una tarea pequeña con objetivo, archivos, dependencias, criterio de aceptación, pruebas y riesgo.
4. Prioriza: respaldo/control de versiones seguro; decisiones y documentación; seguridad crítica; integridad del flujo; LOCAL/ubicación; ciclo de vida; analítica; eliminación excepcional; pruebas; despliegue y manuales.
5. Identifica tareas bloqueadas por H-1, H-2 o H-9 y continúa las no bloqueadas.
6. Guarda el plan en `docs/planeacion/PLAN_CIERRE_LIS.md` si no existe; conserva versiones previas.

### Lote B — Ejecución por módulos

Después de generar el plan, empieza por la primera tarea no bloqueada y continúa automáticamente con la siguiente cuando sus pruebas pasen. No esperes una aprobación por cada archivo ni por cada decisión técnica menor.

Para cada módulo:

1. Inspecciona antes de editar.
2. Implementa el cambio mínimo coherente con la arquitectura existente.
3. Añade o actualiza pruebas.
4. Ejecuta las verificaciones relevantes que no requieran acceso a datos reales.
5. Corrige los fallos introducidos por el cambio.
6. Revisa regresiones en módulos relacionados.
7. Actualiza documentación y matriz de cumplimiento.
8. Registra archivos modificados, decisiones provisionales, pruebas, resultados y deuda técnica.
9. Continúa con el siguiente módulo no bloqueado.

Trabaja en lotes razonables, no en una única reescritura masiva. No dejes el repositorio en un estado intermedio roto al cambiar de lote.

### Lote C — Auditoría continua

Al cerrar cada módulo, asigna uno de estos estados: `IMPLEMENTADO Y VERIFICADO`, `IMPLEMENTADO SIN PRUEBA`, `PARCIAL`, `DISEÑADO`, `AUSENTE` o `BLOQUEADO`.

Nunca marques como verificado algo que solo compila. Adjunta el comando, resultado y evidencia. Actualiza:

- `docs/planeacion/PLAN_CIERRE_LIS.md`
- `docs/planeacion/MATRIZ_CUMPLIMIENTO_RUBRICA.md`
- `docs/planeacion/REGISTRO_DECISIONES.md`
- README/manuales cuando corresponda.

## 7. Reglas de calidad y seguridad

- No expongas `.env`, tokens, contraseñas, certificados, correos personales ni datos sensibles.
- No uses datos reales en pruebas.
- No desactives guards, validaciones, restricciones, auditoría ni controles de concurrencia para hacer pasar pruebas.
- No uses `synchronize: true` en TypeORM en entornos con datos.
- No cambies esquemas o datos reales sin autorización explícita y respaldo verificable.
- Toda operación de cantidades debe conservar invariantes y transacciones.
- Toda autorización se valida en backend; los guards del frontend son solo UX.
- Las imágenes de evidencia no deben filtrarse entre donador y estudiante.
- Preserva historial; evita borrados físicos.
- Si una prueba falla, no la ocultes ni la desactives: explica, corrige o documenta el bloqueo.

## 8. Reportes y cuándo pedir intervención

No preguntes al usuario para cada paso. Continúa de forma autónoma y detente solo cuando:

1. Una decisión del profesor sea indispensable para evitar incumplir la rúbrica.
2. Una decisión de negocio no esté respaldada por las directrices o aclaraciones.
3. Se requiera acceso a una base de datos posiblemente real, migración, envío de correo, despliegue o acción irreversible.
4. Exista una contradicción entre fuentes que pueda cambiar el modelo o causar pérdida de datos.

Cuando te detengas, presenta una única lista breve con: decisión exacta, por qué bloquea, recomendación, alternativa y tareas que sí puedes continuar mientras tanto.

Al terminar cada lote, entrega un resumen con: completado, verificado, pendiente/bloqueado, riesgos, archivos modificados y siguiente lote. Continúa con el siguiente lote no bloqueado sin esperar una confirmación genérica.

## 9. Instrucción de arranque

Comienza ahora por el Lote A. No te limites a devolver otro informe general. Produce el plan detallado, actualiza los registros documentales y empieza el primer lote de implementación que no esté bloqueado por las reglas anteriores. Usa Auto Mode si está habilitado. Mantén fuera de alcance las acciones restringidas del apartado 4.
