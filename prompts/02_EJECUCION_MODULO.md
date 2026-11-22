# Prompt 02 — Ejecutar un módulo aprobado

Usa este prompt para cada módulo individual del plan de cierre, nunca para implementar todo el sistema de una sola vez.

## Entrada

El usuario indicará el módulo aprobado, su alcance, criterios de aceptación y archivos permitidos. Lee además la matriz de rúbrica y la documentación vigente.

## Antes de editar

1. Reconfirma el objetivo y los criterios de aceptación.
2. Inspecciona la implementación actual y las dependencias directas.
3. Presenta el diseño técnico, lista exacta de archivos que crearás/modificarás y migraciones necesarias.
4. Identifica impactos de seguridad, privacidad, integridad, concurrencia y datos.
5. Enumera comandos que ejecutarás y posibles efectos.
6. No amplíes el alcance sin permiso.

Espera aprobación explícita y utiliza Manual / Request approval.

## Durante la implementación

- Implementa el cambio mínimo completo en el módulo aprobado.
- Respeta la arquitectura y convenciones reales del repositorio.
- No introduzcas dependencias innecesarias.
- Mantén DTOs, validación, autorización backend y manejo de errores.
- Usa transacciones en operaciones que afecten asignaciones/cantidades/estados.
- No expongas datos personales o sensibles.
- No incluyas secretos en código, documentos, logs ni commits.
- No ejecutes migraciones destructivas ni comandos sobre producción.
- No simules algoritmos/estructuras exigidos con consultas ordinarias sin documentar y aprobar la alternativa.

## Después de implementar

1. Ejecuta las pruebas aprobadas y reporta comandos/códigos de salida.
2. Añade o actualiza pruebas del comportamiento nuevo y casos negativos.
3. Verifica que no se rompieron flujos existentes relacionados.
4. Actualiza la documentación y matriz de trazabilidad.
5. Lista archivos cambiados y resumen del diff.
6. Informa criterios de aceptación cumplidos/no cumplidos y deuda pendiente.
7. Propón el siguiente módulo, pero no lo inicies automáticamente.

## Definición de terminado por módulo

Un módulo solo se declara terminado cuando:
- Cumple los criterios de aceptación aprobados.
- Está integrado en la capa correspondiente.
- Tiene validaciones y permisos backend.
- Tiene pruebas relevantes ejecutadas y satisfactorias, o las limitaciones están declaradas.
- Su documentación está actualizada.
- La evidencia de rúbrica se puede demostrar.

Detente y espera revisión antes del siguiente módulo.
