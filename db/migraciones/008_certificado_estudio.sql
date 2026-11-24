/* =====================================================================
   008 - Certificado de estudio vigente (opcional)
   ---------------------------------------------------------------------
   Correccion 4 / D-46. Un correo @udea.edu.co no distingue estudiantes
   de profesores o administrativos. El estudiante puede subir su
   certificado de estudio vigente; el ADMINISTRADOR lo revisa.
   - OPCIONAL por ahora: no bloquea caracterizacion ni peticiones.
   - Dato sensible: solo lo ven su dueno y el administrador (no el
     auxiliar). Por eso NO se guarda en EVIDENCIA, cuyas reglas de acceso
     abren todo al personal LIS.
   - Un certificado vigente por estudiante: subir otro lo reemplaza y
     vuelve la revision a PENDIENTE (queda constancia en HISTORIAL_ESTADO).
   Aditiva: crea una tabla nueva, no modifica datos existentes.
   ===================================================================== */
IF OBJECT_ID('CERTIFICADO_ESTUDIO') IS NULL
CREATE TABLE CERTIFICADO_ESTUDIO (
    id               INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    usuario_id       INT            NOT NULL,
    contenido        VARBINARY(MAX) NOT NULL,
    mime             VARCHAR(100)   NOT NULL,
    tamano_bytes     INT            NOT NULL,
    hash_sha256      CHAR(64)       NOT NULL,
    nombre_original  NVARCHAR(260)  NULL,
    subido_en        DATETIME2(0)   NOT NULL CONSTRAINT DF_CERT_subido DEFAULT (SYSUTCDATETIME()),
    estado_revision  VARCHAR(12)    NOT NULL CONSTRAINT DF_CERT_estado DEFAULT ('PENDIENTE'),
    revisado_por     INT            NULL,
    revisado_en      DATETIME2(0)   NULL,
    observacion      NVARCHAR(400)  NULL,
    CONSTRAINT FK_CERT_usuario  FOREIGN KEY (usuario_id)   REFERENCES USUARIO(id),
    CONSTRAINT FK_CERT_revisor  FOREIGN KEY (revisado_por) REFERENCES USUARIO(id),
    CONSTRAINT UQ_CERT_usuario  UNIQUE (usuario_id),
    CONSTRAINT CK_CERT_mime     CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
    CONSTRAINT CK_CERT_estado   CHECK (estado_revision IN ('PENDIENTE','VALIDADO','RECHAZADO')),
    CONSTRAINT CK_CERT_revision CHECK (
        (estado_revision = 'PENDIENTE' AND revisado_por IS NULL AND revisado_en IS NULL) OR
        (estado_revision <> 'PENDIENTE' AND revisado_por IS NOT NULL AND revisado_en IS NOT NULL))
);
GO
