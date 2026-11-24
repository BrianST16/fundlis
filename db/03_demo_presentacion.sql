/* =====================================================================
   LIS DONA - DATOS DE DEMOSTRACION PARA LA PRESENTACION (FICTICIOS)
   ---------------------------------------------------------------------
   Requisitos:
     1. db/01_schema.sql y db/02_seed.sql ejecutados.
     2. Migraciones al dia:  desde backend/  ->  node scripts/db/migrar.js
        (este script exige la migracion 011).

   Que hace:
     - Es REPETIBLE: primero borra SOLO lo demo (cuentas 'demo-%' y todo lo
       marcado con [DEMO]) y luego vuelve a sembrar. No toca datos reales.
     - Todo ocurre en UNA transaccion: si algo falla, no queda nada a medias.
     - Las cuentas demo NO pueden iniciar sesion con Google (google_sub
       'demo-...', dominios ficticios). Sirven para poblar las pantallas del
       LIS: Aprobaciones, Emparejamiento, Custodia, LOCAL, Plazos, Analitica,
       Usuarios y Trazabilidad.

   OPCIONAL - casos sobre TUS cuentas reales (para mostrar las pantallas del
   donador y del estudiante). Escribe los correos en las variables de abajo.
   Esas cuentas deben haber iniciado sesion al menos una vez:
     @email_donador_real    -> cuenta NO institucional (perfil DONADOR)
     @email_estudiante_real -> cuenta @udea.edu.co (perfil ESTUDIANTE)
   Lo que se crea para ellas lleva [DEMO] en el nombre y se borra al volver
   a ejecutar el script.

   Despues de ejecutarlo: en "Plazos y tareas" pulsa "Revisar ahora" para
   que se creen las tareas DEFINIR_ESTADO de los casos vencidos.

   Ejecutar en SSMS / Azure Data Studio (o sqlcmd -I) sobre LisDona.
   ===================================================================== */
USE LisDona;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
-- Opciones requeridas por las vistas indexadas del esquema.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* ===== CONFIGURACION OPCIONAL ======================================= */
DECLARE @email_donador_real    VARCHAR(320) = NULL;  -- p. ej. 'tu.cuenta@gmail.com'
DECLARE @email_estudiante_real VARCHAR(320) = NULL;  -- p. ej. 'tu.nombre@udea.edu.co'
/* ==================================================================== */

IF NOT EXISTS (SELECT 1 FROM ESQUEMA_VERSION WHERE version = 11)
    THROW 50000, 'Faltan migraciones: ejecuta "node scripts/db/migrar.js" (se requiere la 011).', 1;

DECLARE @ahora DATETIME2(0) = SYSUTCDATETIME();
DECLARE @coef VARCHAR(60) = 'kC=0.5000;kS=0.3000;kA=0.2000;H=90';

-- Imagenes y documento FICTICIOS (generados, sin personas).
DECLARE @png_producto  VARBINARY(MAX) = 0x89504e470d0a1a0a0000000d49484452000000a0000000780802000000fac06e38000001084944415478daedd8311100200c04c108a6a5c72a0e700022a02099fd3905d92eb1adf4c209001b604b01dcfa50810003166001166001166001060c18b0000bb0000bb00003060c58800558800558800518b0000bf05d2be10003060c183060c0800103060c1830e047cd2fe7d101183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c080010bb00003060c58800558800558800103062cc0022cc0022cc0020c18306001166001166001060c18b0000bb0000bb02e81adde000336c0f6ed0e054a5caa51c65c950000000049454e44ae426082;
DECLARE @png_recepcion VARBINARY(MAX) = 0x89504e470d0a1a0a0000000d49484452000000a0000000780802000000fac06e38000001094944415478daedd841110020084541fa58cd7056b2810d34841e84d93f2f017b23b6955e380160036c29805b1f2a1060c0022cc0022cc0022cc08001031660011660011660c080010bb0000bb0000bb00003166001be6b251c60c0800103060c183060c080010306fca8f9e53c3a0003060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060011660c080010bb0000bb0000b3060c0800558800558800558800103062cc0022cc0022cc0800103166001166001d625b0d51b60c006d8bedd012b2ababc3d665d470000000049454e44ae426082;
DECLARE @png_entrega   VARBINARY(MAX) = 0x89504e470d0a1a0a0000000d49484452000000a0000000780802000000fac06e38000001094944415478daedd8411100200845418a98c920a6b6810d34841e84d93f2f017b23b6955e380160036c2980dbe82a1060c0022cc0022cc0022cc08001031660011660011660c080010bb0000bb0000bb00003166001be6b251c60c0800103060c183060c080010306fca8f9e53c3a0003060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060011660c080010bb0000bb0000b3060c0800558800558800558800103062cc0022cc0022cc0800103166001166001d625b0d51b60c006d8bedd0163fe7774a538c1e50000000049454e44ae426082;
DECLARE @png_local     VARBINARY(MAX) = 0x89504e470d0a1a0a0000000d49484452000000a0000000780802000000fac06e38000001094944415478daedd841110020084541d259c65256b3810d34841e84d93f2f017b23b6955e380160036c29807b1b2a1060c0022cc0022cc0022cc08001031660011660011660c080010bb0000bb0000bb00003166001be6b251c60c0800103060c183060c080010306fca8f9e53c3a0003060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060c0800103060c183060011660c080010bb0000bb0000b3060c0800558800558800558800103062cc0022cc0022cc0800103166001166001d625b0d51b60c006d8bedd0155b4e54e556271750000000049454e44ae426082;
DECLARE @pdf_cert      VARBINARY(MAX) = 0x255044462d312e340a312030206f626a0a3c3c202f54797065202f436174616c6f67202f5061676573203220302052203e3e0a656e646f626a0a322030206f626a0a3c3c202f54797065202f5061676573202f4b696473205b33203020525d202f436f756e742031203e3e0a656e646f626a0a332030206f626a0a3c3c202f54797065202f50616765202f506172656e74203220302052202f4d65646961426f78205b30203020353935203834325d202f436f6e74656e7473203420302052202f5265736f7572636573203c3c202f466f6e74203c3c202f4631203520302052203e3e203e3e203e3e0a656e646f626a0a342030206f626a0a3c3c202f4c656e67746820313435203e3e0a73747265616d0a4254202f4631203230205466203630203736302054642028436572746966696361646f206465206573747564696f20766967656e7465202d2044454d4f2920546a2030202d3330205464202f46312031322054662028446f63756d656e746f20464943544943494f2070617261206c612064656d6f7374726163696f6e206465204c495320446f6e612e2920546a2045540a656e6473747265616d0a656e646f626a0a352030206f626a0a3c3c202f54797065202f466f6e74202f53756274797065202f5479706531202f42617365466f6e74202f48656c766574696361203e3e0a656e646f626a0a787265660a3020360a303030303030303030302036353533352066200a30303030303030303039203030303030206e200a30303030303030303538203030303030206e200a30303030303030313135203030303030206e200a30303030303030323431203030303030206e200a30303030303030343337203030303030206e200a747261696c65720a3c3c202f53697a652036202f526f6f74203120302052203e3e0a7374617274787265660a3530370a2525454f460a;
DECLARE @h_producto  CHAR(64) = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', @png_producto), 2));
DECLARE @h_recepcion CHAR(64) = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', @png_recepcion), 2));
DECLARE @h_entrega   CHAR(64) = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', @png_entrega), 2));
DECLARE @h_local     CHAR(64) = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', @png_local), 2));
DECLARE @h_cert      CHAR(64) = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', @pdf_cert), 2));

BEGIN TRANSACTION;

/* =====================================================================
   1. LIMPIEZA: solo cuentas demo y filas marcadas [DEMO]
   ===================================================================== */
DECLARE @u TABLE (id INT PRIMARY KEY);
INSERT @u SELECT id FROM USUARIO WHERE google_sub LIKE 'demo-%';
DECLARE @o TABLE (id INT PRIMARY KEY);
INSERT @o SELECT id FROM OFERTA
 WHERE donador_id IN (SELECT id FROM @u) OR nombre_producto LIKE '%\[DEMO\]%' ESCAPE '\';
INSERT @o SELECT id FROM OFERTA WHERE oferta_origen_id IN (SELECT id FROM @o) AND id NOT IN (SELECT id FROM @o);
DECLARE @p TABLE (id INT PRIMARY KEY);
INSERT @p SELECT id FROM PETICION
 WHERE estudiante_id IN (SELECT id FROM @u) OR descripcion LIKE '%\[DEMO\]%' ESCAPE '\';
DECLARE @x TABLE (id INT PRIMARY KEY);
INSERT @x SELECT id FROM OFERTA_X_PETICION WHERE oferta_id IN (SELECT id FROM @o) OR peticion_id IN (SELECT id FROM @p);
DECLARE @l TABLE (id INT PRIMARY KEY);
INSERT @l SELECT id FROM LOTE_FISICO WHERE oferta_id IN (SELECT id FROM @o);
DECLARE @d TABLE (id INT PRIMARY KEY);
INSERT @d SELECT id FROM DESTINO_LOCAL WHERE oferta_id IN (SELECT id FROM @o);
DECLARE @m TABLE (id INT PRIMARY KEY, evidencia INT);
INSERT @m SELECT id, evidencia_id FROM MOVIMIENTO
 WHERE oferta_x_peticion_id IN (SELECT id FROM @x) OR destino_local_id IN (SELECT id FROM @d) OR lote_id IN (SELECT id FROM @l);
DECLARE @n TABLE (id BIGINT PRIMARY KEY);
INSERT @n SELECT id FROM NOTIFICACION
 WHERE usuario_id IN (SELECT id FROM @u) OR clave LIKE 'DEMO:%'
    OR (entidad = 'ASIGNACION' AND entidad_id IN (SELECT id FROM @x))
    OR (entidad = 'LOCAL'      AND entidad_id IN (SELECT id FROM @d))
    OR (entidad = 'LOTE'       AND entidad_id IN (SELECT id FROM @l))
    OR (entidad = 'OFERTA'     AND entidad_id IN (SELECT id FROM @o))
    OR (entidad = 'PETICION'   AND entidad_id IN (SELECT id FROM @p));
DECLARE @e TABLE (id INT PRIMARY KEY);
INSERT @e SELECT DISTINCT evidencia FROM @m;
INSERT @e SELECT foto_id FROM OFERTA WHERE id IN (SELECT id FROM @o) AND foto_id IS NOT NULL AND foto_id NOT IN (SELECT id FROM @e);
INSERT @e SELECT id FROM EVIDENCIA WHERE subida_por IN (SELECT id FROM @u) AND id NOT IN (SELECT id FROM @e);
INSERT @e SELECT DISTINCT evidencia_id FROM NOTIFICACION WHERE id IN (SELECT id FROM @n) AND evidencia_id IS NOT NULL AND evidencia_id NOT IN (SELECT id FROM @e);

-- Romper referencias cruzadas lote <-> movimiento <-> intento.
UPDATE MOVIMIENTO SET lote_id = NULL WHERE id IN (SELECT id FROM @m);
UPDATE LOTE_FISICO SET recepcion_movimiento_id = NULL, intento_origen_id = NULL WHERE id IN (SELECT id FROM @l);
UPDATE OFERTA SET foto_id = NULL WHERE id IN (SELECT id FROM @o);

DELETE FROM TAREA WHERE asignacion_id IN (SELECT id FROM @x) OR lote_id IN (SELECT id FROM @l)
                     OR destino_local_id IN (SELECT id FROM @d) OR resuelta_por IN (SELECT id FROM @u);
DELETE FROM CORREO_SALIDA WHERE notificacion_id IN (SELECT id FROM @n);
DELETE FROM NOTIFICACION WHERE id IN (SELECT id FROM @n);
DELETE FROM MOVIMIENTO WHERE id IN (SELECT id FROM @m);
DELETE FROM OFERTA_X_PETICION WHERE id IN (SELECT id FROM @x);
DELETE FROM DESTINO_LOCAL WHERE id IN (SELECT id FROM @d);
DELETE FROM LOTE_FISICO WHERE id IN (SELECT id FROM @l);
DELETE FROM HISTORIAL_ESTADO
 WHERE actor_id IN (SELECT id FROM @u)
    OR (entidad = 'OFERTA'     AND entidad_id IN (SELECT id FROM @o))
    OR (entidad = 'PETICION'   AND entidad_id IN (SELECT id FROM @p))
    OR (entidad = 'ASIGNACION' AND entidad_id IN (SELECT id FROM @x))
    OR (entidad = 'LOTE'       AND entidad_id IN (SELECT id FROM @l))
    OR (entidad = 'LOCAL'      AND entidad_id IN (SELECT id FROM @d))
    OR (entidad = 'USUARIO'    AND entidad_id IN (SELECT id FROM @u));
DELETE FROM OFERTA WHERE id IN (SELECT id FROM @o) AND oferta_origen_id IS NOT NULL;
DELETE FROM OFERTA WHERE id IN (SELECT id FROM @o);
DELETE FROM PETICION WHERE id IN (SELECT id FROM @p);
DELETE FROM CERTIFICADO_ESTUDIO WHERE usuario_id IN (SELECT id FROM @u);
UPDATE CERTIFICADO_ESTUDIO SET estado_revision = 'PENDIENTE', revisado_por = NULL, revisado_en = NULL
 WHERE revisado_por IN (SELECT id FROM @u);
DELETE FROM EVIDENCIA WHERE id IN (SELECT id FROM @e);
DELETE FROM CARACTERIZACION WHERE usuario_id IN (SELECT id FROM @u);   -- respuestas: ON DELETE CASCADE
UPDATE USUARIO_ROL SET asignado_por = NULL WHERE asignado_por IN (SELECT id FROM @u) AND usuario_id NOT IN (SELECT id FROM @u);
DELETE FROM USUARIO_ROL WHERE usuario_id IN (SELECT id FROM @u);
DELETE FROM USUARIO WHERE id IN (SELECT id FROM @u);

/* =====================================================================
   2. USUARIOS FICTICIOS
   ===================================================================== */
INSERT INTO USUARIO (google_sub, email, nombre, perfil, activo, motivo_bloqueo, creado_en, ultimo_ingreso_en) VALUES
 ('demo-super', 'superusuario@demo.lisdona.test',  N'Sofia Superusuaria (demo)',          'DONADOR',    1, NULL, DATEADD(DAY,-120,@ahora), DATEADD(DAY,-1,@ahora)),
 ('demo-admin', 'administrador@demo.lisdona.test', N'Andres Administrador (demo)',        'DONADOR',    1, NULL, DATEADD(DAY,-110,@ahora), @ahora),
 ('demo-aux1',  'auxiliar@demo.lisdona.test',      N'Laura Auxiliar (demo)',              'DONADOR',    1, NULL, DATEADD(DAY,-100,@ahora), @ahora),
 ('demo-aux2',  'auxiliar2@demo.lisdona.test',     N'Camilo Auxiliar y donador (demo)',   'DONADOR',    1, NULL, DATEADD(DAY,-95,@ahora),  DATEADD(DAY,-2,@ahora)),
 ('demo-donR',  'fundacion@demo.lisdona.test',     N'Fundacion Amigos UdeA (demo)',       'DONADOR',    1, NULL, DATEADD(DAY,-90,@ahora),  DATEADD(DAY,-1,@ahora)),
 ('demo-donN',  'mariana@demo.lisdona.test',       N'Mariana Nueva (demo)',               'DONADOR',    1, NULL, DATEADD(DAY,-30,@ahora),  DATEADD(DAY,-1,@ahora)),
 ('demo-donF',  'jorge@demo.lisdona.test',         N'Jorge Incumplido (demo)',            'DONADOR',    1, NULL, DATEADD(DAY,-80,@ahora),  DATEADD(DAY,-5,@ahora)),
 ('demo-donL',  'empresa@demo.lisdona.test',       N'Tecnologia Solidaria SAS (demo)',    'DONADOR',    1, NULL, DATEADD(DAY,-70,@ahora),  DATEADD(DAY,-3,@ahora)),
 ('demo-bloq',  'bloqueado@demo.lisdona.test',     N'Cuenta Bloqueada (demo)',            'DONADOR',    0, N'Publico ofertas falsas de forma reiterada (caso de demostracion).', DATEADD(DAY,-60,@ahora), DATEADD(DAY,-40,@ahora)),
 ('demo-est1',  'valentina@demo.udea.edu.co',      N'Valentina Rios (demo)',              'ESTUDIANTE', 1, NULL, DATEADD(DAY,-100,@ahora), DATEADD(DAY,-1,@ahora)),
 ('demo-est2',  'santiago@demo.udea.edu.co',       N'Santiago Gomez (demo)',              'ESTUDIANTE', 1, NULL, DATEADD(DAY,-100,@ahora), DATEADD(DAY,-2,@ahora)),
 ('demo-est3',  'daniela@demo.udea.edu.co',        N'Daniela Mejia (demo)',               'ESTUDIANTE', 1, NULL, DATEADD(DAY,-95,@ahora),  DATEADD(DAY,-3,@ahora)),
 ('demo-est4',  'mateo@demo.udea.edu.co',          N'Mateo Alvarez (demo)',               'ESTUDIANTE', 1, NULL, DATEADD(DAY,-90,@ahora),  DATEADD(DAY,-1,@ahora)),
 ('demo-est5',  'isabella@demo.udea.edu.co',       N'Isabella Torres (demo)',             'ESTUDIANTE', 1, NULL, DATEADD(DAY,-85,@ahora),  DATEADD(DAY,-4,@ahora)),
 ('demo-est6',  'rperez.docente@demo.udea.edu.co', N'Prof. Ricardo Perez - docente (demo)', 'ESTUDIANTE', 1, NULL, DATEADD(DAY,-20,@ahora), DATEADD(DAY,-2,@ahora));

DECLARE @SUPER INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-super');
DECLARE @ADMIN INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-admin');
DECLARE @AUX1  INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-aux1');
DECLARE @AUX2  INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-aux2');
DECLARE @DONR  INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-donR');
DECLARE @DONN  INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-donN');
DECLARE @DONF  INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-donF');
DECLARE @DONL  INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-donL');
DECLARE @BLOQ  INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-bloq');
DECLARE @E1 INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-est1');
DECLARE @E2 INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-est2');
DECLARE @E3 INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-est3');
DECLARE @E4 INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-est4');
DECLARE @E5 INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-est5');
DECLARE @E6 INT = (SELECT id FROM USUARIO WHERE google_sub = 'demo-est6');

-- Roles: el superusuario solo por script (D-45); el resto lo otorga el admin.
INSERT INTO USUARIO_ROL (usuario_id, rol, asignado_por, asignado_en) VALUES
 (@SUPER, 'SUPERUSUARIO',  NULL,   DATEADD(DAY,-120,@ahora)),
 (@ADMIN, 'ADMINISTRADOR', @SUPER, DATEADD(DAY,-110,@ahora)),
 (@AUX1,  'AUXILIAR_LIS',  @ADMIN, DATEADD(DAY,-100,@ahora)),
 (@AUX2,  'AUXILIAR_LIS',  @ADMIN, DATEADD(DAY,-95,@ahora));

-- Opcional: cuentas reales (deben existir y tener el perfil correcto).
DECLARE @DR INT = (SELECT id FROM USUARIO WHERE email = @email_donador_real AND perfil = 'DONADOR' AND activo = 1);
DECLARE @ER INT = (SELECT id FROM USUARIO WHERE email = @email_estudiante_real AND perfil = 'ESTUDIANTE' AND activo = 1);
IF @email_donador_real IS NOT NULL AND @DR IS NULL
    PRINT 'AVISO: @email_donador_real no existe, no es DONADOR o esta bloqueado. Se omiten sus casos.';
IF @email_estudiante_real IS NOT NULL AND @ER IS NULL
    PRINT 'AVISO: @email_estudiante_real no existe, no es ESTUDIANTE o esta bloqueado. Se omiten sus casos.';

/* =====================================================================
   3. CARACTERIZACION (opcion unica) Y CERTIFICADOS DE ESTUDIO
   (pregunta por su orden, opcion por su orden; ver 02_seed.sql)
   ===================================================================== */
DECLARE @resp TABLE (usr INT, sisben VARCHAR(4), po INT, oo INT);
INSERT @resp VALUES
 (@E1,'A2',1,4),(@E1,'A2',2,4),(@E1,'A2',3,3),(@E1,'A2',4,4),(@E1,'A2',5,2),
 (@E2,'B3',1,3),(@E2,'B3',2,3),(@E2,'B3',3,2),(@E2,'B3',4,3),(@E2,'B3',5,1),
 (@E3,'C5',1,2),(@E3,'C5',2,2),(@E3,'C5',3,2),(@E3,'C5',4,2),(@E3,'C5',5,1),
 (@E4,'A1',1,4),(@E4,'A1',2,4),(@E4,'A1',3,3),(@E4,'A1',4,4),(@E4,'A1',5,3),
 (@E5,'C12',1,2),(@E5,'C12',2,1),(@E5,'C12',3,1),(@E5,'C12',4,2),(@E5,'C12',5,1),
 (@E6,'D4',1,1),(@E6,'D4',2,1),(@E6,'D4',3,1),(@E6,'D4',4,1),(@E6,'D4',5,1);

INSERT INTO CARACTERIZACION (usuario_id, grupo_sisben, puntaje_total, completada_en)
SELECT r.usr, MAX(r.sisben), CAST(SUM(o.puntaje * p.peso) / SUM(p.peso) AS DECIMAL(7,5)), DATEADD(DAY,-80,@ahora)
FROM @resp r
JOIN PREGUNTA_CARACTERIZACION p ON p.orden = r.po AND p.activa = 1
JOIN OPCION_CARACTERIZACION o ON o.pregunta_id = p.id AND o.orden = r.oo
GROUP BY r.usr;

INSERT INTO RESPUESTA_CARACTERIZACION (caracterizacion_id, pregunta_id, opcion_id)
SELECT c.id, p.id, o.id
FROM @resp r
JOIN CARACTERIZACION c ON c.usuario_id = r.usr
JOIN PREGUNTA_CARACTERIZACION p ON p.orden = r.po AND p.activa = 1
JOIN OPCION_CARACTERIZACION o ON o.pregunta_id = p.id AND o.orden = r.oo;

-- Certificado (D-46): validado, pendiente y rechazado (docente).
INSERT INTO CERTIFICADO_ESTUDIO (usuario_id, contenido, mime, tamano_bytes, hash_sha256, nombre_original, subido_en, estado_revision, revisado_por, revisado_en, observacion) VALUES
 (@E1, @pdf_cert, 'application/pdf', DATALENGTH(@pdf_cert), @h_cert, N'certificado-valentina.pdf', DATEADD(DAY,-60,@ahora), 'VALIDADO',  @ADMIN, DATEADD(DAY,-59,@ahora), NULL),
 (@E2, @pdf_cert, 'application/pdf', DATALENGTH(@pdf_cert), @h_cert, N'certificado-santiago.pdf',  DATEADD(DAY,-1,@ahora),  'PENDIENTE', NULL,   NULL,                     NULL),
 (@E6, @pdf_cert, 'application/pdf', DATALENGTH(@pdf_cert), @h_cert, N'constancia-laboral.pdf',    DATEADD(DAY,-10,@ahora), 'RECHAZADO', @ADMIN, DATEADD(DAY,-9,@ahora),  N'El documento es una constancia laboral de docente, no un certificado de estudio vigente.');

/* =====================================================================
   4. OFERTAS (donaciones)
   ===================================================================== */
DECLARE @UTIL INT = (SELECT id FROM CATEGORIA WHERE nombre = N'Utiles escolares');
DECLARE @TEC  INT = (SELECT id FROM CATEGORIA WHERE nombre = N'Tecnologia');
DECLARE @LIB  INT = (SELECT id FROM CATEGORIA WHERE nombre = N'Libros y textos');
DECLARE @ROPA INT = (SELECT id FROM CATEGORIA WHERE nombre = N'Ropa y calzado');
DECLARE @ASEO INT = (SELECT id FROM CATEGORIA WHERE nombre = N'Implementos de aseo');
DECLARE @MOB  INT = (SELECT id FROM CATEGORIA WHERE nombre = N'Mobiliario pequeno');
DECLARE @LAB  INT = (SELECT id FROM CATEGORIA WHERE nombre = N'Material de laboratorio');
IF @UTIL IS NULL OR @TEC IS NULL OR @LIB IS NULL OR @ROPA IS NULL OR @ASEO IS NULL OR @MOB IS NULL OR @LAB IS NULL
    THROW 50001, 'Faltan categorias del seed (db/02_seed.sql).', 1;

DECLARE @of TABLE (
  clave VARCHAR(8) PRIMARY KEY, donador INT, cat INT, nombre NVARCHAR(200), descr NVARCHAR(1000), cant INT,
  estado VARCHAR(25), cons TINYINT, medida DECIMAL(9,2), dias INT, revisor INT, motivo_rechazo NVARCHAR(400),
  cerrada_dias INT, origen VARCHAR(10), origen_clave VARCHAR(8));
INSERT @of VALUES
 -- Aprobaciones (PENDIENTE): recurrente, nuevo, con fallas y propia del auxiliar (D-47, D-49)
 ('OP1', @DONR, @UTIL, N'Morral escolar [DEMO]',            N'Morral escolar resistente, dos compartimentos.', 2, 'PENDIENTE_APROBACION', 4, NULL, 1, NULL, NULL, NULL, 'DONADOR', NULL),
 ('OP2', @DONN, @LIB,  N'Diccionario ingles-espanol [DEMO]',N'Diccionario de bolsillo en buen estado.',        1, 'PENDIENTE_APROBACION', 4, NULL, 1, NULL, NULL, NULL, 'DONADOR', NULL),
 ('OP3', @AUX2, @MOB,  N'Lampara de escritorio [DEMO]',     N'Lampara LED de escritorio. Publicada por un auxiliar.', 1, 'PENDIENTE_APROBACION', 5, NULL, 2, NULL, NULL, NULL, 'DONADOR', NULL),
 ('OP4', @DONF, @TEC,  N'Mouse inalambrico [DEMO]',         N'Mouse inalambrico con pilas.',                   1, 'PENDIENTE_APROBACION', 3, NULL, 1, NULL, NULL, NULL, 'DONADOR', NULL),
 -- Otros estados de la oferta
 ('OR1', @DONN, @ROPA, N'Gorra deportiva [DEMO]',           N'Gorra con el logo roto.',                        1, 'RECHAZADA', 1, 4, 15, @AUX1, N'La foto no permite verificar el estado y el producto tiene dano visible.', NULL, 'DONADOR', NULL),
 ('OC1', @DONF, @UTIL, N'Set de marcadores [DEMO]',         N'Marcadores de colores.',                         1, 'CANCELADA', 4, NULL, 18, NULL, NULL, 16, 'DONADOR', NULL),
 -- Catalogo y emparejamiento (KD-tree)
 ('OA1', @DONR, @ROPA, N'Chaqueta impermeable [DEMO]',      N'Chaqueta impermeable talla M, uso de un semestre.', 3, 'APROBADA', 4, 3, 12, @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('OA2', @DONN, @UTIL, N'Calculadora cientifica [DEMO]',    N'Calculadoras cientificas nuevas en su empaque.', 5, 'APROBADA', 5, NULL, 30, @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('OA3', @DONL, @TEC,  N'Portatil 8 GB [DEMO]',             N'Portatil de 8 GB de RAM, bateria con buena duracion.', 1, 'APROBADA', 3, NULL, 25, @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('OA4', @DONN, @MOB,  N'Silla ergonomica [DEMO]',          N'Silla de estudio con espaldar ajustable.',       1, 'APROBADA', 4, NULL, 6, @AUX2, NULL, NULL, 'DONADOR', NULL),
 ('OA5', @DONR, @ASEO, N'Kit de aseo personal [DEMO]',      N'Kits con jabon, crema dental y cepillo.',        4, 'APROBADA', 5, NULL, 10, @AUX1, NULL, NULL, 'DONADOR', NULL),
 -- Historial del donador recurrente (3 entregas completas)
 ('OH1', @DONR, @UTIL, N'Cuadernos x10 [DEMO]',             N'Paquete de 10 cuadernos cuadriculados.',         1, 'CERRADA',  5, NULL, 60, @AUX1, NULL, 40, 'DONADOR', NULL),
 ('OH2', @DONR, @LIB,  N'Libro de Calculo I [DEMO]',        N'Libro de calculo diferencial, edicion reciente.',1, 'APROBADA', 4, NULL, 50, @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('OH3', @DONR, @LAB,  N'Bata de laboratorio [DEMO]',       N'Bata blanca talla M.',                           1, 'APROBADA', 4, NULL, 45, @AUX2, NULL, NULL, 'DONADOR', NULL),
 -- Estudiante no recoge -> lote sin destino (para reasignar o LOCAL)
 ('OS1', @DONR, @TEC,  N'Tablet 10 pulgadas [DEMO]',        N'Tablet con cargador.',                           1, 'APROBADA', 4, NULL, 25, @AUX1, NULL, NULL, 'DONADOR', NULL),
 -- Donador con fallas: no llevo el producto dos veces
 ('OF1', @DONF, @TEC,  N'Audifonos con microfono [DEMO]',   N'Audifonos de diadema con microfono.',            1, 'APROBADA', 3, NULL, 40, @AUX1, NULL, NULL, 'DONADOR', NULL),
 -- Recepcion incompleta (D-18): llegaron 3 de 5
 ('OI1', @DONF, @UTIL, N'Resmas de papel carta [DEMO]',     N'Resmas de papel de 500 hojas.',                  5, 'APROBADA', 5, NULL, 14, @AUX1, NULL, NULL, 'DONADOR', NULL),
 -- Devolucion al donador
 ('OD1', @DONL, @TEC,  N'Monitor 19 pulgadas [DEMO]',       N'Monitor LCD con cable VGA.',                     1, 'APROBADA', 3, NULL, 28, @AUX1, NULL, NULL, 'DONADOR', NULL),
 -- LOCAL (D-50)
 ('L1', @DONL, @TEC,  N'Impresora laser [DEMO]',            N'Impresora laser monocromatica.',                 1, 'APROBADA', 3, NULL, 9,  @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('L2', @DONL, @TEC,  N'Videoproyector [DEMO]',             N'Videoproyector HDMI con control.',               1, 'APROBADA', 4, NULL, 12, @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('L3', @DONL, @MOB,  N'Estanteria metalica [DEMO]',        N'Estanteria de 4 niveles.',                       1, 'APROBADA', 4, NULL, 20, @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('L4', @DONN, @MOB,  N'Pizarra acrilica [DEMO]',           N'Pizarra acrilica de 120 x 80 cm.',               1, 'APROBADA', 4, NULL, 22, @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('L5', @DONL, @LAB,  N'Microscopio escolar [DEMO]',        N'Microscopio optico escolar.',                    1, 'APROBADA', 4, NULL, 24, @AUX1, NULL, NULL, 'DONADOR', NULL),
 ('L6', @DONR, @LAB,  N'Osciloscopio digital [DEMO]',       N'Osciloscopio digital de dos canales.',           1, 'APROBADA', 4, NULL, 35, @AUX1, NULL, NULL, 'DONADOR', NULL);

INSERT INTO OFERTA (donador_id, categoria_id, nombre_producto, descripcion, cantidad, estado, estado_conservacion, medida,
                    creada_en, revisada_por, revisada_en, motivo_rechazo, cerrada_en, origen, oferta_origen_id)
SELECT donador, cat, nombre, descr, cant, estado, cons, medida,
       DATEADD(DAY, -dias, @ahora), revisor, CASE WHEN revisor IS NULL THEN NULL ELSE DATEADD(DAY, -dias + 1, @ahora) END,
       motivo_rechazo, CASE WHEN cerrada_dias IS NULL THEN NULL ELSE DATEADD(DAY, -cerrada_dias, @ahora) END, origen, NULL
FROM @of;

-- Ids por clave (los nombres [DEMO] son unicos).
DECLARE @oid TABLE (clave VARCHAR(8) PRIMARY KEY, id INT);
INSERT @oid SELECT f.clave, o.id FROM @of f JOIN OFERTA o ON o.nombre_producto = f.nombre;
DECLARE @OA1 INT = (SELECT id FROM @oid WHERE clave='OA1'), @OA2 INT = (SELECT id FROM @oid WHERE clave='OA2'),
        @OA3 INT = (SELECT id FROM @oid WHERE clave='OA3'), @OA4 INT = (SELECT id FROM @oid WHERE clave='OA4'),
        @OA5 INT = (SELECT id FROM @oid WHERE clave='OA5'), @OH1 INT = (SELECT id FROM @oid WHERE clave='OH1'),
        @OH2 INT = (SELECT id FROM @oid WHERE clave='OH2'), @OH3 INT = (SELECT id FROM @oid WHERE clave='OH3'),
        @OS1 INT = (SELECT id FROM @oid WHERE clave='OS1'), @OF1 INT = (SELECT id FROM @oid WHERE clave='OF1'),
        @OI1 INT = (SELECT id FROM @oid WHERE clave='OI1'), @OD1 INT = (SELECT id FROM @oid WHERE clave='OD1'),
        @L1o INT = (SELECT id FROM @oid WHERE clave='L1'),  @L2o INT = (SELECT id FROM @oid WHERE clave='L2'),
        @L3o INT = (SELECT id FROM @oid WHERE clave='L3'),  @L4o INT = (SELECT id FROM @oid WHERE clave='L4'),
        @L5o INT = (SELECT id FROM @oid WHERE clave='L5'),  @L6o INT = (SELECT id FROM @oid WHERE clave='L6');

-- Oferta generada por la recepcion incompleta (D-18): 3 unidades ya en el LIS.
INSERT INTO OFERTA (donador_id, categoria_id, nombre_producto, descripcion, cantidad, estado, estado_conservacion,
                    creada_en, revisada_por, revisada_en, origen, oferta_origen_id)
VALUES (@DONF, @UTIL, N'Resmas de papel carta (recibidas) [DEMO]',
        N'Resmas de papel de 500 hojas.' + NCHAR(10) + NCHAR(10) + N'[Generada automaticamente por recepcion incompleta]',
        3, 'APROBADA', 5, DATEADD(DAY,-4,@ahora), @AUX1, DATEADD(DAY,-4,@ahora), 'FALTANTE', @OI1);
DECLARE @OI1F INT = SCOPE_IDENTITY();

/* =====================================================================
   5. PETICIONES
   ===================================================================== */
DECLARE @pe TABLE (
  clave VARCHAR(8) PRIMARY KEY, est INT, cat INT, descr NVARCHAR(1000), estado VARCHAR(25), emin TINYINT,
  mmin DECIMAL(9,2), mmax DECIMAL(9,2), dias INT, revisor INT, motivo_rechazo NVARCHAR(400), cerrada_dias INT, motivo_cierre NVARCHAR(400));
INSERT @pe VALUES
 -- Ropa: 2 compatibles con la chaqueta y 2 incompatibles (estado minimo / talla)
 ('P1',  @E1, @ROPA, N'Necesito una chaqueta para la temporada de lluvias [DEMO]', 'APROBADA', 3, 2, 4, 60, @AUX1, NULL, NULL, NULL),
 ('P2',  @E2, @ROPA, N'Necesito ropa abrigada para ir a clase [DEMO]',              'APROBADA', 1, NULL, NULL, 30, @AUX1, NULL, NULL, NULL),
 ('P3',  @E3, @ROPA, N'Necesito una chaqueta nueva para practicas [DEMO]',          'APROBADA', 5, NULL, NULL, 45, @AUX1, NULL, NULL, NULL),
 ('P4',  @E4, @ROPA, N'Necesito una chaqueta talla grande [DEMO]',                  'APROBADA', 1, 5, 7, 10, @AUX1, NULL, NULL, NULL),
 -- Con asignacion vigente
 ('P5',  @E2, @UTIL, N'Necesito una calculadora cientifica para calculo [DEMO]',    'APROBADA', 1, NULL, NULL, 50, @AUX1, NULL, NULL, NULL),
 ('P6',  @E3, @TEC,  N'Necesito un portatil para programar [DEMO]',                 'APROBADA', 3, NULL, NULL, 35, @AUX1, NULL, NULL, NULL),
 ('P7',  @E1, @MOB,  N'Necesito una silla para estudiar en casa [DEMO]',            'APROBADA', 1, NULL, NULL, 15, @AUX2, NULL, NULL, NULL),
 ('P8',  @E1, @ASEO, N'Necesito implementos de aseo personal [DEMO]',               'APROBADA', 1, NULL, NULL, 20, @AUX1, NULL, NULL, NULL),
 -- Cerradas por entrega (historial del donador recurrente)
 ('PH1', @E2, @UTIL, N'Necesito cuadernos para el semestre [DEMO]',                 'CERRADA_ENTREGA', 1, NULL, NULL, 70, @AUX1, NULL, 40, N'Producto entregado al estudiante'),
 ('PH2', @E3, @LIB,  N'Necesito el libro de Calculo I [DEMO]',                      'CERRADA_ENTREGA', 1, NULL, NULL, 65, @AUX1, NULL, 30, N'Producto entregado al estudiante'),
 ('PH3', @E1, @LAB,  N'Necesito una bata para laboratorio de quimica [DEMO]',       'CERRADA_ENTREGA', 1, NULL, NULL, 55, @AUX1, NULL, 25, N'Producto entregado al estudiante'),
 -- Incumplimiento del estudiante (D-16)
 ('PS1', @E4, @TEC,  N'Necesito una tablet para leer material [DEMO]',              'CERRADA_INCUMPLIMIENTO', 1, NULL, NULL, 40, @AUX1, NULL, 6, N'El estudiante no recogio el producto: no se presento en el plazo de 3 dias habiles'),
 ('PD1', @E5, @TEC,  N'Necesito un monitor para estudiar [DEMO]',                   'CERRADA_INCUMPLIMIENTO', 1, NULL, NULL, 35, @AUX1, NULL, 11, N'El estudiante no recogio el producto: se devuelve al donador'),
 -- Vuelven al catalogo tras falla del donador (D-15)
 ('PF1', @E2, @TEC,  N'Necesito audifonos para clases virtuales [DEMO]',            'APROBADA', 1, NULL, NULL, 45, @AUX1, NULL, NULL, NULL),
 ('PF2', @E3, @TEC,  N'Necesito audifonos con microfono [DEMO]',                    'APROBADA', 1, NULL, NULL, 32, @AUX1, NULL, NULL, NULL),
 ('PI1', @E4, @UTIL, N'Necesito papel para imprimir trabajos [DEMO]',               'APROBADA', 1, NULL, NULL, 16, @AUX1, NULL, NULL, NULL),
 -- Limite de 5 peticiones abiertas (Mateo): P4, PI1, PM1 aprobadas + 2 pendientes
 ('PM1', @E4, @TEC,  N'Necesito un mouse para el computador de la casa [DEMO]',     'APROBADA', 1, NULL, NULL, 12, @AUX1, NULL, NULL, NULL),
 ('PM2', @E4, @LIB,  N'Necesito libros de programacion [DEMO]',                     'PENDIENTE_APROBACION', 1, NULL, NULL, 2, NULL, NULL, NULL, NULL),
 ('PM3', @E4, @ASEO, N'Necesito implementos de aseo [DEMO]',                        'PENDIENTE_APROBACION', 1, NULL, NULL, 1, NULL, NULL, NULL, NULL),
 -- Pendientes de aprobacion
 ('PP1', @E5, @UTIL, N'Necesito una mochila para la universidad [DEMO]',            'PENDIENTE_APROBACION', 1, NULL, NULL, 1, NULL, NULL, NULL, NULL),
 ('PP2', @E6, @TEC,  N'Necesito un videoproyector para mis clases [DEMO]',          'PENDIENTE_APROBACION', 1, NULL, NULL, 1, NULL, NULL, NULL, NULL),
 ('PP3', @E5, @MOB,  N'Necesito una estanteria para mis libros [DEMO]',             'APROBADA', 1, NULL, NULL, 8, @AUX2, NULL, NULL, NULL),
 -- Rechazada (cuenta de docente) y cancelada por el estudiante
 ('PR1', @E6, @LIB,  N'Necesito libros de consulta para mi curso [DEMO]',           'RECHAZADA', 1, NULL, NULL, 15, @ADMIN, N'El certificado indica que es docente: la plataforma es para estudiantes.', NULL, NULL),
 ('PC1', @E2, @ROPA, N'Necesito zapatos deportivos [DEMO]',                         'CANCELADA', 1, NULL, NULL, 25, NULL, NULL, 20, N'Ya consegui los zapatos');

INSERT INTO PETICION (estudiante_id, categoria_id, descripcion, estado, estado_minimo, medida_min, medida_max,
                      creada_en, revisada_por, revisada_en, motivo_rechazo, cerrada_en, motivo_cierre)
SELECT est, cat, descr, estado, emin, mmin, mmax, DATEADD(DAY, -dias, @ahora), revisor,
       CASE WHEN revisor IS NULL THEN NULL ELSE DATEADD(DAY, -dias + 1, @ahora) END,
       motivo_rechazo, CASE WHEN cerrada_dias IS NULL THEN NULL ELSE DATEADD(DAY, -cerrada_dias, @ahora) END, motivo_cierre
FROM @pe;

DECLARE @pid TABLE (clave VARCHAR(8) PRIMARY KEY, id INT);
INSERT @pid SELECT f.clave, p.id FROM @pe f JOIN PETICION p ON p.descripcion = f.descr;
DECLARE @P5 INT = (SELECT id FROM @pid WHERE clave='P5'),  @P6 INT = (SELECT id FROM @pid WHERE clave='P6'),
        @P7 INT = (SELECT id FROM @pid WHERE clave='P7'),  @P8 INT = (SELECT id FROM @pid WHERE clave='P8'),
        @PH1 INT = (SELECT id FROM @pid WHERE clave='PH1'), @PH2 INT = (SELECT id FROM @pid WHERE clave='PH2'),
        @PH3 INT = (SELECT id FROM @pid WHERE clave='PH3'), @PS1 INT = (SELECT id FROM @pid WHERE clave='PS1'),
        @PD1 INT = (SELECT id FROM @pid WHERE clave='PD1'), @PF1 INT = (SELECT id FROM @pid WHERE clave='PF1'),
        @PF2 INT = (SELECT id FROM @pid WHERE clave='PF2'), @PI1 INT = (SELECT id FROM @pid WHERE clave='PI1');

/* =====================================================================
   6. ASIGNACIONES (OFERTA_X_PETICION)
   ===================================================================== */
INSERT INTO OFERTA_X_PETICION (oferta_id, peticion_id, cantidad_asignada, estado, puntaje_prioridad, puntaje_sisben,
       puntaje_caracterizacion, puntaje_antiguedad, coeficientes_prioridad, asignada_por, asignada_en, recibida_en,
       custodia_desde, entregada_en, cerrada_en, motivo_cierre, origen) VALUES
 -- ASIGNADO hace 25 dias: vencio el plazo del donador (10 dias habiles) -> DEFINIR_ESTADO
 (@OA2, @P5, 1, 'ASIGNADO',    0.640000, 0.75000, 0.62000, 0.55000, @coef, @AUX1, DATEADD(DAY,-25,@ahora), NULL, NULL, NULL, NULL, NULL, 'DONADOR'),
 -- ASIGNADO hace 2 dias: en plazo (para registrar la recepcion en vivo)
 (@OA4, @P7, 1, 'ASIGNADO',    0.812000, 0.97000, 0.81000, 0.16000, @coef, @AUX2, DATEADD(DAY,-2,@ahora),  NULL, NULL, NULL, NULL, NULL, 'DONADOR'),
 -- EN_CUSTODIA desde hace 8 dias: vencio la recogida -> reasignar (correccion 6)
 (@OA3, @P6, 1, 'EN_CUSTODIA', 0.402000, 0.48000, 0.35000, 0.38000, @coef, @AUX1, DATEADD(DAY,-14,@ahora), DATEADD(DAY,-8,@ahora), DATEADD(DAY,-8,@ahora), NULL, NULL, NULL, 'DONADOR'),
 -- EN_CUSTODIA desde ayer: para registrar la entrega en vivo (foto al donador)
 (@OA5, @P8, 2, 'EN_CUSTODIA', 0.845000, 0.97000, 0.81000, 0.22000, @coef, @AUX1, DATEADD(DAY,-6,@ahora),  DATEADD(DAY,-1,@ahora), DATEADD(DAY,-1,@ahora), NULL, NULL, NULL, 'DONADOR'),
 -- ENTREGADAS (donador recurrente)
 (@OH1, @PH1, 1, 'ENTREGADO',  0.705000, 0.75000, 0.62000, 0.80000, @coef, @AUX1, DATEADD(DAY,-55,@ahora), DATEADD(DAY,-48,@ahora), DATEADD(DAY,-48,@ahora), DATEADD(DAY,-46,@ahora), DATEADD(DAY,-46,@ahora), N'Entregada al estudiante', 'DONADOR'),
 (@OH2, @PH2, 1, 'ENTREGADO',  0.520000, 0.48000, 0.35000, 0.70000, @coef, @AUX1, DATEADD(DAY,-45,@ahora), DATEADD(DAY,-38,@ahora), DATEADD(DAY,-38,@ahora), DATEADD(DAY,-36,@ahora), DATEADD(DAY,-36,@ahora), N'Entregada al estudiante', 'DONADOR'),
 (@OH3, @PH3, 1, 'ENTREGADO',  0.880000, 0.97000, 0.81000, 0.60000, @coef, @AUX2, DATEADD(DAY,-40,@ahora), DATEADD(DAY,-33,@ahora), DATEADD(DAY,-33,@ahora), DATEADD(DAY,-31,@ahora), DATEADD(DAY,-31,@ahora), N'Entregada al estudiante', 'DONADOR'),
 -- Estudiante no recogio: CANCELADO tras custodia, lote sin destino
 (@OS1, @PS1, 1, 'CANCELADO',  0.910000, 1.00000, 0.88000, 0.30000, @coef, @AUX1, DATEADD(DAY,-20,@ahora), DATEADD(DAY,-12,@ahora), DATEADD(DAY,-12,@ahora), NULL, DATEADD(DAY,-6,@ahora), N'El estudiante no recogio el producto en el plazo', 'DONADOR'),
 -- Donador no llevo el producto (2 veces): CANCELADO sin recepcion
 (@OF1, @PF1, 1, 'CANCELADO',  0.600000, 0.75000, 0.62000, 0.40000, @coef, @AUX1, DATEADD(DAY,-38,@ahora), NULL, NULL, NULL, DATEADD(DAY,-22,@ahora), N'El donador no llevo el producto en el plazo', 'DONADOR'),
 (@OF1, @PF2, 1, 'CANCELADO',  0.410000, 0.48000, 0.35000, 0.33000, @coef, @AUX1, DATEADD(DAY,-20,@ahora), NULL, NULL, NULL, DATEADD(DAY,-5,@ahora),  N'El donador no llevo el producto en el plazo', 'DONADOR'),
 -- Recepcion incompleta: llegaron 3 de 5 (D-18)
 (@OI1, @PI1, 5, 'CANCELADO',  0.900000, 1.00000, 0.88000, 0.17000, @coef, @AUX1, DATEADD(DAY,-12,@ahora), DATEADD(DAY,-4,@ahora), NULL, NULL, DATEADD(DAY,-4,@ahora), N'Recepcion incompleta: llegaron 3 de 5 unidades', 'DONADOR'),
 -- Devolucion al donador
 (@OD1, @PD1, 1, 'DEVOLUCION', 0.380000, 0.43000, 0.20000, 0.35000, @coef, @AUX1, DATEADD(DAY,-25,@ahora), DATEADD(DAY,-17,@ahora), DATEADD(DAY,-17,@ahora), NULL, NULL, N'El estudiante no recogio; se devuelve al donador', 'DONADOR');

DECLARE @X_port INT = (SELECT id FROM OFERTA_X_PETICION WHERE oferta_id=@OA3 AND peticion_id=@P6);
DECLARE @X_aseo INT = (SELECT id FROM OFERTA_X_PETICION WHERE oferta_id=@OA5 AND peticion_id=@P8);
DECLARE @X_h1   INT = (SELECT id FROM OFERTA_X_PETICION WHERE oferta_id=@OH1 AND peticion_id=@PH1);
DECLARE @X_h2   INT = (SELECT id FROM OFERTA_X_PETICION WHERE oferta_id=@OH2 AND peticion_id=@PH2);
DECLARE @X_h3   INT = (SELECT id FROM OFERTA_X_PETICION WHERE oferta_id=@OH3 AND peticion_id=@PH3);
DECLARE @X_tab  INT = (SELECT id FROM OFERTA_X_PETICION WHERE oferta_id=@OS1 AND peticion_id=@PS1);
DECLARE @X_res  INT = (SELECT id FROM OFERTA_X_PETICION WHERE oferta_id=@OI1 AND peticion_id=@PI1);
DECLARE @X_mon  INT = (SELECT id FROM OFERTA_X_PETICION WHERE oferta_id=@OD1 AND peticion_id=@PD1);

/* =====================================================================
   7. DESTINOS LOCAL (se crean en ESPERA_RECEPCION; tras recibirlos con
      foto pasan a su estado final en el paso 9)
   ===================================================================== */
INSERT INTO DESTINO_LOCAL (oferta_id, lote_id, origen, cantidad, estado, seleccionado_por, seleccionado_en, motivo) VALUES
 (@L1o, NULL, 'OFERTA', 1, 'ESPERA_RECEPCION', @AUX1, DATEADD(DAY,-2,@ahora),  N'Sin peticiones compatibles por ahora; LOCAL como ultima opcion.'),
 (@L2o, NULL, 'OFERTA', 1, 'ESPERA_RECEPCION', @AUX1, DATEADD(DAY,-6,@ahora),  N'Sin peticiones compatibles al publicarse.'),
 (@L3o, NULL, 'OFERTA', 1, 'ESPERA_RECEPCION', @AUX1, DATEADD(DAY,-15,@ahora), N'Util para la sala de estudio del LIS.'),
 (@L4o, NULL, 'OFERTA', 1, 'ESPERA_RECEPCION', @AUX1, DATEADD(DAY,-18,@ahora), N'Util para las asesorias del LIS.'),
 (@L5o, NULL, 'OFERTA', 1, 'ESPERA_RECEPCION', @AUX1, DATEADD(DAY,-20,@ahora), N'Sin peticiones compatibles.'),
 (@L6o, NULL, 'OFERTA', 1, 'ESPERA_RECEPCION', @AUX1, DATEADD(DAY,-30,@ahora), N'Equipo de alto valor para practicas del LIS.');
DECLARE @L1 INT = (SELECT id FROM DESTINO_LOCAL WHERE oferta_id=@L1o), @L2 INT = (SELECT id FROM DESTINO_LOCAL WHERE oferta_id=@L2o),
        @L3 INT = (SELECT id FROM DESTINO_LOCAL WHERE oferta_id=@L3o), @L4 INT = (SELECT id FROM DESTINO_LOCAL WHERE oferta_id=@L4o),
        @L5 INT = (SELECT id FROM DESTINO_LOCAL WHERE oferta_id=@L5o), @L6 INT = (SELECT id FROM DESTINO_LOCAL WHERE oferta_id=@L6o);

/* =====================================================================
   8. OPCIONAL: CASOS SOBRE CUENTAS REALES
   ===================================================================== */
DECLARE @R_ofEntrega INT, @R_petEntrega INT, @R_xEntrega INT, @R_ofLocal INT, @R_local INT;
DECLARE @R_ofEst INT, @R_petEst INT, @R_xEst INT;
IF @DR IS NOT NULL
BEGIN
    INSERT INTO OFERTA (donador_id, categoria_id, nombre_producto, descripcion, cantidad, estado, estado_conservacion, creada_en, revisada_por, revisada_en)
    VALUES (@DR, @UTIL, N'Juego de reglas y escuadras [DEMO]', N'Juego de geometria completo.', 2, 'PENDIENTE_APROBACION', 5, DATEADD(DAY,-1,@ahora), NULL, NULL);
    -- Una donacion suya ya entregada: el aviso con la FOTO llega a su bandeja (D-51)
    INSERT INTO OFERTA (donador_id, categoria_id, nombre_producto, descripcion, cantidad, estado, estado_conservacion, creada_en, revisada_por, revisada_en)
    VALUES (@DR, @UTIL, N'Mochila deportiva [DEMO]', N'Mochila deportiva en buen estado.', 1, 'APROBADA', 4, DATEADD(DAY,-12,@ahora), @AUX1, DATEADD(DAY,-11,@ahora));
    SET @R_ofEntrega = SCOPE_IDENTITY();
    INSERT INTO PETICION (estudiante_id, categoria_id, descripcion, estado, creada_en, revisada_por, revisada_en, cerrada_en, motivo_cierre)
    VALUES (@E5, @UTIL, N'Necesito una mochila para cargar mis libros [DEMO]', 'CERRADA_ENTREGA', DATEADD(DAY,-20,@ahora), @AUX1, DATEADD(DAY,-19,@ahora), DATEADD(DAY,-2,@ahora), N'Producto entregado al estudiante');
    SET @R_petEntrega = SCOPE_IDENTITY();
    INSERT INTO OFERTA_X_PETICION (oferta_id, peticion_id, cantidad_asignada, estado, puntaje_prioridad, coeficientes_prioridad, asignada_por, asignada_en, recibida_en, custodia_desde, entregada_en, cerrada_en, motivo_cierre, origen)
    VALUES (@R_ofEntrega, @R_petEntrega, 1, 'ENTREGADO', 0.420000, @coef, @AUX1, DATEADD(DAY,-10,@ahora), DATEADD(DAY,-5,@ahora), DATEADD(DAY,-5,@ahora), DATEADD(DAY,-2,@ahora), DATEADD(DAY,-2,@ahora), N'Entregada al estudiante', 'DONADOR');
    SET @R_xEntrega = SCOPE_IDENTITY();
    -- Una donacion suya en custodia LOCAL con PROPUESTA pendiente: puede aceptar o rechazar en "Mis donaciones" (D-50)
    INSERT INTO OFERTA (donador_id, categoria_id, nombre_producto, descripcion, cantidad, estado, estado_conservacion, creada_en, revisada_por, revisada_en)
    VALUES (@DR, @LAB, N'Termometro digital de laboratorio [DEMO]', N'Termometro digital con sonda.', 1, 'APROBADA', 4, DATEADD(DAY,-14,@ahora), @AUX1, DATEADD(DAY,-13,@ahora));
    SET @R_ofLocal = SCOPE_IDENTITY();
    INSERT INTO DESTINO_LOCAL (oferta_id, origen, cantidad, estado, seleccionado_por, seleccionado_en, motivo)
    VALUES (@R_ofLocal, 'OFERTA', 1, 'ESPERA_RECEPCION', @AUX1, DATEADD(DAY,-8,@ahora), N'Sin peticiones compatibles; util para el laboratorio.');
    SET @R_local = SCOPE_IDENTITY();
END
IF @ER IS NOT NULL
BEGIN
    INSERT INTO PETICION (estudiante_id, categoria_id, descripcion, estado, creada_en, revisada_por, revisada_en)
    VALUES (@ER, @LIB, N'Necesito un libro de estructuras de datos [DEMO]', 'PENDIENTE_APROBACION', DATEADD(DAY,-1,@ahora), NULL, NULL);
    -- Una peticion suya con el producto ya EN_CUSTODIA: debe recogerlo
    INSERT INTO OFERTA (donador_id, categoria_id, nombre_producto, descripcion, cantidad, estado, estado_conservacion, creada_en, revisada_por, revisada_en)
    VALUES (@DONR, @UTIL, N'Calculadora graficadora [DEMO]', N'Calculadora graficadora con manual.', 1, 'APROBADA', 4, DATEADD(DAY,-9,@ahora), @AUX1, DATEADD(DAY,-8,@ahora));
    SET @R_ofEst = SCOPE_IDENTITY();
    INSERT INTO PETICION (estudiante_id, categoria_id, descripcion, estado, creada_en, revisada_por, revisada_en)
    VALUES (@ER, @UTIL, N'Necesito una calculadora para mis cursos [DEMO]', 'APROBADA', DATEADD(DAY,-15,@ahora), @AUX1, DATEADD(DAY,-14,@ahora));
    SET @R_petEst = SCOPE_IDENTITY();
    INSERT INTO OFERTA_X_PETICION (oferta_id, peticion_id, cantidad_asignada, estado, puntaje_prioridad, coeficientes_prioridad, asignada_por, asignada_en, recibida_en, custodia_desde, origen)
    VALUES (@R_ofEst, @R_petEst, 1, 'EN_CUSTODIA', 0.700000, @coef, @AUX1, DATEADD(DAY,-5,@ahora), @ahora, @ahora, 'DONADOR');
    SET @R_xEst = SCOPE_IDENTITY();
    INSERT INTO NOTIFICACION (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, clave, creada_en) VALUES
     (@ER, 'LISTO_PARA_RECOGER', N'Tu producto ya esta en el LIS',
      N'El producto de tu peticion "Necesito una calculadora para mis cursos" ya esta en el LIS. Recogelo dentro de los proximos 3 dias habiles.',
      'ASIGNACION', @R_xEst, 'DEMO:LISTO:' + CAST(@R_xEst AS VARCHAR(12)), @ahora);
END

/* =====================================================================
   9. RECEPCIONES CON FOTO, LOTES FISICOS, ENTREGAS CON FOTO
   ===================================================================== */
DECLARE @rec TABLE (
  orden INT IDENTITY PRIMARY KEY, oxp INT NULL, destino INT NULL, oferta_lote INT, cantidad INT,
  contraparte NVARCHAR(200), obs NVARCHAR(600), fecha DATETIME2(0), ubicacion VARCHAR(20), origen_lote VARCHAR(25),
  sin_destino DATETIME2(0) NULL, vincular BIT, entrega DATETIME2(0) NULL, entrega_a NVARCHAR(200) NULL);
INSERT @rec (oxp, destino, oferta_lote, cantidad, contraparte, obs, fecha, ubicacion, origen_lote, sin_destino, vincular, entrega, entrega_a) VALUES
 (@X_port, NULL, @OA3,  1, N'Repartidor de Tecnologia Solidaria', N'Portatil con cargador, sin golpes.', DATEADD(DAY,-8,@ahora),  'EN_LIS',   'RECEPCION_ASIGNACION', NULL, 1, NULL, NULL),
 (@X_aseo, NULL, @OA5,  2, N'Voluntario Fundacion Amigos',        N'Dos kits sellados.',                 DATEADD(DAY,-1,@ahora),  'EN_LIS',   'RECEPCION_ASIGNACION', NULL, 1, NULL, NULL),
 (@X_h1,   NULL, @OH1,  1, N'Voluntario Fundacion Amigos',        NULL,                                  DATEADD(DAY,-48,@ahora), 'ENTREGADO','RECEPCION_ASIGNACION', NULL, 1, DATEADD(DAY,-46,@ahora), N'Santiago Gomez'),
 (@X_h2,   NULL, @OH2,  1, N'Voluntario Fundacion Amigos',        NULL,                                  DATEADD(DAY,-38,@ahora), 'ENTREGADO','RECEPCION_ASIGNACION', NULL, 1, DATEADD(DAY,-36,@ahora), N'Daniela Mejia'),
 (@X_h3,   NULL, @OH3,  1, N'Voluntario Fundacion Amigos',        NULL,                                  DATEADD(DAY,-33,@ahora), 'ENTREGADO','RECEPCION_ASIGNACION', NULL, 1, DATEADD(DAY,-31,@ahora), N'Valentina Rios'),
 (@X_tab,  NULL, @OS1,  1, N'Voluntario Fundacion Amigos',        N'Tablet con cargador.',               DATEADD(DAY,-12,@ahora), 'EN_LIS',   'RECEPCION_ASIGNACION', DATEADD(DAY,-6,@ahora), 1, NULL, NULL),
 (@X_mon,  NULL, @OD1,  1, N'Repartidor de Tecnologia Solidaria', NULL,                                  DATEADD(DAY,-17,@ahora), 'EN_LIS',   'RECEPCION_ASIGNACION', NULL, 1, NULL, NULL),
 -- Incompleta: el lote pertenece a la oferta generada y NO se liga al intento cancelado
 (@X_res,  NULL, @OI1F, 3, N'Jorge Incumplido',                   N'Llegaron 3 de las 5 resmas.',        DATEADD(DAY,-4,@ahora),  'EN_LIS',   'RECEPCION_INCOMPLETA', DATEADD(DAY,-4,@ahora), 0, NULL, NULL),
 -- LOCAL: recepciones institucionales
 (NULL, @L2, @L2o, 1, N'Repartidor de Tecnologia Solidaria', NULL,                     DATEADD(DAY,-1,@ahora),  'EN_LIS',         'RECEPCION_LOCAL', NULL, 0, NULL, NULL),
 (NULL, @L3, @L3o, 1, N'Repartidor de Tecnologia Solidaria', NULL,                     DATEADD(DAY,-8,@ahora),  'EN_LIS',         'RECEPCION_LOCAL', NULL, 0, NULL, NULL),
 (NULL, @L4, @L4o, 1, N'Mariana Nueva',                      NULL,                     DATEADD(DAY,-12,@ahora), 'EN_LIS',         'RECEPCION_LOCAL', NULL, 0, NULL, NULL),
 (NULL, @L5, @L5o, 1, N'Repartidor de Tecnologia Solidaria', NULL,                     DATEADD(DAY,-14,@ahora), 'EN_LIS',         'RECEPCION_LOCAL', NULL, 0, NULL, NULL),
 (NULL, @L6, @L6o, 1, N'Voluntario Fundacion Amigos',        N'Equipo en su caja.',    DATEADD(DAY,-25,@ahora), 'PATRIMONIO_LIS', 'RECEPCION_LOCAL', NULL, 0, NULL, NULL);
IF @DR IS NOT NULL
    INSERT @rec (oxp, destino, oferta_lote, cantidad, contraparte, obs, fecha, ubicacion, origen_lote, sin_destino, vincular, entrega, entrega_a) VALUES
     (@R_xEntrega, NULL, @R_ofEntrega, 1, N'Donador (cuenta real)', NULL, DATEADD(DAY,-5,@ahora), 'ENTREGADO', 'RECEPCION_ASIGNACION', NULL, 1, DATEADD(DAY,-2,@ahora), N'Isabella Torres'),
     (NULL, @R_local, @R_ofLocal, 1, N'Donador (cuenta real)', NULL, DATEADD(DAY,-6,@ahora), 'EN_LIS', 'RECEPCION_LOCAL', NULL, 0, NULL, NULL);
IF @ER IS NOT NULL
    INSERT @rec (oxp, destino, oferta_lote, cantidad, contraparte, obs, fecha, ubicacion, origen_lote, sin_destino, vincular, entrega, entrega_a) VALUES
     (@R_xEst, NULL, @R_ofEst, 1, N'Voluntario Fundacion Amigos', NULL, @ahora, 'EN_LIS', 'RECEPCION_ASIGNACION', NULL, 1, NULL, NULL);

DECLARE @r_oxp INT, @r_dest INT, @r_of INT, @r_cant INT, @r_contra NVARCHAR(200), @r_obs NVARCHAR(600), @r_fecha DATETIME2(0),
        @r_ubic VARCHAR(20), @r_origen VARCHAR(25), @r_sd DATETIME2(0), @r_vinc BIT, @r_ent DATETIME2(0), @r_enta NVARCHAR(200),
        @ev INT, @mov INT, @lote INT, @ev2 INT, @donador INT, @producto NVARCHAR(200);
DECLARE rc CURSOR LOCAL FAST_FORWARD FOR
  SELECT oxp, destino, oferta_lote, cantidad, contraparte, obs, fecha, ubicacion, origen_lote, sin_destino, vincular, entrega, entrega_a
  FROM @rec ORDER BY orden;
OPEN rc;
FETCH NEXT FROM rc INTO @r_oxp, @r_dest, @r_of, @r_cant, @r_contra, @r_obs, @r_fecha, @r_ubic, @r_origen, @r_sd, @r_vinc, @r_ent, @r_enta;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- Foto obligatoria de la recepcion fisica (D-29)
    INSERT INTO EVIDENCIA (contenido, mime, tamano_bytes, hash_sha256, nombre_original, subida_por, subida_en)
    VALUES (CASE WHEN @r_dest IS NULL THEN @png_recepcion ELSE @png_local END, 'image/png',
            DATALENGTH(CASE WHEN @r_dest IS NULL THEN @png_recepcion ELSE @png_local END),
            CASE WHEN @r_dest IS NULL THEN @h_recepcion ELSE @h_local END, N'recepcion-demo.png', @AUX1, @r_fecha);
    SET @ev = SCOPE_IDENTITY();
    INSERT INTO MOVIMIENTO (oferta_x_peticion_id, destino_local_id, tipo, cantidad, nombre_contraparte, evidencia_id, observaciones, registrado_por, registrado_en)
    VALUES (@r_oxp, @r_dest, 'RECEPCION', @r_cant, @r_contra, @ev, @r_obs, @AUX1, @r_fecha);
    SET @mov = SCOPE_IDENTITY();
    INSERT INTO LOTE_FISICO (oferta_id, cantidad, ubicacion, origen, intento_origen_id, recepcion_movimiento_id, sin_destino_desde, creado_en, actualizado_en)
    VALUES (@r_of, @r_cant, @r_ubic, @r_origen, @r_oxp, @mov, @r_sd, @r_fecha, COALESCE(@r_ent, @r_sd));
    SET @lote = SCOPE_IDENTITY();
    UPDATE MOVIMIENTO SET lote_id = @lote WHERE id = @mov;
    IF @r_vinc = 1 UPDATE OFERTA_X_PETICION SET lote_id = @lote WHERE id = @r_oxp;
    IF @r_dest IS NOT NULL UPDATE DESTINO_LOCAL SET lote_id = @lote, estado = 'CUSTODIA_TEMPORAL', custodia_desde = @r_fecha WHERE id = @r_dest;

    -- Entrega final con foto + aviso al donador SOLO por bandeja, con la foto (D-51)
    IF @r_ent IS NOT NULL
    BEGIN
        INSERT INTO EVIDENCIA (contenido, mime, tamano_bytes, hash_sha256, nombre_original, subida_por, subida_en)
        VALUES (@png_entrega, 'image/png', DATALENGTH(@png_entrega), @h_entrega, N'entrega-demo.png', @AUX1, @r_ent);
        SET @ev2 = SCOPE_IDENTITY();
        INSERT INTO MOVIMIENTO (oferta_x_peticion_id, lote_id, tipo, cantidad, nombre_contraparte, evidencia_id, observaciones, registrado_por, registrado_en)
        VALUES (@r_oxp, @lote, 'ENTREGA', @r_cant, @r_enta, @ev2, N'Entrega completa.', @AUX1, @r_ent);
        SELECT @donador = o.donador_id, @producto = o.nombre_producto FROM OFERTA o WHERE o.id = @r_of;
        INSERT INTO NOTIFICACION (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, clave, creada_en, evidencia_id)
        VALUES (@donador, 'ENTREGA_REGISTRADA', N'Tu donacion llego a su destino',
                N'Tu donacion "' + REPLACE(@producto, N' [DEMO]', N'') + N'" (' + CAST(@r_cant AS NVARCHAR(10)) + N' u.) fue entregada a un estudiante. Adjuntamos la foto de la entrega. Gracias por tu aporte.',
                'ASIGNACION', @r_oxp, 'DEMO:ENTREGA:' + CAST(@r_oxp AS VARCHAR(12)), @r_ent, @ev2);
    END
    FETCH NEXT FROM rc INTO @r_oxp, @r_dest, @r_of, @r_cant, @r_contra, @r_obs, @r_fecha, @r_ubic, @r_origen, @r_sd, @r_vinc, @r_ent, @r_enta;
END
CLOSE rc;
DEALLOCATE rc;

/* =====================================================================
   10. ESTADOS FINALES DE LOCAL (D-50)
   ===================================================================== */
-- L2: CUSTODIA_TEMPORAL (ya quedo asi): se puede emparejar con un estudiante.
-- L3: propuesta al donador EN PLAZO
UPDATE DESTINO_LOCAL SET estado = 'PROPUESTO_DONADOR', aceptacion_solicitada_por = @ADMIN, aceptacion_solicitada_en = DATEADD(DAY,-1,@ahora),
       propuesta_motivo = N'La sala de estudio del LIS necesita estanterias para los libros de consulta.',
       propuesta_limite = CAST(DATEADD(DAY, 6, @ahora) AS DATE)
 WHERE id = @L3;
-- L4: propuesta VENCIDA sin respuesta -> tarea DEFINIR_ESTADO al revisar plazos
UPDATE DESTINO_LOCAL SET estado = 'PROPUESTO_DONADOR', aceptacion_solicitada_por = @ADMIN, aceptacion_solicitada_en = DATEADD(DAY,-10,@ahora),
       propuesta_motivo = N'La pizarra serviria para las asesorias academicas del LIS.',
       propuesta_limite = CAST(DATEADD(DAY, -2, @ahora) AS DATE)
 WHERE id = @L4;
-- L5: el donador RECHAZO -> POR_DEVOLVER
UPDATE DESTINO_LOCAL SET estado = 'POR_DEVOLVER', aceptacion_solicitada_por = @ADMIN, aceptacion_solicitada_en = DATEADD(DAY,-6,@ahora),
       propuesta_motivo = N'El microscopio apoyaria las practicas del laboratorio.', propuesta_limite = CAST(DATEADD(DAY, 1, @ahora) AS DATE),
       respuesta_donador = 'RECHAZA', respuesta_en = DATEADD(DAY,-1,@ahora), respuesta_motivo = N'Preferimos donarlo a un colegio; por favor devolverlo.'
 WHERE id = @L5;
-- L6: el donador ACEPTO -> patrimonio del LIS
UPDATE DESTINO_LOCAL SET estado = 'ACEPTADO', aceptacion_solicitada_por = @ADMIN, aceptacion_solicitada_en = DATEADD(DAY,-20,@ahora),
       propuesta_motivo = N'Equipo de alto valor para las practicas de electronica del LIS.', propuesta_limite = CAST(DATEADD(DAY,-13,@ahora) AS DATE),
       respuesta_donador = 'ACEPTA', respuesta_en = DATEADD(DAY,-18,@ahora),
       aceptado_por = @ADMIN, aceptado_en = DATEADD(DAY,-18,@ahora), cerrado_en = DATEADD(DAY,-18,@ahora),
       motivo_cierre = N'Aceptado con consentimiento del donador. Motivo del LIS: equipo para practicas de electronica.'
 WHERE id = @L6;
IF @R_local IS NOT NULL
    UPDATE DESTINO_LOCAL SET estado = 'PROPUESTO_DONADOR', aceptacion_solicitada_por = @ADMIN, aceptacion_solicitada_en = DATEADD(DAY,-1,@ahora),
           propuesta_motivo = N'El laboratorio de quimica del LIS necesita un termometro digital para sus practicas.',
           propuesta_limite = CAST(DATEADD(DAY, 6, @ahora) AS DATE)
     WHERE id = @R_local;

/* =====================================================================
   11. NOTIFICACIONES DE BANDEJA (D-42; correo fuera de alcance, D-53)
   ===================================================================== */
INSERT INTO NOTIFICACION (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, clave, creada_en) VALUES
 (@DONL, 'LOCAL_PROPUESTA', N'El LIS quiere quedarse con tu donacion: necesitamos tu respuesta',
  N'El administrador del LIS propone que "Estanteria metalica" (1 u.) quede como donativo para el laboratorio. Entra a "Mis donaciones" para ACEPTAR o RECHAZAR.',
  'LOCAL', @L3, 'DEMO:PROPUESTA:' + CAST(@L3 AS VARCHAR(12)), DATEADD(DAY,-1,@ahora)),
 (@DONR, 'LOCAL_ACEPTADO', N'Tu donacion quedo para el LIS',
  N'Gracias. "Osciloscopio digital" queda como donativo del LIS. Motivo: equipo para practicas de electronica.',
  'LOCAL', @L6, 'DEMO:ACEPTADO:' + CAST(@L6 AS VARCHAR(12)), DATEADD(DAY,-18,@ahora)),
 (@AUX1, 'LOCAL_POR_DEVOLVER', N'LOCAL: el donador rechazo, hay que devolver',
  N'El donador rechazo la propuesta del microscopio. Coordina la devolucion y registrala con foto.',
  'LOCAL', @L5, 'DEMO:PORDEVOLVER:' + CAST(@L5 AS VARCHAR(12)), DATEADD(DAY,-1,@ahora));
IF @R_local IS NOT NULL
    INSERT INTO NOTIFICACION (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, clave, creada_en) VALUES
     (@DR, 'LOCAL_PROPUESTA', N'El LIS quiere quedarse con tu donacion: necesitamos tu respuesta',
      N'El administrador del LIS propone que "Termometro digital de laboratorio" (1 u.) quede como donativo para el laboratorio. Motivo: el laboratorio de quimica lo necesita para sus practicas. Entra a "Mis donaciones" para ACEPTAR o RECHAZAR. Si rechazas, el LIS te devolvera el producto.',
      'LOCAL', @R_local, 'DEMO:PROPUESTA:' + CAST(@R_local AS VARCHAR(12)), DATEADD(DAY,-1,@ahora));

/* =====================================================================
   12. HISTORIAL DE ESTADOS (alimenta la TRAZABILIDAD, D-52)
   ===================================================================== */
DECLARE @no TABLE (id INT PRIMARY KEY);
INSERT @no SELECT id FROM OFERTA WHERE nombre_producto LIKE '%\[DEMO\]%' ESCAPE '\';
DECLARE @np TABLE (id INT PRIMARY KEY);
INSERT @np SELECT id FROM PETICION WHERE descripcion LIKE '%\[DEMO\]%' ESCAPE '\';

-- Ofertas: publicacion y revision
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'OFERTA', o.id, NULL, CASE WHEN o.origen = 'FALTANTE' THEN 'APROBADA' ELSE 'PENDIENTE_APROBACION' END,
       CASE WHEN o.origen = 'FALTANTE' THEN o.revisada_por ELSE o.donador_id END,
       CASE WHEN o.origen = 'FALTANTE' THEN N'Generada por recepcion incompleta de la oferta ' + CAST(o.oferta_origen_id AS NVARCHAR(12)) ELSE N'Publicada por el donador' END,
       o.creada_en
FROM OFERTA o WHERE o.id IN (SELECT id FROM @no);
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'OFERTA', o.id, 'PENDIENTE_APROBACION', CASE WHEN o.estado = 'RECHAZADA' THEN 'RECHAZADA' ELSE 'APROBADA' END, o.revisada_por,
       CASE WHEN o.estado = 'RECHAZADA' THEN o.motivo_rechazo ELSE N'Aprobada por el personal del LIS' END, o.revisada_en
FROM OFERTA o WHERE o.id IN (SELECT id FROM @no) AND o.origen = 'DONADOR' AND o.revisada_en IS NOT NULL;
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'OFERTA', o.id, CASE WHEN o.estado = 'CANCELADA' THEN 'PENDIENTE_APROBACION' ELSE 'APROBADA' END, o.estado,
       CASE WHEN o.estado = 'CANCELADA' THEN o.donador_id ELSE @AUX1 END,
       CASE WHEN o.estado = 'CANCELADA' THEN N'Cancelada por el donador: ya no dispone del producto' ELSE N'Todas las unidades fueron entregadas' END,
       o.cerrada_en
FROM OFERTA o WHERE o.id IN (SELECT id FROM @no) AND o.estado IN ('CANCELADA','CERRADA');

-- Peticiones: creacion, revision y cierre
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'PETICION', p.id, NULL, 'PENDIENTE_APROBACION', p.estudiante_id, N'Peticion registrada por el estudiante', p.creada_en
FROM PETICION p WHERE p.id IN (SELECT id FROM @np);
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'PETICION', p.id, 'PENDIENTE_APROBACION', CASE WHEN p.estado = 'RECHAZADA' THEN 'RECHAZADA' ELSE 'APROBADA' END, p.revisada_por,
       CASE WHEN p.estado = 'RECHAZADA' THEN p.motivo_rechazo ELSE N'Aprobada por el personal del LIS' END, p.revisada_en
FROM PETICION p WHERE p.id IN (SELECT id FROM @np) AND p.revisada_en IS NOT NULL;
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'PETICION', p.id, CASE WHEN p.estado = 'CANCELADA' THEN 'PENDIENTE_APROBACION' ELSE 'APROBADA' END, p.estado,
       CASE WHEN p.estado = 'CANCELADA' THEN p.estudiante_id ELSE @AUX1 END, p.motivo_cierre, p.cerrada_en
FROM PETICION p WHERE p.id IN (SELECT id FROM @np) AND p.estado IN ('CANCELADA','CERRADA_ENTREGA','CERRADA_INCUMPLIMIENTO');

-- Asignaciones: cada transicion
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'ASIGNACION', x.id, NULL, 'ASIGNADO', x.asignada_por,
       N'Asignadas ' + CAST(x.cantidad_asignada AS NVARCHAR(10)) + N' unidades de la oferta ' + CAST(x.oferta_id AS NVARCHAR(12)) +
       N' a la peticion ' + CAST(x.peticion_id AS NVARCHAR(12)) + N'. Prioridad ' + CAST(CAST(x.puntaje_prioridad AS DECIMAL(4,3)) AS NVARCHAR(10)),
       x.asignada_en
FROM OFERTA_X_PETICION x WHERE x.oferta_id IN (SELECT id FROM @no);
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'ASIGNACION', x.id, 'ASIGNADO', 'EN_CUSTODIA', @AUX1,
       N'Recibidas ' + CAST(x.cantidad_asignada AS NVARCHAR(10)) + N' unidades con foto (lote ' + CAST(x.lote_id AS NVARCHAR(12)) + N')', x.recibida_en
FROM OFERTA_X_PETICION x WHERE x.oferta_id IN (SELECT id FROM @no) AND x.recibida_en IS NOT NULL AND x.lote_id IS NOT NULL;
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'ASIGNACION', x.id, 'EN_CUSTODIA', 'ENTREGADO', @AUX1, N'Entregadas ' + CAST(x.cantidad_asignada AS NVARCHAR(10)) + N' unidades con foto', x.entregada_en
FROM OFERTA_X_PETICION x WHERE x.oferta_id IN (SELECT id FROM @no) AND x.estado = 'ENTREGADO';
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'ASIGNACION', x.id, CASE WHEN x.lote_id IS NULL THEN 'ASIGNADO' ELSE 'EN_CUSTODIA' END, 'CANCELADO', @AUX1, x.motivo_cierre, x.cerrada_en
FROM OFERTA_X_PETICION x WHERE x.oferta_id IN (SELECT id FROM @no) AND x.estado = 'CANCELADO';
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'ASIGNACION', x.id, 'EN_CUSTODIA', 'DEVOLUCION', @AUX1, x.motivo_cierre, DATEADD(DAY, 6, x.recibida_en)
FROM OFERTA_X_PETICION x WHERE x.oferta_id IN (SELECT id FROM @no) AND x.estado = 'DEVOLUCION';
-- Lote sin destino tras el incumplimiento del estudiante
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'LOTE', x.lote_id, 'EN_CUSTODIA', 'SIN_DESTINO', @AUX1, N'Asignacion ' + CAST(x.id AS NVARCHAR(12)) + N' cancelada', x.cerrada_en
FROM OFERTA_X_PETICION x WHERE x.id = @X_tab;

-- LOCAL: seleccion, recepcion, propuesta y respuesta del donador
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'LOCAL', d.id, NULL, 'ESPERA_RECEPCION', d.seleccionado_por, N'LOCAL elegido como ultima opcion: ' + d.motivo, d.seleccionado_en
FROM DESTINO_LOCAL d WHERE d.oferta_id IN (SELECT id FROM @no);
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'LOCAL', d.id, 'ESPERA_RECEPCION', 'CUSTODIA_TEMPORAL', @AUX1, N'Recibido con foto (lote ' + CAST(d.lote_id AS NVARCHAR(12)) + N'); inicia custodia temporal del LIS', d.custodia_desde
FROM DESTINO_LOCAL d WHERE d.oferta_id IN (SELECT id FROM @no) AND d.custodia_desde IS NOT NULL;
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'LOCAL', d.id, 'CUSTODIA_TEMPORAL', 'PROPUESTO_DONADOR', d.aceptacion_solicitada_por,
       N'Propuesta al donador (responde hasta ' + CONVERT(NVARCHAR(10), d.propuesta_limite, 23) + N'): ' + d.propuesta_motivo, d.aceptacion_solicitada_en
FROM DESTINO_LOCAL d WHERE d.oferta_id IN (SELECT id FROM @no) AND d.aceptacion_solicitada_en IS NOT NULL;
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'LOCAL', d.id, 'PROPUESTO_DONADOR', d.estado, o.donador_id,
       CASE WHEN d.respuesta_donador = 'ACEPTA' THEN N'El donador ACEPTO que quede para el LIS'
            ELSE N'El donador RECHAZO que quede para el LIS; se le debe devolver: ' + ISNULL(d.respuesta_motivo, N'') END,
       d.respuesta_en
FROM DESTINO_LOCAL d JOIN OFERTA o ON o.id = d.oferta_id
WHERE d.oferta_id IN (SELECT id FROM @no) AND d.respuesta_en IS NOT NULL;
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)
SELECT 'LOTE', d.lote_id, 'CUSTODIA_LOCAL', 'PATRIMONIO_LIS', o.donador_id, N'Destino LOCAL ' + CAST(d.id AS NVARCHAR(12)) + N' aceptado por el donador', d.aceptado_en
FROM DESTINO_LOCAL d JOIN OFERTA o ON o.id = d.oferta_id
WHERE d.oferta_id IN (SELECT id FROM @no) AND d.estado = 'ACEPTADO';

-- Usuarios: roles y bloqueo
INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en) VALUES
 ('USUARIO', @SUPER, NULL, 'ROL_SUPERUSUARIO', NULL,   N'Asignado manualmente por script de mantenimiento', DATEADD(DAY,-120,@ahora)),
 ('USUARIO', @ADMIN, NULL, 'ROL_ADMINISTRADOR', @SUPER, N'Rol otorgado por un superusuario', DATEADD(DAY,-110,@ahora)),
 ('USUARIO', @AUX1,  NULL, 'ROL_AUXILIAR_LIS', @ADMIN, N'Rol otorgado por un administrador', DATEADD(DAY,-100,@ahora)),
 ('USUARIO', @AUX2,  NULL, 'ROL_AUXILIAR_LIS', @ADMIN, N'Rol otorgado por un administrador', DATEADD(DAY,-95,@ahora)),
 ('USUARIO', @BLOQ,  'ACTIVO', 'BLOQUEADO', @ADMIN, N'Publico ofertas falsas de forma reiterada (caso de demostracion).', DATEADD(DAY,-40,@ahora)),
 ('USUARIO', @E6,    'CERTIFICADO_PENDIENTE', 'CERTIFICADO_RECHAZADO', @ADMIN, N'El documento es una constancia laboral de docente.', DATEADD(DAY,-9,@ahora));

/* =====================================================================
   13. FOTO DE CADA PUBLICACION (catalogo, aprobaciones, mis donaciones)
   ===================================================================== */
DECLARE @of_id INT, @of_don INT, @of_fecha DATETIME2(0);
DECLARE fc CURSOR LOCAL FAST_FORWARD FOR
  SELECT id, donador_id, creada_en FROM OFERTA WHERE id IN (SELECT id FROM @no) AND origen = 'DONADOR';
OPEN fc;
FETCH NEXT FROM fc INTO @of_id, @of_don, @of_fecha;
WHILE @@FETCH_STATUS = 0
BEGIN
    INSERT INTO EVIDENCIA (contenido, mime, tamano_bytes, hash_sha256, nombre_original, subida_por, subida_en)
    VALUES (@png_producto, 'image/png', DATALENGTH(@png_producto), @h_producto, N'producto-demo.png', @of_don, @of_fecha);
    UPDATE OFERTA SET foto_id = SCOPE_IDENTITY() WHERE id = @of_id;
    FETCH NEXT FROM fc INTO @of_id, @of_don, @of_fecha;
END
CLOSE fc;
DEALLOCATE fc;
-- La oferta generada por faltante reutiliza la foto de su oferta de origen (como hace el backend).
UPDATE f SET f.foto_id = o.foto_id FROM OFERTA f JOIN OFERTA o ON o.id = f.oferta_origen_id WHERE f.id = @OI1F;

COMMIT TRANSACTION;

/* =====================================================================
   14. RESUMEN
   ===================================================================== */
SELECT 'Usuarios demo' AS que, COUNT(*) AS cantidad FROM USUARIO WHERE google_sub LIKE 'demo-%'
UNION ALL SELECT 'Ofertas [DEMO]', COUNT(*) FROM OFERTA WHERE nombre_producto LIKE '%\[DEMO\]%' ESCAPE '\'
UNION ALL SELECT 'Peticiones [DEMO]', COUNT(*) FROM PETICION WHERE descripcion LIKE '%\[DEMO\]%' ESCAPE '\'
UNION ALL SELECT 'Asignaciones', COUNT(*) FROM OFERTA_X_PETICION WHERE oferta_id IN (SELECT id FROM OFERTA WHERE nombre_producto LIKE '%\[DEMO\]%' ESCAPE '\')
UNION ALL SELECT 'Destinos LOCAL', COUNT(*) FROM DESTINO_LOCAL WHERE oferta_id IN (SELECT id FROM OFERTA WHERE nombre_producto LIKE '%\[DEMO\]%' ESCAPE '\')
UNION ALL SELECT 'Movimientos con foto', COUNT(*) FROM MOVIMIENTO WHERE lote_id IN (SELECT id FROM LOTE_FISICO WHERE oferta_id IN (SELECT id FROM OFERTA WHERE nombre_producto LIKE '%\[DEMO\]%' ESCAPE '\'))
UNION ALL SELECT 'Casos en cuenta donador real', CASE WHEN @DR IS NULL THEN 0 ELSE 3 END
UNION ALL SELECT 'Casos en cuenta estudiante real', CASE WHEN @ER IS NULL THEN 0 ELSE 2 END;
PRINT 'Datos de demostracion cargados. En "Plazos y tareas" pulsa "Revisar ahora" para generar las tareas DEFINIR_ESTADO.';
GO
