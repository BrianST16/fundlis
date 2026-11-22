# Prompt maestro — Auditoría y finalización de la plataforma LIS

Lee y aplica `@CLAUDE.md`. Utiliza los documentos `@docs/00_directrices_profesor.md`, `@docs/01_decisiones_y_pendientes.md`, `@docs/RESUMEN_PROYECTO_LIS.md` y `@docs/DIAGNOSTICO_CRUD_BASE.md` como contexto vigente e histórico según la jerarquía indicada. No confundas la auditoría anterior con el estado actual del repositorio.

El anteproyecto generado por Claude Code debe localizarse dentro del repositorio. No se ha incorporado a este paquete porque no fue adjuntado a esta conversación. Encuéntralo, identifica su versión y contrástalo. Si no aparece o hay varias versiones sin aprobación clara, detente y solicita que el usuario identifique/incorpore el documento correcto.

La rúbrica oficial también debe localizarse. Si no está disponible, la matriz de evaluación será provisional y utilizará solamente los criterios de las directrices. No inventes ponderaciones.

## Secuencia obligatoria

### ETAPA A — Verificación y auditoría

Ejecuta `@prompts/00_AUDITORIA_INTEGRAL_ESTADO_ACTUAL.md`.

Audita dos dimensiones diferentes:

1. **Estado real del software:** inspección del código actual, ejecución controlada de pruebas/build/smoke tests y evidencia verificable de funcionamiento.
2. **Estado académico/documental:** calidad y suficiencia del anteproyecto, alineación a la rúbrica y brechas para defender el proyecto.

Primero inspecciona en Plan. Antes de ejecutar comandos que creen artefactos, arranquen servicios o consulten la BD, describe sus efectos y espera autorización. Nunca pruebes escritura contra producción ni una BD no identificada como desarrollo/prueba.

Entrega informe, matriz de rúbrica, brechas del anteproyecto y backlog de cierre. No edites código ni documentos hasta que el usuario apruebe el informe.

### Puerta de aprobación A

Espera aprobación expresa del usuario. Si el usuario aporta correcciones o respuestas, actualiza el diagnóstico antes de seguir.

### ETAPA B — Plan de cierre

Ejecuta `@prompts/01_PLAN_DE_CIERRE.md`. Ordena las tareas por dependencias, primero los bloqueos P0 y después los requisitos obligatorios de la rúbrica. No programes todavía. Espera aprobación del backlog.

### Puerta de aprobación B

Solo después de la aprobación del plan podrás empezar implementación.

### ETAPA C — Implementación incremental

Para cada módulo autorizado, ejecuta `@prompts/02_EJECUCION_MODULO.md`. Trabaja un módulo a la vez, con cambios acotados, pruebas, documentación y evidencia. Usa Manual / Request approval y pide aprobación de operaciones sensibles.

### ETAPA D — Reauditoría final

Una vez cerrados los módulos, y con autorización, ejecuta `@prompts/03_REAUDITORIA_FINAL.md`. No declares cumplimiento sin evidencia ejecutable y trazable.

## Conducta obligatoria

- Mantén trazabilidad requisito → diseño → código → prueba → evidencia.
- Distingue implementado, parcialmente implementado, solo diseñado y no implementado.
- No asumas que una pantalla equivale a una funcionalidad completa.
- No cambies tecnologías o motor de BD sin decisión autorizada.
- No ejecutes migraciones destructivas, seeds, commits, pushes ni despliegues sin permiso.
- No reveles secretos ni datos reales sensibles.
- No uses bypassPermissions ni auto-accept para este repositorio.
- Indica claramente cuándo permanecer en Plan y cuándo pasar a Manual.
- Al acabar cada tarea, detente y espera revisión.
