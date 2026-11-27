/**
 * Activa el usuario de la aplicacion lis_app (creado sin login por la
 * migracion 003) y le pone la clave de DB_PASSWORD del .env.
 *   node scripts/db/usuario-app.js
 *
 * - Se ejecuta como ADMINISTRADOR. La clave nunca se imprime ni se escribe
 *   en el repositorio: viaja como parametro y se aplica dentro de la BD.
 * - Exige una clave de al menos 24 caracteres.
 * - Repetible: sirve tambien para rotar la clave.
 */
const { conectar, destinoLegible } = require('./conexion');

(async () => {
  const clave = process.env.DB_PASSWORD || '';
  const usuario = (process.env.DB_USER || '').split('.')[0];
  if (usuario !== 'lis_app') throw new Error('DB_USER debe ser lis_app (o lis_app.<ref> en el pooler de Supabase).');
  if (clave.length < 24) throw new Error('DB_PASSWORD debe tener al menos 24 caracteres.');

  console.log(`Destino: ${destinoLegible()}`);
  const db = await conectar();
  try {
    await db.query('BEGIN');
    // set_config(..., true) vale solo dentro de esta transaccion.
    await db.query(`SELECT set_config('lis.clave_app', $1, true)`, [clave]);
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lis_app') THEN
          RAISE EXCEPTION 'No existe lis_app: aplica primero las migraciones (node scripts/db/migrar.js).';
        END IF;
        EXECUTE format('ALTER ROLE lis_app WITH LOGIN PASSWORD %L', current_setting('lis.clave_app'));
      END
      $$;`);
    await db.query('COMMIT');
    console.log('Usuario lis_app activo: puede iniciar sesion con la clave de DB_PASSWORD (no se imprime).');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
