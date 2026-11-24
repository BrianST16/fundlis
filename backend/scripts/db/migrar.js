/**
 * Ejecutor de migraciones versionadas (INDICACIONES §2, paso 4).
 *   node scripts/db/migrar.js            aplica las pendientes
 *   node scripts/db/migrar.js --estado   solo lista aplicadas/pendientes
 *
 * - Lee db/migraciones/NNN_descripcion.sql en orden.
 * - Registra cada una en ESQUEMA_VERSION (version, nombre, sha256, fecha).
 * - Cada migracion corre en UNA transaccion: si un lote falla, se revierte
 *   completa y no se registra.
 * - Separa lotes por lineas "GO" (como sqlcmd).
 * - Si el contenido de una migracion ya aplicada cambio, se detiene.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { conectar, destinoLegible, sql } = require('./conexion');

const DIR = path.join(__dirname, '..', '..', '..', 'db', 'migraciones');

function lotes(texto) {
  return texto
    .split(/^\s*GO\s*;?\s*$/gim)
    .map((l) => l.trim())
    .filter((l) => l && !/^(--[^\n]*\n?|\s)*$/.test(l));
}

(async () => {
  const soloEstado = process.argv.includes('--estado');
  console.log(`Destino: ${destinoLegible()}`);
  const pool = await conectar();

  await pool.request().batch(`
    IF OBJECT_ID('ESQUEMA_VERSION') IS NULL
    CREATE TABLE ESQUEMA_VERSION (
      version     INT           NOT NULL PRIMARY KEY,
      nombre      NVARCHAR(200) NOT NULL,
      sha256      CHAR(64)      NOT NULL,
      aplicada_en DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
    );`);

  const aplicadas = new Map(
    (await pool.request().query('SELECT version, nombre, sha256 FROM ESQUEMA_VERSION')).recordset.map((r) => [
      r.version,
      r,
    ]),
  );

  const archivos = fs
    .readdirSync(DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  for (const f of archivos) {
    const version = Number(f.slice(0, 3));
    const texto = fs.readFileSync(path.join(DIR, f), 'utf8');
    // El hash no depende del fin de linea: Git puede entregar el mismo archivo
    // con CRLF (Windows) o LF (Linux/Mac, p. ej. el servidor de despliegue).
    // Se guarda el hash normalizado a LF y se aceptan tambien los hashes que
    // se guardaron antes con el contenido en CRLF.
    const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
    const lf = texto.replace(/\r\n/g, '\n');
    const hash = sha(lf);
    const equivalentes = new Set([hash, sha(lf.replace(/\n/g, '\r\n'))]);
    const previa = aplicadas.get(version);

    if (previa) {
      if (!equivalentes.has(previa.sha256)) {
        throw new Error(`La migracion ${f} cambio despues de aplicarse. Crea una migracion nueva.`);
      }
      console.log(`  [aplicada]  ${f}`);
      continue;
    }
    if (soloEstado) {
      console.log(`  [pendiente] ${f}`);
      continue;
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const lote of lotes(texto)) {
        await new sql.Request(tx).batch(lote);
      }
      await new sql.Request(tx)
        .input('v', version)
        .input('n', f)
        .input('h', hash)
        .query('INSERT INTO ESQUEMA_VERSION (version, nombre, sha256) VALUES (@v, @n, @h)');
      await tx.commit();
      console.log(`  [aplicada ahora] ${f}`);
    } catch (e) {
      await tx.rollback();
      throw new Error(`Fallo ${f}: ${e.message}. La migracion se revirtio completa.`);
    }
  }
  await pool.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
