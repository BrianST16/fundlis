/**
 * Ejecutor de migraciones versionadas para PostgreSQL / Supabase (D-68).
 *   node scripts/db/migrar.js            aplica las pendientes
 *   node scripts/db/migrar.js --estado   solo lista aplicadas y pendientes
 *
 * - Lee db/postgres/migraciones/NNN_descripcion.sql en orden.
 * - Registra cada una en lis.esquema_version (version, nombre, sha256, fecha).
 * - Cada migracion corre en UNA transaccion: si falla, se revierte completa
 *   y no se registra (Postgres admite DDL transaccional).
 * - Si el contenido de una migracion ya aplicada cambio, se detiene.
 * - Se ejecuta con el usuario ADMINISTRADOR (DB_ADMIN_USER), nunca con lis_app.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { conectar, destinoLegible } = require('./conexion');

const DIR = path.join(__dirname, '..', '..', '..', 'db', 'postgres', 'migraciones');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

(async () => {
  const soloEstado = process.argv.includes('--estado');
  console.log(`Destino: ${destinoLegible()}`);
  const db = await conectar();
  try {
    await db.query(`
      CREATE SCHEMA IF NOT EXISTS lis;
      CREATE TABLE IF NOT EXISTS lis.esquema_version (
        version     integer        NOT NULL PRIMARY KEY,
        nombre      varchar(200)   NOT NULL,
        sha256      char(64)       NOT NULL,
        aplicada_en timestamptz(0) NOT NULL DEFAULT now()
      );`);
    const aplicadas = new Map(
      (await db.query('SELECT version, nombre, sha256 FROM lis.esquema_version')).rows.map((r) => [r.version, r]),
    );

    const archivos = fs.readdirSync(DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    for (const f of archivos) {
      const version = Number(f.slice(0, 3));
      // El hash no depende del fin de linea (CRLF en Windows, LF en el servidor).
      const texto = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
      const hash = sha(texto);
      const previa = aplicadas.get(version);
      if (previa) {
        if (previa.sha256 !== hash) throw new Error(`La migracion ${f} cambio despues de aplicarse. Crea una migracion nueva.`);
        console.log(`  [aplicada]  ${f}`);
        continue;
      }
      if (soloEstado) {
        console.log(`  [pendiente] ${f}`);
        continue;
      }
      await db.query('BEGIN');
      try {
        await db.query(texto);
        await db.query('INSERT INTO lis.esquema_version (version, nombre, sha256) VALUES ($1, $2, $3)', [version, f, hash]);
        await db.query('COMMIT');
        console.log(`  [aplicada ahora] ${f}`);
      } catch (e) {
        await db.query('ROLLBACK');
        throw new Error(`Fallo ${f}: ${e.message}. La migracion se revirtio completa.`);
      }
    }
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
