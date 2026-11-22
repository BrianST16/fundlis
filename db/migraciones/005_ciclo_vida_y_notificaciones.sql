/* =====================================================================
   005 - Ciclo de vida: cierres del LIS, prorrogas, tareas DEFINIR_ESTADO
         persistentes, bandeja interna y correo saliente (D-42)
   ---------------------------------------------------------------------
   Aditiva. Idempotencia por claves unicas (clave de tarea y clave de
   notificacion por usuario). Un fallo de correo NO afecta la operacion de
   negocio: el correo queda en CORREO_SALIDA para reintento.
   ===================================================================== */

/* 1. Cierres del LIS (vacaciones, cierres administrativos). Reemplaza al
      parametro CIERRES_LIS, que queda solo como respaldo. */
IF OBJECT_ID('CIERRE_LIS') IS NULL
CREATE TABLE CIERRE_LIS (
    id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    desde      DATE          NOT NULL,
    hasta      DATE          NOT NULL,
    motivo     NVARCHAR(200) NOT NULL,
    creado_por INT           NULL CONSTRAINT FK_CIERRE_usuario REFERENCES USUARIO(id),
    creado_en  DATETIME2(0)  NOT NULL CONSTRAINT DF_CIERRE_creado DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_CIERRE_rango CHECK (desde <= hasta)
);
GO

/* 2. Prorrogas del intento (aplazamiento del donador / extension del
      estudiante). El plazo sigue siendo DERIVADO: base + dias_extra. */
IF COL_LENGTH('OFERTA_X_PETICION', 'dias_extra') IS NULL
    ALTER TABLE OFERTA_X_PETICION ADD
        dias_extra    INT NOT NULL CONSTRAINT DF_OXP_dias_extra DEFAULT (0),
        aplazamientos INT NOT NULL CONSTRAINT DF_OXP_aplazamientos DEFAULT (0);
GO
IF OBJECT_ID('CK_OXP_prorroga') IS NULL
    ALTER TABLE OFERTA_X_PETICION ADD CONSTRAINT CK_OXP_prorroga CHECK (dias_extra >= 0 AND aplazamientos >= 0);
GO

/* 3. Tarea DEFINIR_ESTADO (D-23). Una por vencimiento (clave unica). */
IF OBJECT_ID('TAREA') IS NULL
CREATE TABLE TAREA (
    id               INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    tipo             VARCHAR(20)   NOT NULL,
    clave            VARCHAR(120)  NOT NULL,
    asignacion_id    INT           NULL CONSTRAINT FK_TAREA_oxp   REFERENCES OFERTA_X_PETICION(id),
    destino_local_id INT           NULL CONSTRAINT FK_TAREA_local REFERENCES DESTINO_LOCAL(id),
    lote_id          INT           NULL CONSTRAINT FK_TAREA_lote  REFERENCES LOTE_FISICO(id),
    responsable      VARCHAR(12)   NOT NULL,
    fecha_limite     DATE          NOT NULL,
    estado           VARCHAR(10)   NOT NULL CONSTRAINT DF_TAREA_estado DEFAULT ('ABIERTA'),
    creada_en        DATETIME2(0)  NOT NULL CONSTRAINT DF_TAREA_creada DEFAULT (SYSUTCDATETIME()),
    resuelta_por     INT           NULL CONSTRAINT FK_TAREA_usuario REFERENCES USUARIO(id),
    resuelta_en      DATETIME2(0)  NULL,
    decision         VARCHAR(30)   NULL,
    motivo           NVARCHAR(400) NULL,
    CONSTRAINT CK_TAREA_clave CHECK (LEN(clave) > 0),
    CONSTRAINT CK_TAREA_tipo        CHECK (tipo IN ('DEFINIR_ESTADO')),
    CONSTRAINT CK_TAREA_responsable CHECK (responsable IN ('DONADOR','ESTUDIANTE','LIS')),
    CONSTRAINT CK_TAREA_estado      CHECK (estado IN ('ABIERTA','RESUELTA')),
    CONSTRAINT CK_TAREA_resuelta    CHECK (estado = 'ABIERTA' OR (resuelta_en IS NOT NULL AND decision IS NOT NULL)),
    CONSTRAINT CK_TAREA_objeto      CHECK (asignacion_id IS NOT NULL OR destino_local_id IS NOT NULL OR lote_id IS NOT NULL)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TAREA_clave')
    CREATE UNIQUE INDEX UX_TAREA_clave ON TAREA(clave);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TAREA_estado')
    CREATE INDEX IX_TAREA_estado ON TAREA(estado, fecha_limite);
GO

/* 4. Bandeja interna. Una fila por destinatario. La clave evita duplicar
      el mismo aviso al mismo usuario (idempotencia). */
IF OBJECT_ID('NOTIFICACION') IS NULL
CREATE TABLE NOTIFICACION (
    id         BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    usuario_id INT            NOT NULL CONSTRAINT FK_NOTIF_usuario REFERENCES USUARIO(id),
    tipo       VARCHAR(40)    NOT NULL,
    titulo     NVARCHAR(200)  NOT NULL,
    mensaje    NVARCHAR(1000) NOT NULL,
    entidad    VARCHAR(20)    NULL,
    entidad_id INT            NULL,
    clave      VARCHAR(160)   NOT NULL,
    creada_en  DATETIME2(0)   NOT NULL CONSTRAINT DF_NOTIF_creada DEFAULT (SYSUTCDATETIME()),
    leida_en   DATETIME2(0)   NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_NOTIF_usuario_clave')
    CREATE UNIQUE INDEX UX_NOTIF_usuario_clave ON NOTIFICACION(usuario_id, clave);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_NOTIF_bandeja')
    CREATE INDEX IX_NOTIF_bandeja ON NOTIFICACION(usuario_id, leida_en, creada_en);
GO

/* 5. Correo saliente (outbox). Se reintenta con espera creciente. */
IF OBJECT_ID('CORREO_SALIDA') IS NULL
CREATE TABLE CORREO_SALIDA (
    id                 BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    notificacion_id    BIGINT         NOT NULL CONSTRAINT FK_CORREO_notif REFERENCES NOTIFICACION(id),
    destinatario       VARCHAR(320)   NOT NULL,
    asunto             NVARCHAR(200)  NOT NULL,
    cuerpo             NVARCHAR(MAX)  NOT NULL,
    estado             VARCHAR(20)    NOT NULL CONSTRAINT DF_CORREO_estado DEFAULT ('PENDIENTE'),
    intentos           INT            NOT NULL CONSTRAINT DF_CORREO_intentos DEFAULT (0),
    ultimo_error       NVARCHAR(500)  NULL,
    proximo_intento_en DATETIME2(0)   NULL,
    enviado_en         DATETIME2(0)   NULL,
    creado_en          DATETIME2(0)   NOT NULL CONSTRAINT DF_CORREO_creado DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_CORREO_estado CHECK (estado IN ('PENDIENTE','ENVIADO','ERROR','SIN_CONFIGURACION','DESCARTADO'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CORREO_notificacion')
    CREATE UNIQUE INDEX UX_CORREO_notificacion ON CORREO_SALIDA(notificacion_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CORREO_pendiente')
    CREATE INDEX IX_CORREO_pendiente ON CORREO_SALIDA(estado, proximo_intento_en);
GO

/* 6. Parametros del ciclo de vida. Los marcados PROP no estan aprobados. */
MERGE PARAMETRO AS t
USING (VALUES
    ('PLAZO_APLAZAMIENTO_DONADOR_DIAS_HABILES', '5', N'[PROP P-07] Dias habiles que suma cada aplazamiento del donador'),
    ('MAX_APLAZAMIENTOS_DONADOR',              '1', N'[PROP P-07] Numero maximo de aplazamientos del donador'),
    ('PLAZO_EXTENSION_ESTUDIANTE_DIAS_HABILES','3', N'Extension de recogida del estudiante (D-22)'),
    ('MAX_EXTENSIONES_ESTUDIANTE',             '1', N'[PROP] Extensiones de recogida permitidas'),
    ('DIAS_ANTICIPACION_CIERRE',               '5', N'[PROP D-24] Dias habiles antes de un cierre en que se suspende la recepcion de nuevas donaciones'),
    ('CORREO_MAX_INTENTOS',                    '5', N'Intentos de envio de correo antes de marcarlo como ERROR definitivo'),
    ('PLAZOS_REVISION_MINUTOS',                '15', N'Cada cuantos minutos se revisan vencimientos')
) AS s(clave, valor, descripcion)
ON t.clave = s.clave
WHEN NOT MATCHED THEN INSERT (clave, valor, descripcion) VALUES (s.clave, s.valor, s.descripcion);
GO

/* ROLLBACK (manual): DROP TABLE CORREO_SALIDA, NOTIFICACION, TAREA, CIERRE_LIS;
   quitar CK_OXP_prorroga, DF_OXP_dias_extra, DF_OXP_aplazamientos y las columnas
   dias_extra/aplazamientos de OFERTA_X_PETICION; borrar los parametros
   agregados; DELETE FROM ESQUEMA_VERSION WHERE version = 5. */
