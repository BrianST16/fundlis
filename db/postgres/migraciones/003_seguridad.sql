/* =====================================================================
   003 - Seguridad de la capa de datos en Supabase           D-65, D-68
   ---------------------------------------------------------------------
   Mantiene los estandares de SQL Server (S3, S4) y cierra lo propio de
   Supabase:

   1. Usuario de la APLICACION con minimo privilegio: lis_app.
      - Lee y escribe datos; no crea, altera ni borra objetos (sin DDL).
      - historial_estado: solo SELECT e INSERT (la auditoria solo crece;
        ademas lo impide el trigger de 001).
      - esquema_version: sin acceso (lo maneja el administrador).
      - Se crea SIN login. La clave y el LOGIN los pone
        backend/scripts/db/usuario-app.js leyendo DB_PASSWORD del .env,
        para que ninguna clave quede en el repositorio.
   2. La API REST de Supabase (PostgREST) usa los roles anon y
      authenticated. Por defecto expone el esquema public. Aqui:
      - todo vive en el esquema lis, que NO se expone;
      - anon y authenticated no tienen ningun permiso sobre lis;
      - RLS activo en todas las tablas, con una politica que solo admite
        a lis_app: aunque algun dia se expusiera el esquema o se
        otorgara un permiso por error, esos roles no verian filas.
   3. Limites de sesion de lis_app: consultas de mas de 30 s y
      transacciones abiertas sin actividad por mas de 60 s se cortan.
   ===================================================================== */
SET LOCAL search_path = lis;

/* 1. Rol de la aplicacion (sin login todavia). */
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lis_app') THEN
        CREATE ROLE lis_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
END
$$;

ALTER ROLE lis_app SET search_path = lis;
ALTER ROLE lis_app SET statement_timeout = '30s';
ALTER ROLE lis_app SET idle_in_transaction_session_timeout = '60s';

REVOKE ALL ON SCHEMA lis FROM PUBLIC;
GRANT USAGE ON SCHEMA lis TO lis_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA lis TO lis_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA lis TO lis_app;

-- La auditoria solo se agrega.
REVOKE UPDATE, DELETE, TRUNCATE ON historial_estado FROM lis_app;
-- El registro de migraciones es solo del administrador.
REVOKE ALL ON esquema_version FROM lis_app;

/* 2. Roles de la API publica de Supabase: sin acceso al esquema lis.
      (En un Postgres sin Supabase esos roles no existen y se omite.) */
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA lis FROM %I', r);
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA lis FROM %I', r);
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA lis FROM %I', r);
            EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lis FROM %I', r);
        END IF;
    END LOOP;
END
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lis FROM PUBLIC;

/* 3. RLS en todas las tablas: solo lis_app ve y escribe filas.
      El administrador (dueno de las tablas) no queda sujeto a RLS, lo que
      permite migraciones y el script de demostracion. */
DO $$
DECLARE t text;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'lis' AND tablename <> 'esquema_version' LOOP
        EXECUTE format('ALTER TABLE lis.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS lis_app_acceso ON lis.%I', t);
        EXECUTE format('CREATE POLICY lis_app_acceso ON lis.%I FOR ALL TO lis_app USING (true) WITH CHECK (true)', t);
    END LOOP;
END
$$;
ALTER TABLE esquema_version ENABLE ROW LEVEL SECURITY;  -- sin politica: nadie salvo el dueno

/* 4. Tablas futuras: los mismos permisos, nunca para anon/authenticated.
      (Cada migracion nueva debe activar RLS y su politica en sus tablas.) */
ALTER DEFAULT PRIVILEGES IN SCHEMA lis GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA lis GRANT USAGE, SELECT ON SEQUENCES TO lis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA lis REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
