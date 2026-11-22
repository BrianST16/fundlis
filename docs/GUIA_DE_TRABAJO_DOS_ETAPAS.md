# Guía de trabajo: auditar primero, terminar después

## Etapa A — Verificar y auditar

Esta etapa responde: ¿qué funciona realmente hoy?, ¿qué está probado?, ¿qué pide la rúbrica?, ¿qué contiene y qué le falta al anteproyecto?

### A1. Estado técnico
- Confirmar raíz del repositorio y estado Git.
- Inventariar tecnologías, versiones, módulos, rutas, entidades, servicios, endpoints, migraciones, pruebas y despliegues.
- Comparar contra la auditoría base sin asumir que la situación permanece igual.
- Clasificar los comandos de verificación por impacto.
- Ejecutar lint, test, build, smoke e integración solo con autorización y entorno seguro.

### A2. Estado académico
- Localizar la rúbrica oficial. Si no existe en el repositorio, pedirla y marcar la evaluación como provisional.
- Localizar el anteproyecto generado y confirmar su versión vigente.
- Revisar coherencia con directrices, decisiones, alcance, MVP, objetivos y tres pilares.
- Separar lo que está escrito en el anteproyecto de lo que realmente está implementado.

### A3. Resultado
- Informe de funcionamiento con evidencia de comandos y pruebas.
- Matriz de rúbrica con estado y evidencia.
- Informe de faltantes del anteproyecto.
- Matriz de brechas del software.
- Lista priorizada P0–P3 y dependencias.

No modificar código ni documentos hasta revisar el informe.

## Etapa B — Terminar el proyecto

Una vez aprobado el diagnóstico:

1. Resolver decisiones bloqueantes del stack, datos y despliegue.
2. Asegurar configuración, credenciales, repositorio y entornos.
3. Completar autenticación y seguridad.
4. Completar el flujo de ofertas, peticiones, aprobaciones y asignaciones.
5. Completar el motor de emparejamiento y prioridad.
6. Completar plazos, tareas, custodia, notificaciones y devoluciones.
7. Completar analítica y rankings.
8. Completar pruebas, despliegue, manuales y evidencia de sustentación.

Cada módulo debe tener criterios de aceptación y pruebas. No se considera terminado por existir únicamente una pantalla o endpoint.
