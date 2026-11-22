# Prompt 01 — Plan de cierre del proyecto

Ejecutar únicamente después de que el usuario apruebe el informe de auditoría integral.

Lee `CLAUDE.md`, las directrices, decisiones, anteproyecto aprobado y el informe de auditoría revisado.

Tu objetivo es convertir las brechas aprobadas en un plan ejecutable para terminar el proyecto sin reconstruir innecesariamente lo que ya funciona.

## Requisitos

1. Actualiza la matriz de rúbrica con el estado aprobado de cada criterio.
2. Ordena el trabajo por dependencias y prioridad P0/P1/P2/P3.
3. Divide el trabajo en módulos/cortes verticales demostrables.
4. Para cada módulo define:
   - Resultado esperado.
   - Criterios de aceptación comprobables.
   - Componentes/capas afectados.
   - Entidades, endpoints, pantallas y servicios implicados.
   - Reglas de negocio cubiertas.
   - Pruebas unitarias, integración, e2e y seguridad.
   - Evidencia que se mostrará al profesor.
   - Dependencias y riesgos.
   - Qué se reutiliza del CRUD.
5. Aísla las decisiones bloqueantes. No decidas sin autorización el motor de BD (MySQL/SQL Server), lenguaje backend (JavaScript/TypeScript), estrategia de archivos ni reglas de negocio pendientes.
6. Propón una secuencia que priorice la rúbrica: arquitectura/entornos; identidad y seguridad; flujo central LIS; pilar algorítmico; gestión del ciclo de vida; analítica; pruebas; despliegue y sustentación.
7. Incluye hitos de control al finalizar cada módulo y una definición global de “terminado”.
8. No edites código ni documentos todavía.

## Formato de salida

- Resumen de estrategia.
- Matriz priorizada de brechas y trabajo.
- Diagrama de dependencias.
- Plan por módulos y criterios de aceptación.
- Matriz de trazabilidad criterio de rúbrica → requisito → módulo → prueba → evidencia.
- Decisiones que debe resolver el equipo/profesor.
- Primer módulo recomendado.
- Modo recomendado.

Detente y espera aprobación del usuario.
