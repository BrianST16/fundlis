/* =====================================================================
   Usuario de la APLICACION con permisos minimos (S4, D-65)
   ---------------------------------------------------------------------
   El backend no necesita crear ni alterar tablas en tiempo de ejecucion:
   solo leer y escribir datos. Este usuario:
     - lee y escribe datos (db_datareader, db_datawriter);
     - NO puede modificar ni borrar el historial (DENY UPDATE, DELETE);
     - NO puede crear, alterar ni borrar objetos (no es db_owner ni ddladmin).
   Las MIGRACIONES se siguen ejecutando con un usuario administrador
   (variables DB_USER / DB_PASSWORD de un .env aparte o en la sesion).

   Uso: abrir en SSMS conectado como administrador, cambiar @clave por una
   clave larga y propia, y ejecutar. Luego poner en el .env del backend
   DB_USER=lis_app y DB_PASSWORD=<esa clave>. No guardar la clave en el
   repositorio.
   ===================================================================== */
USE LisDona;
GO
DECLARE @clave NVARCHAR(128) = N'CAMBIAR_POR_UNA_CLAVE_LARGA';
IF @clave LIKE N'CAMBIAR%'
    THROW 50001, 'Define una clave propia en @clave antes de ejecutar el script.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'lis_app')
BEGIN
    DECLARE @sql NVARCHAR(400) =
        N'CREATE LOGIN lis_app WITH PASSWORD = ' + QUOTENAME(@clave, '''') + N', CHECK_POLICY = ON, DEFAULT_DATABASE = LisDona';
    EXEC (@sql);
END;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'lis_app')
    CREATE USER lis_app FOR LOGIN lis_app;

ALTER ROLE db_datareader ADD MEMBER lis_app;
ALTER ROLE db_datawriter ADD MEMBER lis_app;

-- La auditoria solo se agrega (ademas del trigger de la migracion 014).
DENY UPDATE, DELETE ON dbo.HISTORIAL_ESTADO TO lis_app;
-- El registro de migraciones lo maneja solo el administrador.
DENY INSERT, UPDATE, DELETE ON dbo.ESQUEMA_VERSION TO lis_app;

PRINT 'Usuario lis_app listo: lectura y escritura de datos, sin DDL y sin poder alterar el historial.';
GO
