/* =====================================================================
   LIS DONA - Esquema de base de datos (SQL Server Express)
   Plataforma de intermediacion de donaciones y peticiones - LIS UdeA
   ---------------------------------------------------------------------
   Ejecutar con:  sqlcmd -S localhost\SQLEXPRESS -E -i db/01_schema.sql
   o abrirlo en SSMS / Azure Data Studio y ejecutarlo completo.
   ===================================================================== */

IF DB_ID('LisDona') IS NULL
BEGIN
    CREATE DATABASE LisDona;
END
GO

USE LisDona;
GO

/* ---------------------------------------------------------------------
   1. PARAMETROS DE CONFIGURACION
   Pesos del puntaje de prioridad y limites operativos. Se guardan en BD
   para poder ajustarlos sin recompilar (los valores son PROPUESTA).
   --------------------------------------------------------------------- */
IF OBJECT_ID('PARAMETRO') IS NULL
CREATE TABLE PARAMETRO (
    clave        VARCHAR(60)    NOT NULL PRIMARY KEY,
    valor        NVARCHAR(200)  NOT NULL,
    descripcion  NVARCHAR(300)  NULL
);
GO

/* ---------------------------------------------------------------------
   2. IDENTIDAD, PERFILES Y ROLES
   perfil  = se deduce en el backend del dominio del ID token de Google
             (ESTUDIANTE para @udea.edu.co, DONADOR en otro caso).
             Es excluyente por cuenta.
   USUARIO_ROL = roles administrativos ADICIONALES, que solo otorga un
             administrador. Nunca se derivan de datos del cliente.
   --------------------------------------------------------------------- */
IF OBJECT_ID('USUARIO') IS NULL
CREATE TABLE USUARIO (
    id                 INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    google_sub         VARCHAR(255)   NOT NULL,
    email              VARCHAR(320)   NOT NULL,
    nombre             NVARCHAR(200)  NOT NULL,
    perfil             VARCHAR(20)    NOT NULL,
    activo             BIT            NOT NULL CONSTRAINT DF_USUARIO_activo DEFAULT (1),
    motivo_bloqueo     NVARCHAR(400)  NULL,
    creado_en          DATETIME2(0)   NOT NULL CONSTRAINT DF_USUARIO_creado DEFAULT (SYSUTCDATETIME()),
    ultimo_ingreso_en  DATETIME2(0)   NULL,
    CONSTRAINT UQ_USUARIO_google_sub UNIQUE (google_sub),
    CONSTRAINT UQ_USUARIO_email      UNIQUE (email),
    CONSTRAINT CK_USUARIO_perfil     CHECK (perfil IN ('ESTUDIANTE','DONADOR')),
    CONSTRAINT CK_USUARIO_bloqueo    CHECK (activo = 1 OR motivo_bloqueo IS NOT NULL)
);
GO

IF OBJECT_ID('USUARIO_ROL') IS NULL
CREATE TABLE USUARIO_ROL (
    id            INT          IDENTITY(1,1) NOT NULL PRIMARY KEY,
    usuario_id    INT          NOT NULL,
    rol           VARCHAR(20)  NOT NULL,
    asignado_por  INT          NULL,
    asignado_en   DATETIME2(0) NOT NULL CONSTRAINT DF_USUARIO_ROL_asignado DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_USUARIO_ROL_usuario  FOREIGN KEY (usuario_id)   REFERENCES USUARIO(id),
    CONSTRAINT FK_USUARIO_ROL_asignador FOREIGN KEY (asignado_por) REFERENCES USUARIO(id),
    CONSTRAINT UQ_USUARIO_ROL          UNIQUE (usuario_id, rol),
    CONSTRAINT CK_USUARIO_ROL_rol      CHECK (rol IN ('AUXILIAR_LIS','ADMINISTRADOR','SUPERUSUARIO'))
);
GO

/* ---------------------------------------------------------------------
   3. CATALOGOS
   --------------------------------------------------------------------- */
IF OBJECT_ID('CATEGORIA') IS NULL
CREATE TABLE CATEGORIA (
    id          INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    nombre      NVARCHAR(120) NOT NULL,
    descripcion NVARCHAR(400) NULL,
    activa      BIT           NOT NULL CONSTRAINT DF_CATEGORIA_activa DEFAULT (1),
    CONSTRAINT UQ_CATEGORIA_nombre UNIQUE (nombre)
);
GO

/* Grupos Sisben IV (A1..A5, B1..B7, C1..C18, D1..D21).
   puntaje_necesidad en [0,1]: 1 = mayor necesidad. Escala PROPUESTA. */
IF OBJECT_ID('GRUPO_SISBEN') IS NULL
CREATE TABLE GRUPO_SISBEN (
    codigo             VARCHAR(4)    NOT NULL PRIMARY KEY,
    letra              CHAR(1)       NOT NULL,
    subgrupo           INT           NOT NULL,
    descripcion        NVARCHAR(120) NOT NULL,
    puntaje_necesidad  DECIMAL(6,5)  NOT NULL,
    CONSTRAINT CK_GRUPO_SISBEN_letra    CHECK (letra IN ('A','B','C','D')),
    CONSTRAINT CK_GRUPO_SISBEN_puntaje  CHECK (puntaje_necesidad >= 0 AND puntaje_necesidad <= 1),
    CONSTRAINT CK_GRUPO_SISBEN_subgrupo CHECK (subgrupo > 0)
);
GO

/* ---------------------------------------------------------------------
   4. CARACTERIZACION DEL ESTUDIANTE
   Preguntas de opcion unica puntuadas. No se exige certificado Sisben
   en el MVP: el estudiante selecciona su grupo.
   --------------------------------------------------------------------- */
IF OBJECT_ID('PREGUNTA_CARACTERIZACION') IS NULL
CREATE TABLE PREGUNTA_CARACTERIZACION (
    id     INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    texto  NVARCHAR(400) NOT NULL,
    orden  INT           NOT NULL,
    peso   DECIMAL(6,5)  NOT NULL CONSTRAINT DF_PREGUNTA_peso DEFAULT (1),
    activa BIT           NOT NULL CONSTRAINT DF_PREGUNTA_activa DEFAULT (1),
    CONSTRAINT CK_PREGUNTA_peso CHECK (peso > 0)
);
GO

IF OBJECT_ID('OPCION_CARACTERIZACION') IS NULL
CREATE TABLE OPCION_CARACTERIZACION (
    id           INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    pregunta_id  INT           NOT NULL,
    texto        NVARCHAR(300) NOT NULL,
    puntaje      DECIMAL(6,5)  NOT NULL,
    orden        INT           NOT NULL,
    CONSTRAINT FK_OPCION_pregunta FOREIGN KEY (pregunta_id) REFERENCES PREGUNTA_CARACTERIZACION(id),
    CONSTRAINT CK_OPCION_puntaje  CHECK (puntaje >= 0 AND puntaje <= 1)
);
GO

IF OBJECT_ID('CARACTERIZACION') IS NULL
CREATE TABLE CARACTERIZACION (
    id              INT          IDENTITY(1,1) NOT NULL PRIMARY KEY,
    usuario_id      INT          NOT NULL,
    grupo_sisben    VARCHAR(4)   NOT NULL,
    puntaje_total   DECIMAL(7,5) NOT NULL,
    completada_en   DATETIME2(0) NOT NULL CONSTRAINT DF_CARACT_completada DEFAULT (SYSUTCDATETIME()),
    actualizada_en  DATETIME2(0) NULL,
    CONSTRAINT FK_CARACT_usuario FOREIGN KEY (usuario_id)   REFERENCES USUARIO(id),
    CONSTRAINT FK_CARACT_sisben  FOREIGN KEY (grupo_sisben) REFERENCES GRUPO_SISBEN(codigo),
    CONSTRAINT UQ_CARACT_usuario UNIQUE (usuario_id),
    CONSTRAINT CK_CARACT_puntaje CHECK (puntaje_total >= 0 AND puntaje_total <= 1)
);
GO

IF OBJECT_ID('RESPUESTA_CARACTERIZACION') IS NULL
CREATE TABLE RESPUESTA_CARACTERIZACION (
    caracterizacion_id INT NOT NULL,
    pregunta_id        INT NOT NULL,
    opcion_id          INT NOT NULL,
    CONSTRAINT PK_RESPUESTA PRIMARY KEY (caracterizacion_id, pregunta_id),
    CONSTRAINT FK_RESPUESTA_caract  FOREIGN KEY (caracterizacion_id) REFERENCES CARACTERIZACION(id) ON DELETE CASCADE,
    CONSTRAINT FK_RESPUESTA_pregunta FOREIGN KEY (pregunta_id)       REFERENCES PREGUNTA_CARACTERIZACION(id),
    CONSTRAINT FK_RESPUESTA_opcion   FOREIGN KEY (opcion_id)         REFERENCES OPCION_CARACTERIZACION(id)
);
GO

/* ---------------------------------------------------------------------
   5. EVIDENCIA FOTOGRAFICA
   Se almacena dentro de SQL Server (decision D-36). Nunca se sirve como
   URL publica: solo por endpoint autenticado y autorizado.
   --------------------------------------------------------------------- */
IF OBJECT_ID('EVIDENCIA') IS NULL
CREATE TABLE EVIDENCIA (
    id              INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    contenido       VARBINARY(MAX) NOT NULL,
    mime            VARCHAR(100)   NOT NULL,
    tamano_bytes    INT            NOT NULL,
    hash_sha256     CHAR(64)       NOT NULL,
    nombre_original NVARCHAR(260)  NULL,
    subida_por      INT            NOT NULL,
    subida_en       DATETIME2(0)   NOT NULL CONSTRAINT DF_EVIDENCIA_subida DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_EVIDENCIA_usuario FOREIGN KEY (subida_por) REFERENCES USUARIO(id),
    CONSTRAINT CK_EVIDENCIA_tamano  CHECK (tamano_bytes > 0),
    CONSTRAINT CK_EVIDENCIA_mime    CHECK (mime IN ('image/jpeg','image/png','image/webp'))
);
GO

/* ---------------------------------------------------------------------
   6. OFERTA (la publica el DONADOR; la aprueba el LIS)
   --------------------------------------------------------------------- */
IF OBJECT_ID('OFERTA') IS NULL
CREATE TABLE OFERTA (
    id              INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    donador_id      INT            NOT NULL,
    categoria_id    INT            NOT NULL,
    nombre_producto NVARCHAR(200)  NOT NULL,
    descripcion     NVARCHAR(1000) NOT NULL,
    cantidad        INT            NOT NULL,
    estado          VARCHAR(25)    NOT NULL,
    foto_id         INT            NULL,
    creada_en       DATETIME2(0)   NOT NULL CONSTRAINT DF_OFERTA_creada DEFAULT (SYSUTCDATETIME()),
    actualizada_en  DATETIME2(0)   NULL,
    revisada_por    INT            NULL,
    revisada_en     DATETIME2(0)   NULL,
    motivo_rechazo  NVARCHAR(400)  NULL,
    cerrada_en      DATETIME2(0)   NULL,
    CONSTRAINT FK_OFERTA_donador   FOREIGN KEY (donador_id)   REFERENCES USUARIO(id),
    CONSTRAINT FK_OFERTA_categoria FOREIGN KEY (categoria_id) REFERENCES CATEGORIA(id),
    CONSTRAINT FK_OFERTA_foto      FOREIGN KEY (foto_id)      REFERENCES EVIDENCIA(id),
    CONSTRAINT FK_OFERTA_revisor   FOREIGN KEY (revisada_por) REFERENCES USUARIO(id),
    CONSTRAINT CK_OFERTA_cantidad  CHECK (cantidad > 0),
    CONSTRAINT CK_OFERTA_estado    CHECK (estado IN ('PENDIENTE_APROBACION','APROBADA','RECHAZADA','CANCELADA','CERRADA')),
    /* Si fue revisada (aprobada o rechazada) debe constar quien y cuando */
    CONSTRAINT CK_OFERTA_revision  CHECK (estado <> 'APROBADA' OR (revisada_por IS NOT NULL AND revisada_en IS NOT NULL)),
    CONSTRAINT CK_OFERTA_rechazo   CHECK (estado <> 'RECHAZADA' OR (revisada_por IS NOT NULL AND revisada_en IS NOT NULL AND motivo_rechazo IS NOT NULL))
);
GO

/* ---------------------------------------------------------------------
   7. PETICION (la crea el ESTUDIANTE; la aprueba el LIS)
   No lleva cantidad solicitada: la cantidad vive en la asignacion.
   --------------------------------------------------------------------- */
IF OBJECT_ID('PETICION') IS NULL
CREATE TABLE PETICION (
    id             INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    estudiante_id  INT            NOT NULL,
    categoria_id   INT            NOT NULL,
    descripcion    NVARCHAR(1000) NOT NULL,
    estado         VARCHAR(25)    NOT NULL,
    creada_en      DATETIME2(0)   NOT NULL CONSTRAINT DF_PETICION_creada DEFAULT (SYSUTCDATETIME()),
    actualizada_en DATETIME2(0)   NULL,
    revisada_por   INT            NULL,
    revisada_en    DATETIME2(0)   NULL,
    motivo_rechazo NVARCHAR(400)  NULL,
    cerrada_en     DATETIME2(0)   NULL,
    motivo_cierre  NVARCHAR(400)  NULL,
    CONSTRAINT FK_PETICION_estudiante FOREIGN KEY (estudiante_id) REFERENCES USUARIO(id),
    CONSTRAINT FK_PETICION_categoria  FOREIGN KEY (categoria_id)  REFERENCES CATEGORIA(id),
    CONSTRAINT FK_PETICION_revisor    FOREIGN KEY (revisada_por)  REFERENCES USUARIO(id),
    CONSTRAINT CK_PETICION_estado     CHECK (estado IN ('PENDIENTE_APROBACION','APROBADA','RECHAZADA','CANCELADA','CERRADA_ENTREGA','CERRADA_INCUMPLIMIENTO')),
    CONSTRAINT CK_PETICION_revision   CHECK (estado <> 'APROBADA' OR (revisada_por IS NOT NULL AND revisada_en IS NOT NULL)),
    CONSTRAINT CK_PETICION_rechazo    CHECK (estado <> 'RECHAZADA' OR (revisada_por IS NOT NULL AND revisada_en IS NOT NULL AND motivo_rechazo IS NOT NULL))
);
GO

/* ---------------------------------------------------------------------
   8. OFERTA_X_PETICION (intento de asignacion)
   Una peticion solo puede tener UNA asignacion vigente, pero conserva
   todos sus intentos historicos.
   --------------------------------------------------------------------- */
IF OBJECT_ID('OFERTA_X_PETICION') IS NULL
CREATE TABLE OFERTA_X_PETICION (
    id                 INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    oferta_id          INT           NOT NULL,
    peticion_id        INT           NOT NULL,
    cantidad_asignada  INT           NOT NULL,
    estado             VARCHAR(20)   NOT NULL,
    puntaje_prioridad  DECIMAL(8,6)  NULL,
    asignada_por       INT           NOT NULL,
    asignada_en        DATETIME2(0)  NOT NULL CONSTRAINT DF_OXP_asignada DEFAULT (SYSUTCDATETIME()),
    recibida_en        DATETIME2(0)  NULL,
    entregada_en       DATETIME2(0)  NULL,
    cerrada_en         DATETIME2(0)  NULL,
    motivo_cierre      NVARCHAR(400) NULL,
    CONSTRAINT FK_OXP_oferta    FOREIGN KEY (oferta_id)    REFERENCES OFERTA(id),
    CONSTRAINT FK_OXP_peticion  FOREIGN KEY (peticion_id)  REFERENCES PETICION(id),
    CONSTRAINT FK_OXP_asignador FOREIGN KEY (asignada_por) REFERENCES USUARIO(id),
    CONSTRAINT CK_OXP_cantidad  CHECK (cantidad_asignada > 0),
    CONSTRAINT CK_OXP_estado    CHECK (estado IN ('ASIGNADO','EN_CUSTODIA','ENTREGADO','DEVOLUCION','CANCELADO')),
    CONSTRAINT CK_OXP_custodia  CHECK (estado NOT IN ('EN_CUSTODIA','ENTREGADO','DEVOLUCION') OR recibida_en IS NOT NULL),
    CONSTRAINT CK_OXP_entrega   CHECK (estado <> 'ENTREGADO' OR entregada_en IS NOT NULL),
    CONSTRAINT CK_OXP_cierre    CHECK (estado NOT IN ('CANCELADO','DEVOLUCION') OR motivo_cierre IS NOT NULL)
);
GO

/* "Una sola asignacion vigente por peticion", garantizado por la BD.
   Por que una VISTA INDEXADA y no un indice unico filtrado:
     - un indice unico normal sobre peticion_id prohibiria los intentos
       historicos, que el proyecto si quiere conservar;
     - un indice unico filtrado no sirve aqui porque su predicado no
       admite IN ni OR (haria falta  estado IN ('ASIGNADO','EN_CUSTODIA') )
       ni puede referenciar una columna calculada;
     - la vista indexada si admite ese WHERE, y su indice unico agrupado
       se mantiene de forma sincrona: un INSERT o UPDATE que deje dos
       intentos vigentes para la misma peticion falla en el motor, no solo
       en la aplicacion.
   La aplicacion ademas comprueba la condicion dentro de la transaccion,
   para devolver un mensaje claro en vez de un error del motor. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('VW_OXP_VIGENTE') IS NOT NULL DROP VIEW VW_OXP_VIGENTE;
GO
CREATE VIEW VW_OXP_VIGENTE
WITH SCHEMABINDING
AS
SELECT peticion_id
FROM dbo.OFERTA_X_PETICION
WHERE estado IN ('ASIGNADO', 'EN_CUSTODIA');
GO

CREATE UNIQUE CLUSTERED INDEX UQ_OXP_vigente_por_peticion
    ON VW_OXP_VIGENTE(peticion_id);
GO

/* ---------------------------------------------------------------------
   9. MOVIMIENTO (libro fisico inmutable). La foto es obligatoria.
   --------------------------------------------------------------------- */
IF OBJECT_ID('MOVIMIENTO') IS NULL
CREATE TABLE MOVIMIENTO (
    id                    INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    oferta_x_peticion_id  INT           NOT NULL,
    tipo                  VARCHAR(15)   NOT NULL,
    cantidad              INT           NOT NULL,
    nombre_contraparte    NVARCHAR(200) NOT NULL,
    evidencia_id          INT           NOT NULL,
    observaciones         NVARCHAR(600) NULL,
    registrado_por        INT           NOT NULL,
    registrado_en         DATETIME2(0)  NOT NULL CONSTRAINT DF_MOVIMIENTO_fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_MOVIMIENTO_oxp       FOREIGN KEY (oferta_x_peticion_id) REFERENCES OFERTA_X_PETICION(id),
    CONSTRAINT FK_MOVIMIENTO_evidencia FOREIGN KEY (evidencia_id)         REFERENCES EVIDENCIA(id),
    CONSTRAINT FK_MOVIMIENTO_usuario   FOREIGN KEY (registrado_por)       REFERENCES USUARIO(id),
    CONSTRAINT CK_MOVIMIENTO_tipo      CHECK (tipo IN ('RECEPCION','ENTREGA','DEVOLUCION')),
    CONSTRAINT CK_MOVIMIENTO_cantidad  CHECK (cantidad > 0)
);
GO

/* ---------------------------------------------------------------------
   10. HISTORIAL DE ESTADOS (trazabilidad de todas las transiciones)
   --------------------------------------------------------------------- */
IF OBJECT_ID('HISTORIAL_ESTADO') IS NULL
CREATE TABLE HISTORIAL_ESTADO (
    id              BIGINT        IDENTITY(1,1) NOT NULL PRIMARY KEY,
    entidad         VARCHAR(20)   NOT NULL,
    entidad_id      INT           NOT NULL,
    estado_anterior VARCHAR(25)   NULL,
    estado_nuevo    VARCHAR(25)   NOT NULL,
    actor_id        INT           NULL,
    motivo          NVARCHAR(400) NULL,
    ocurrido_en     DATETIME2(0)  NOT NULL CONSTRAINT DF_HISTORIAL_fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_HISTORIAL_actor FOREIGN KEY (actor_id) REFERENCES USUARIO(id),
    CONSTRAINT CK_HISTORIAL_entidad CHECK (entidad IN ('OFERTA','PETICION','ASIGNACION','USUARIO'))
);
GO

/* ---------------------------------------------------------------------
   11. INDICES DE APOYO
   --------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_OFERTA_estado_categoria')
    CREATE INDEX IX_OFERTA_estado_categoria ON OFERTA(estado, categoria_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_OFERTA_donador')
    CREATE INDEX IX_OFERTA_donador ON OFERTA(donador_id, estado);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PETICION_estado_categoria')
    CREATE INDEX IX_PETICION_estado_categoria ON PETICION(estado, categoria_id, creada_en);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PETICION_estudiante')
    CREATE INDEX IX_PETICION_estudiante ON PETICION(estudiante_id, estado);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_OXP_oferta')
    CREATE INDEX IX_OXP_oferta ON OFERTA_X_PETICION(oferta_id, estado);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_OXP_peticion')
    CREATE INDEX IX_OXP_peticion ON OFERTA_X_PETICION(peticion_id, asignada_en);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_MOVIMIENTO_oxp')
    CREATE INDEX IX_MOVIMIENTO_oxp ON MOVIMIENTO(oferta_x_peticion_id, registrado_en);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_HISTORIAL_entidad')
    CREATE INDEX IX_HISTORIAL_entidad ON HISTORIAL_ESTADO(entidad, entidad_id, ocurrido_en);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_USUARIO_ROL_usuario')
    CREATE INDEX IX_USUARIO_ROL_usuario ON USUARIO_ROL(usuario_id);
GO

/* ---------------------------------------------------------------------
   12. VISTA DE SALDO: ya NO se define aqui.
   VW_OFERTA_SALDO depende de LOTE_FISICO y DESTINO_LOCAL y la crean las
   migraciones versionadas (db/migraciones/004 y 006). Para una base nueva:
     1) ejecutar este script y 02_seed.sql;
     2) desde backend/: node scripts/db/migrar.js
   Asi la definicion vigente vive en un unico lugar (ver 006).
   --------------------------------------------------------------------- */

PRINT 'Esquema LisDona creado correctamente.';
GO
