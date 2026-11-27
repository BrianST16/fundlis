/* =====================================================================
   014 - Historial inmutable (S3) y ofertas completadas (C3)  (D-64, D-65)
   ---------------------------------------------------------------------
   1) HISTORIAL_ESTADO es la auditoria: solo se agrega. Desde ahora la BD
      rechaza cualquier UPDATE o DELETE sobre ella, aunque venga de la
      aplicacion. Unica excepcion: el script de demostracion
      (db/03_demo_presentacion.sql) puede BORRAR sus propias filas [DEMO]
      marcando la sesion con SESSION_CONTEXT 'lis_mantenimiento_demo' = 1.
      Ademas, el usuario de la aplicacion no tiene permiso de UPDATE ni
      DELETE sobre la tabla (db/scripts/crear_usuario_app.sql, S4).
   2) Las ofertas aprobadas que ya no tienen nada por mover (sin unidades
      disponibles ni comprometidas, ni un destino Local esperando
      recepcion) pasan a CERRADA ("Completada"). Desde ahora la
      aplicacion lo hace sola al registrar cada recepcion.
   ===================================================================== */

-- 2) Ofertas completadas (datos existentes)
DECLARE @cerradas TABLE (id INT PRIMARY KEY);

UPDATE o SET estado = 'CERRADA', cerrada_en = SYSUTCDATETIME()
OUTPUT inserted.id INTO @cerradas
FROM OFERTA o
JOIN VW_OFERTA_SALDO s ON s.oferta_id = o.id
WHERE o.estado = 'APROBADA'
  AND s.cantidad_disponible <= 0
  AND s.cantidad_comprometida = 0
  AND NOT EXISTS (SELECT 1 FROM DESTINO_LOCAL d WHERE d.oferta_id = o.id AND d.estado = 'ESPERA_RECEPCION');

INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo)
SELECT 'OFERTA', id, 'APROBADA', 'CERRADA', NULL,
       N'Completada: todas sus unidades ya llegaron al LIS (cierre automatico, migracion 014).'
FROM @cerradas;
GO

-- 1) Historial inmutable
IF OBJECT_ID('TR_HISTORIAL_INMUTABLE', 'TR') IS NOT NULL DROP TRIGGER TR_HISTORIAL_INMUTABLE;
GO
CREATE TRIGGER TR_HISTORIAL_INMUTABLE ON HISTORIAL_ESTADO
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Solo el script de demostracion puede borrar (no modificar) sus filas.
    IF NOT EXISTS (SELECT 1 FROM inserted)
       AND CAST(SESSION_CONTEXT(N'lis_mantenimiento_demo') AS INT) = 1
    BEGIN
        -- Un INSTEAD OF no se vuelve a disparar por su propia sentencia.
        DELETE h FROM HISTORIAL_ESTADO h JOIN deleted d ON d.id = h.id;
        RETURN;
    END;
    THROW 51000, 'HISTORIAL_ESTADO es la auditoria del sistema: no se modifica ni se borra.', 1;
END;
GO
