# Prompt 03 — Reauditoría final de cumplimiento

Ejecutar cuando todos los módulos del plan se hayan implementado y el usuario autorice la verificación integral.

Revisa la aplicación completa, no solo el código modificado recientemente.

1. Ejecuta los tests, lint, typecheck y builds disponibles, en entornos seguros.
2. Ejecuta integración/e2e únicamente contra una BD de pruebas claramente identificada.
3. Recorre los flujos de invitado, estudiante, donador, auxiliar y administrador.
4. Verifica aislamiento de datos y autorización backend por rol y campo.
5. Verifica los tres componentes independientes y su despliegue/URLs.
6. Verifica Google OIDC y la restricción de dominio del estudiante.
7. Verifica las cantidades y la tabla `OFERTA_X_PETICION`, cancelaciones históricas, reactivación de peticiones, destino LOCAL, plazos, calendario, notificaciones y fotografías.
8. Verifica la estructura KD/R-tree, prioridad, ranking de conducta y sus pruebas.
9. Revisa la matriz de rúbrica y exige evidencia para cada ✔.
10. Revisa manuales, README, datos de demostración ficticios y guion de sustentación.

Clasifica cada criterio como VERIFICADO, PARCIAL, NO VERIFICADO o NO CUMPLIDO. No declares 100% si hay criterios sin evidencia. Señala defectos residuales, riesgos y correcciones mínimas. No hagas cambios sin presentar primero el plan de corrección y obtener aprobación.
