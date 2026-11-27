/* =====================================================================
   011 - Notificacion con fotografia adjunta (correccion 9 / D-51)
   ---------------------------------------------------------------------
   El donador recibe en su BANDEJA (no por correo) la foto de la entrega
   final al beneficiario. La foto solo se libera al destinatario de esa
   notificacion: el resto de fotos de movimientos sigue siendo solo del
   personal LIS (H-7d).
   Aditiva: una columna nullable con FK.
   ===================================================================== */
IF COL_LENGTH('NOTIFICACION', 'evidencia_id') IS NULL
    ALTER TABLE NOTIFICACION ADD evidencia_id INT NULL
        CONSTRAINT FK_NOTIF_evidencia REFERENCES EVIDENCIA(id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_NOTIF_evidencia')
    CREATE INDEX IX_NOTIF_evidencia ON NOTIFICACION(evidencia_id, usuario_id) WHERE evidencia_id IS NOT NULL;
GO
