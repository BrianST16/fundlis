/* =====================================================================
   009 - Parametro MIN_DONACIONES_RECURRENTE (D-49)
   ---------------------------------------------------------------------
   Numero de donaciones COMPLETADAS (llegaron completas al LIS) a partir
   del cual un donador se marca como "recurrente" en Aprobaciones.
   Es informativo: ayuda a decidir, no aprueba automaticamente.
   Solo inserta si no existe (no pisa un valor ya configurado).
   ===================================================================== */
MERGE PARAMETRO AS t
USING (VALUES
    ('MIN_DONACIONES_RECURRENTE', '3',
     'Donaciones completadas para marcar a un donador como recurrente en Aprobaciones')
) AS s(clave, valor, descripcion)
ON t.clave = s.clave
WHEN NOT MATCHED THEN INSERT (clave, valor, descripcion) VALUES (s.clave, s.valor, s.descripcion);
GO
