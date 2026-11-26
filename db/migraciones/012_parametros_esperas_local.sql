/* =====================================================================
   012 - Parametros de espera en Local y lotes (D-60)
   ---------------------------------------------------------------------
   Esperar siempre tiene fecha. En custodia temporal Local, lote sin
   destino y devolucion pendiente al donador, "esperar" da un plazo nuevo
   de PLAZO_ESPERA_LOCAL_DIAS_HABILES; al vencer se crea otra tarea
   DEFINIR_ESTADO. Tras MAX_ESPERAS_LOCAL esperas hay que decidir destino.
   "Por devolver" (el donador rechazo o el LIS decidio devolver) tiene
   PLAZO_POR_DEVOLVER_DIAS_HABILES para registrar la devolucion.
   Los valores se cambian aqui (el panel de configuracion del
   administrador queda fuera del alcance por ahora).
   Solo inserta si no existe (no pisa un valor ya configurado).
   ===================================================================== */
MERGE PARAMETRO AS t
USING (VALUES
    ('PLAZO_ESPERA_LOCAL_DIAS_HABILES', '5',
     'Dias habiles que da cada "esperar" en custodia Local, lote sin destino o devolucion pendiente'),
    ('MAX_ESPERAS_LOCAL', '2',
     'Esperas permitidas por objeto antes de tener que decidir su destino'),
    ('PLAZO_POR_DEVOLVER_DIAS_HABILES', '5',
     'Dias habiles para registrar la devolucion al donador cuando un destino Local queda por devolver')
) AS s(clave, valor, descripcion)
ON t.clave = s.clave
WHEN NOT MATCHED THEN INSERT (clave, valor, descripcion) VALUES (s.clave, s.valor, s.descripcion);
GO
