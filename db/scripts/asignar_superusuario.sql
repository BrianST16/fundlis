/* =====================================================================
   Asignar (o quitar) el rol SUPERUSUARIO - SOLO MANTENIMIENTO
   ---------------------------------------------------------------------
   D-45: el rol SUPERUSUARIO nunca se otorga desde la interfaz ni la API.
   Requisitos:
     - Migracion 007 aplicada.
     - La persona ya inicio sesion con Google al menos una vez
       (debe existir en USUARIO).
   Uso: cambia @email y @accion, revisa la BD destino y ejecuta.
     @accion = 'ASIGNAR' | 'QUITAR'
   Queda constancia en HISTORIAL_ESTADO (actor NULL = mantenimiento).
   ===================================================================== */
SET XACT_ABORT ON;

DECLARE @email  VARCHAR(320) = 'CAMBIAR@correo.com';
DECLARE @accion VARCHAR(10)  = 'ASIGNAR';

DECLARE @id INT = (SELECT id FROM USUARIO WHERE email = @email);
IF @id IS NULL
    THROW 50001, 'Ese correo no existe en USUARIO: debe iniciar sesion al menos una vez.', 1;

BEGIN TRANSACTION;

IF @accion = 'ASIGNAR'
BEGIN
    IF EXISTS (SELECT 1 FROM USUARIO_ROL WHERE usuario_id = @id AND rol = 'SUPERUSUARIO')
        PRINT 'El usuario ya es SUPERUSUARIO. No se hizo nada.';
    ELSE
    BEGIN
        INSERT INTO USUARIO_ROL (usuario_id, rol, asignado_por) VALUES (@id, 'SUPERUSUARIO', NULL);
        INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo)
        VALUES ('USUARIO', @id, NULL, 'ROL_SUPERUSUARIO', NULL,
                N'Asignado manualmente por script de mantenimiento');
        PRINT 'Rol SUPERUSUARIO asignado.';
    END
END
ELSE IF @accion = 'QUITAR'
BEGIN
    IF NOT EXISTS (SELECT 1 FROM USUARIO_ROL WHERE usuario_id = @id AND rol = 'SUPERUSUARIO')
        PRINT 'El usuario no es SUPERUSUARIO. No se hizo nada.';
    ELSE
    BEGIN
        DELETE FROM USUARIO_ROL WHERE usuario_id = @id AND rol = 'SUPERUSUARIO';
        INSERT INTO HISTORIAL_ESTADO (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo)
        VALUES ('USUARIO', @id, 'ROL_SUPERUSUARIO', 'SIN_ROL_SUPERUSUARIO', NULL,
                N'Retirado manualmente por script de mantenimiento');
        PRINT 'Rol SUPERUSUARIO retirado.';
    END
END
ELSE
    THROW 50002, '@accion debe ser ASIGNAR o QUITAR.', 1;

COMMIT TRANSACTION;
