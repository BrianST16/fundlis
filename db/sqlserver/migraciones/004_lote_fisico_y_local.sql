/* =====================================================================
   004 - Ubicacion fisica (LOTE_FISICO) y destino institucional LOCAL
   ---------------------------------------------------------------------
   D-43 / directriz §4-§5 / DISENO_LOCAL_Y_UBICACION_FISICA.md
   Separa: (a) intento de asignacion (OFERTA_X_PETICION),
           (b) ubicacion fisica de las unidades (LOTE_FISICO),
           (c) historial inmutable (HISTORIAL_ESTADO + MOVIMIENTO).
   LOCAL no es usuario ni peticion: es la tabla DESTINO_LOCAL.
   Aditiva. Rellena lotes a partir de las recepciones existentes.
   ===================================================================== */

/* 1. Oferta generada por faltante (D-18): se marca su origen. */
IF COL_LENGTH('OFERTA', 'origen') IS NULL
    ALTER TABLE OFERTA ADD
        origen           VARCHAR(10) NOT NULL CONSTRAINT DF_OFERTA_origen DEFAULT ('DONADOR'),
        oferta_origen_id INT NULL CONSTRAINT FK_OFERTA_origen REFERENCES OFERTA(id);
GO
IF OBJECT_ID('CK_OFERTA_origen') IS NULL
    ALTER TABLE OFERTA ADD CONSTRAINT CK_OFERTA_origen CHECK (
        (origen = 'DONADOR' AND oferta_origen_id IS NULL) OR (origen = 'FALTANTE' AND oferta_origen_id IS NOT NULL));
GO

/* 2. Lote fisico: unidades que el LIS tiene o tuvo en sus manos.
      Toda recepcion crea exactamente un lote. */
IF OBJECT_ID('LOTE_FISICO') IS NULL
CREATE TABLE LOTE_FISICO (
    id                      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    oferta_id               INT          NOT NULL CONSTRAINT FK_LOTE_oferta REFERENCES OFERTA(id),
    cantidad                INT          NOT NULL,
    ubicacion               VARCHAR(20)  NOT NULL,
    origen                  VARCHAR(25)  NOT NULL,
    intento_origen_id       INT          NULL CONSTRAINT FK_LOTE_intento REFERENCES OFERTA_X_PETICION(id),
    recepcion_movimiento_id INT          NULL CONSTRAINT FK_LOTE_movimiento REFERENCES MOVIMIENTO(id),
    sin_destino_desde       DATETIME2(0) NULL,
    creado_en               DATETIME2(0) NOT NULL CONSTRAINT DF_LOTE_creado DEFAULT (SYSUTCDATETIME()),
    actualizado_en          DATETIME2(0) NULL,
    CONSTRAINT CK_LOTE_cantidad  CHECK (cantidad > 0),
    CONSTRAINT CK_LOTE_ubicacion CHECK (ubicacion IN ('EN_LIS','ENTREGADO','DEVUELTO','PATRIMONIO_LIS')),
    CONSTRAINT CK_LOTE_origen    CHECK (origen IN ('RECEPCION_ASIGNACION','RECEPCION_INCOMPLETA','RECEPCION_LOCAL'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_LOTE_recepcion')
    CREATE UNIQUE INDEX UQ_LOTE_recepcion ON LOTE_FISICO(recepcion_movimiento_id) WHERE recepcion_movimiento_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LOTE_oferta')
    CREATE INDEX IX_LOTE_oferta ON LOTE_FISICO(oferta_id, ubicacion);
GO

/* 3. Intento: lote que custodia, origen (donador o reasignacion) e inicio
      del plazo del estudiante (custodia_desde). */
IF COL_LENGTH('OFERTA_X_PETICION', 'lote_id') IS NULL
    ALTER TABLE OFERTA_X_PETICION ADD
        lote_id        INT          NULL CONSTRAINT FK_OXP_lote REFERENCES LOTE_FISICO(id),
        origen         VARCHAR(15)  NOT NULL CONSTRAINT DF_OXP_origen DEFAULT ('DONADOR'),
        custodia_desde DATETIME2(0) NULL;
GO
IF OBJECT_ID('CK_OXP_origen') IS NULL
    ALTER TABLE OFERTA_X_PETICION ADD CONSTRAINT CK_OXP_origen CHECK (
        origen = 'DONADOR' OR (origen = 'REASIGNACION' AND lote_id IS NOT NULL));
GO

/* 4. LOCAL: el LIS como destinatario institucional (no usuario, no peticion).
      origen OFERTA: el auxiliar lo elige como receptor de unidades aun no
                     recibidas (compromete saldo, el donador debe traerlas).
      origen LOTE:   unidades que ya estan en el LIS pasan a custodia LOCAL.
      CUSTODIA_TEMPORAL la inicia el auxiliar; ACEPTADO (donativo
      institucional permanente) solo con autorizacion del administrador. */
IF OBJECT_ID('DESTINO_LOCAL') IS NULL
CREATE TABLE DESTINO_LOCAL (
    id                        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    oferta_id                 INT           NOT NULL CONSTRAINT FK_LOCAL_oferta REFERENCES OFERTA(id),
    lote_id                   INT           NULL CONSTRAINT FK_LOCAL_lote REFERENCES LOTE_FISICO(id),
    origen                    VARCHAR(10)   NOT NULL,
    cantidad                  INT           NOT NULL,
    estado                    VARCHAR(20)   NOT NULL,
    seleccionado_por          INT           NOT NULL CONSTRAINT FK_LOCAL_seleccion REFERENCES USUARIO(id),
    seleccionado_en           DATETIME2(0)  NOT NULL CONSTRAINT DF_LOCAL_seleccion DEFAULT (SYSUTCDATETIME()),
    motivo                    NVARCHAR(400) NOT NULL,
    custodia_desde            DATETIME2(0)  NULL,
    aceptacion_solicitada_por INT           NULL CONSTRAINT FK_LOCAL_solicitud REFERENCES USUARIO(id),
    aceptacion_solicitada_en  DATETIME2(0)  NULL,
    aceptado_por              INT           NULL CONSTRAINT FK_LOCAL_aceptacion REFERENCES USUARIO(id),
    aceptado_en               DATETIME2(0)  NULL,
    cerrado_en                DATETIME2(0)  NULL,
    motivo_cierre             NVARCHAR(400) NULL,
    CONSTRAINT CK_LOCAL_cantidad CHECK (cantidad > 0),
    CONSTRAINT CK_LOCAL_origen   CHECK (origen IN ('OFERTA','LOTE')),
    CONSTRAINT CK_LOCAL_estado   CHECK (estado IN ('ESPERA_RECEPCION','CUSTODIA_TEMPORAL','ACEPTADO','REASIGNADO','DEVUELTO','CANCELADO')),
    CONSTRAINT CK_LOCAL_lote     CHECK (origen = 'OFERTA' OR lote_id IS NOT NULL),
    CONSTRAINT CK_LOCAL_fisico   CHECK (estado IN ('ESPERA_RECEPCION','CANCELADO') OR lote_id IS NOT NULL),
    CONSTRAINT CK_LOCAL_aceptado CHECK (estado <> 'ACEPTADO' OR (aceptado_por IS NOT NULL AND aceptado_en IS NOT NULL)),
    CONSTRAINT CK_LOCAL_cierre   CHECK (estado NOT IN ('REASIGNADO','DEVUELTO','CANCELADO') OR motivo_cierre IS NOT NULL)
);
GO

/* 5. Movimientos fisicos: pertenecen a un intento O a un destino LOCAL
      (arco exclusivo con CHECK, sin FK ambigua). */
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MOVIMIENTO_oxp')
    DROP INDEX IX_MOVIMIENTO_oxp ON MOVIMIENTO;
GO
ALTER TABLE MOVIMIENTO ALTER COLUMN oferta_x_peticion_id INT NULL;
GO
IF COL_LENGTH('MOVIMIENTO', 'destino_local_id') IS NULL
    ALTER TABLE MOVIMIENTO ADD
        destino_local_id INT NULL CONSTRAINT FK_MOVIMIENTO_local REFERENCES DESTINO_LOCAL(id),
        lote_id          INT NULL CONSTRAINT FK_MOVIMIENTO_lote  REFERENCES LOTE_FISICO(id);
GO
IF OBJECT_ID('CK_MOVIMIENTO_titular') IS NULL
    ALTER TABLE MOVIMIENTO ADD CONSTRAINT CK_MOVIMIENTO_titular CHECK (
        (oferta_x_peticion_id IS NOT NULL AND destino_local_id IS NULL)
        OR (oferta_x_peticion_id IS NULL AND destino_local_id IS NOT NULL));
GO
CREATE INDEX IX_MOVIMIENTO_oxp ON MOVIMIENTO(oferta_x_peticion_id, registrado_en);
CREATE INDEX IX_MOVIMIENTO_local ON MOVIMIENTO(destino_local_id) WHERE destino_local_id IS NOT NULL;
GO

/* 6. Una sola custodia vigente por lote, garantizada por el motor. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF OBJECT_ID('VW_LOTE_TITULAR_OXP') IS NULL
    EXEC('CREATE VIEW VW_LOTE_TITULAR_OXP WITH SCHEMABINDING AS
          SELECT lote_id FROM dbo.OFERTA_X_PETICION
          WHERE lote_id IS NOT NULL AND estado IN (''EN_CUSTODIA'',''DEVOLUCION'')');
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_LOTE_titular_oxp')
    CREATE UNIQUE CLUSTERED INDEX UQ_LOTE_titular_oxp ON VW_LOTE_TITULAR_OXP(lote_id);
GO
IF OBJECT_ID('VW_LOTE_TITULAR_LOCAL') IS NULL
    EXEC('CREATE VIEW VW_LOTE_TITULAR_LOCAL WITH SCHEMABINDING AS
          SELECT lote_id FROM dbo.DESTINO_LOCAL
          WHERE lote_id IS NOT NULL AND estado = ''CUSTODIA_TEMPORAL''');
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_LOTE_titular_local')
    CREATE UNIQUE CLUSTERED INDEX UQ_LOTE_titular_local ON VW_LOTE_TITULAR_LOCAL(lote_id);
GO

/* 7. Historial: nuevas entidades trazables. */
IF OBJECT_ID('CK_HISTORIAL_entidad') IS NOT NULL
    ALTER TABLE HISTORIAL_ESTADO DROP CONSTRAINT CK_HISTORIAL_entidad;
GO
ALTER TABLE HISTORIAL_ESTADO ADD CONSTRAINT CK_HISTORIAL_entidad
    CHECK (entidad IN ('OFERTA','PETICION','ASIGNACION','USUARIO','LOTE','LOCAL','TAREA'));
GO

/* 8. Relleno: un lote por cada recepcion ya registrada. */
INSERT INTO LOTE_FISICO (oferta_id, cantidad, ubicacion, origen, intento_origen_id, recepcion_movimiento_id, sin_destino_desde, creado_en)
SELECT x.oferta_id,
       m.cantidad,
       CASE
         WHEN x.estado = 'ENTREGADO' THEN 'ENTREGADO'
         WHEN x.estado = 'DEVOLUCION' AND EXISTS (SELECT 1 FROM MOVIMIENTO d WHERE d.oferta_x_peticion_id = x.id AND d.tipo = 'DEVOLUCION') THEN 'DEVUELTO'
         ELSE 'EN_LIS'
       END,
       CASE WHEN x.estado = 'CANCELADO' AND m.cantidad < x.cantidad_asignada THEN 'RECEPCION_INCOMPLETA' ELSE 'RECEPCION_ASIGNACION' END,
       x.id,
       m.id,
       CASE WHEN x.estado = 'CANCELADO' THEN ISNULL(x.cerrada_en, m.registrado_en) END,
       m.registrado_en
FROM OFERTA_X_PETICION x
JOIN MOVIMIENTO m ON m.oferta_x_peticion_id = x.id AND m.tipo = 'RECEPCION'
WHERE NOT EXISTS (SELECT 1 FROM LOTE_FISICO l WHERE l.recepcion_movimiento_id = m.id);
GO
UPDATE m SET m.lote_id = l.id
FROM MOVIMIENTO m JOIN LOTE_FISICO l ON l.intento_origen_id = m.oferta_x_peticion_id
WHERE m.lote_id IS NULL;
GO
UPDATE x SET x.lote_id = l.id
FROM OFERTA_X_PETICION x JOIN LOTE_FISICO l ON l.intento_origen_id = x.id
WHERE x.lote_id IS NULL AND x.estado IN ('EN_CUSTODIA','ENTREGADO','DEVOLUCION');
GO
UPDATE OFERTA_X_PETICION SET custodia_desde = recibida_en
WHERE recibida_en IS NOT NULL AND custodia_desde IS NULL;
GO

/* 9. Saldo de oferta (debe coincidir con backend/src/ofertas/saldo.ts):
      consumen unidades de la oferta O
       A) intentos de origen DONADOR vigentes o cerrados, y los CANCELADOS
          despues de una recepcion (las unidades ya estan en un lote);
       B) destinos LOCAL elegidos desde la oferta y no cancelados;
       C) lotes de una oferta generada por faltante (sus unidades ya
          estan fisicamente en el LIS). */
IF OBJECT_ID('VW_OFERTA_SALDO') IS NOT NULL DROP VIEW VW_OFERTA_SALDO;
GO
CREATE VIEW VW_OFERTA_SALDO AS
SELECT o.id AS oferta_id,
       o.cantidad AS cantidad_ofertada,
       ISNULL(a.comprometida, 0) AS cantidad_comprometida,
       ISNULL(a.consumida, 0)    AS cantidad_consumida_intentos,
       ISNULL(b.local_cant, 0)   AS cantidad_destino_local,
       ISNULL(c.faltante, 0)     AS cantidad_en_lote_faltante,
       o.cantidad - ISNULL(a.comprometida, 0) - ISNULL(a.consumida, 0) - ISNULL(b.local_cant, 0) - ISNULL(c.faltante, 0) AS cantidad_disponible
FROM OFERTA o
OUTER APPLY (
    SELECT SUM(CASE WHEN x.estado = 'ASIGNADO' THEN x.cantidad_asignada END) AS comprometida,
           SUM(CASE WHEN x.estado IN ('EN_CUSTODIA','ENTREGADO','DEVOLUCION')
                      OR (x.estado = 'CANCELADO' AND x.recibida_en IS NOT NULL) THEN x.cantidad_asignada END) AS consumida
    FROM OFERTA_X_PETICION x WHERE x.oferta_id = o.id AND x.origen = 'DONADOR') a
OUTER APPLY (
    SELECT SUM(d.cantidad) AS local_cant FROM DESTINO_LOCAL d
    WHERE d.oferta_id = o.id AND d.origen = 'OFERTA' AND d.estado <> 'CANCELADO') b
OUTER APPLY (
    SELECT SUM(l.cantidad) AS faltante FROM LOTE_FISICO l
    WHERE l.oferta_id = o.id AND o.origen = 'FALTANTE') c;
GO

MERGE PARAMETRO AS t
USING (VALUES
    ('PLAZO_CUSTODIA_LOCAL_DIAS_HABILES', '3', N'Dias habiles de custodia temporal LOCAL antes de generar DEFINIR_ESTADO (aclaracion del equipo; inicio [PROP])')
) AS s(clave, valor, descripcion)
ON t.clave = s.clave
WHEN NOT MATCHED THEN INSERT (clave, valor, descripcion) VALUES (s.clave, s.valor, s.descripcion);
GO

/* ROLLBACK (manual): DROP VIEW VW_LOTE_TITULAR_LOCAL, VW_LOTE_TITULAR_OXP; quitar
   CK_MOVIMIENTO_titular, columnas destino_local_id/lote_id de MOVIMIENTO (y
   devolver oferta_x_peticion_id a NOT NULL si no hay filas LOCAL); DROP TABLE
   DESTINO_LOCAL; quitar columnas lote_id/origen/custodia_desde de OXP; DROP TABLE
   LOTE_FISICO; quitar origen/oferta_origen_id de OFERTA; restaurar
   CK_HISTORIAL_entidad y VW_OFERTA_SALDO de 01_schema.sql; DELETE FROM
   ESQUEMA_VERSION WHERE version = 4. O bien restaurar el respaldo .bak. */
