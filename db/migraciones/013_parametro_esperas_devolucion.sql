/* =====================================================================
   013 - Parametro MAX_ESPERAS_DEVOLUCION (D-62)
   ---------------------------------------------------------------------
   Una devolucion pendiente al donador (asignacion "en devolucion" o
   destino Local "por devolver") admite UNA espera de
   PLAZO_ESPERA_LOCAL_DIAS_HABILES. Despues hay que decidir: custodia
   Local (publicado) o, solo el administrador, recibirlo para el LIS.
   El administrador puede dar mas tiempo aun agotado el tope (casos
   anomalos); queda registrado en la tarea.
   Solo inserta si no existe (no pisa un valor ya configurado).
   ===================================================================== */
MERGE PARAMETRO AS t
USING (VALUES
    ('MAX_ESPERAS_DEVOLUCION', '1',
     'Esperas permitidas en una devolucion pendiente antes de decidir custodia Local o recibirla para el LIS')
) AS s(clave, valor, descripcion)
ON t.clave = s.clave
WHEN NOT MATCHED THEN INSERT (clave, valor, descripcion) VALUES (s.clave, s.valor, s.descripcion);
GO
