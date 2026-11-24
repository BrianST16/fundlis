/* =====================================================================
   010 - Aceptacion institucional LOCAL con consentimiento del donador
   ---------------------------------------------------------------------
   Correcciones 7 y 8 / D-50.
     CUSTODIA_TEMPORAL --(solo ADMIN propone, motivo)--> PROPUESTO_DONADOR
     PROPUESTO_DONADOR --(donador acepta)--> ACEPTADO (patrimonio LIS)
     PROPUESTO_DONADOR --(donador rechaza)--> POR_DEVOLVER --(foto)--> DEVUELTO
     PROPUESTO_DONADOR --(admin retira)--> CUSTODIA_TEMPORAL
     PROPUESTO_DONADOR vencido --> tarea DEFINIR_ESTADO (nunca se acepta
                                   sin consentimiento)
   Aditiva: amplia el CHECK de estados, agrega columnas nullable y recrea
   la vista indexada de "un solo titular por lote" para que cubra los
   estados nuevos (en ellos el producto sigue fisicamente en el LIS).
   ===================================================================== */

/* 1. Estados nuevos */
ALTER TABLE DESTINO_LOCAL DROP CONSTRAINT CK_LOCAL_estado;
GO
ALTER TABLE DESTINO_LOCAL ADD CONSTRAINT CK_LOCAL_estado CHECK (estado IN (
    'ESPERA_RECEPCION','CUSTODIA_TEMPORAL','PROPUESTO_DONADOR','POR_DEVOLVER',
    'ACEPTADO','REASIGNADO','DEVUELTO','CANCELADO'));
GO

/* 2. Propuesta al donador y su respuesta.
      aceptacion_solicitada_por/en (ya existen) = administrador que propone. */
IF COL_LENGTH('DESTINO_LOCAL', 'propuesta_motivo') IS NULL
    ALTER TABLE DESTINO_LOCAL ADD
        propuesta_motivo  NVARCHAR(400) NULL,
        propuesta_limite  DATE          NULL,
        respuesta_donador VARCHAR(10)   NULL,
        respuesta_en      DATETIME2(0)  NULL,
        respuesta_motivo  NVARCHAR(400) NULL;
GO
ALTER TABLE DESTINO_LOCAL ADD
    CONSTRAINT CK_LOCAL_respuesta CHECK (respuesta_donador IS NULL OR respuesta_donador IN ('ACEPTA','RECHAZA')),
    CONSTRAINT CK_LOCAL_propuesta CHECK (estado <> 'PROPUESTO_DONADOR' OR (
        aceptacion_solicitada_por IS NOT NULL AND aceptacion_solicitada_en IS NOT NULL
        AND propuesta_motivo IS NOT NULL AND propuesta_limite IS NOT NULL));
GO

/* 3. Un solo titular por lote: la vista indexada ahora cubre los estados
      en que el producto sigue bajo LOCAL. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF OBJECT_ID('VW_LOTE_TITULAR_LOCAL') IS NOT NULL
    DROP VIEW VW_LOTE_TITULAR_LOCAL;
GO
EXEC('CREATE VIEW VW_LOTE_TITULAR_LOCAL WITH SCHEMABINDING AS
      SELECT lote_id FROM dbo.DESTINO_LOCAL
      WHERE lote_id IS NOT NULL
        AND estado IN (''CUSTODIA_TEMPORAL'',''PROPUESTO_DONADOR'',''POR_DEVOLVER'')');
GO
CREATE UNIQUE CLUSTERED INDEX UQ_LOTE_titular_local ON VW_LOTE_TITULAR_LOCAL(lote_id);
GO

/* 4. Plazo (dias habiles) para que el donador responda la propuesta. */
MERGE PARAMETRO AS t
USING (VALUES
    ('PLAZO_RESPUESTA_DONADOR_LOCAL', '5',
     'Dias habiles para que el donador acepte o rechace que su donacion quede para el LIS')
) AS s(clave, valor, descripcion)
ON t.clave = s.clave
WHEN NOT MATCHED THEN INSERT (clave, valor, descripcion) VALUES (s.clave, s.valor, s.descripcion);
GO
