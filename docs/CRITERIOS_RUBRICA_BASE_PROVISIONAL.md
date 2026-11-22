# Criterios de evaluación base — provisional hasta localizar la rúbrica oficial

Este documento resume los criterios consignados en las directrices del proyecto. No representa una rúbrica oficial completa ni asigna porcentajes/puntajes no proporcionados.

| ID | Criterio base | Evidencia que debe buscarse |
|---|---|---|
| R1 | Tres componentes independientes: frontend, backend/API y base de datos. | Despliegues/URLs independientes, health check API, conexión controlada y documentación. |
| R2 | Autenticación con Google, validación del dominio institucional de estudiantes. | Flujo OIDC, verificación de ID token en backend y casos positivo/negativo. |
| R3 | Arquitectura en capas y seguridad por roles. | Separación presentación/negocio/datos; guards; RBAC backend; privacidad por rol y campo. |
| R4 | Flujo central LIS. | Publicación de oferta/petición, aprobación, catálogo anónimo, asignación, recepción, custodia, entrega/devolución y trazabilidad. |
| R5 | Emparejamiento semiautomático y prioridad. | KD-tree adaptativo o R-tree realmente implementado, búsqueda compatible, puntuación documentada, pruebas y decisión humana. |
| R6 | Ciclo de vida, plazos y notificaciones. | Estados, calendario hábil colombiano, tareas `DEFINIR_ESTADO`, aplazamiento, reasignación, devolución, buzón y correo. |
| R7 | Analítica y comportamiento. | Ranking de estudiantes, ranking de donadores, alertas y validación de fórmulas. |
| R8 | Calidad y defensa. | Pruebas automatizadas, seguridad, concurrencia, documentación, manuales y demostración verificable. |

## Estado

Todos los criterios empiezan como **PENDIENTE DE AUDITORÍA**. No marques ninguno como cumplido sin localizar evidencia en el repositorio o un entorno desplegado.

Cuando se encuentre la rúbrica oficial, añade sus criterios exactos y ponderaciones, conservando esta tabla solo como trazabilidad de directrices.
