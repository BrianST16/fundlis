/**
 * Verificacion de SOLO LECTURA de la base experimental (paso 1 del
 * procedimiento de INDICACIONES_COMPLEMENTARIAS §2).
 *   node scripts/db/verificar-bd.js
 * Muestra servidor, instancia, base, edicion, tablas y conteos. No imprime
 * credenciales ni contenido de filas.
 */
const { conectar, destinoLegible } = require('./conexion');

(async () => {
  console.log(`Destino configurado: ${destinoLegible()}`);
  const pool = await conectar();
  const info = await pool.request().query(`
    SELECT @@SERVERNAME AS servidor, DB_NAME() AS base,
           CAST(SERVERPROPERTY('Edition') AS NVARCHAR(128)) AS edicion,
           CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(64)) AS version,
           CAST(SERVERPROPERTY('InstanceName') AS NVARCHAR(128)) AS instancia`);
  console.table(info.recordset);

  const tablas = await pool.request().query(`
    SELECT t.name AS tabla, SUM(p.rows) AS filas
    FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
    GROUP BY t.name ORDER BY t.name`);
  console.table(tablas.recordset);

  const vistas = await pool.request().query(`SELECT name FROM sys.views ORDER BY name`);
  console.log('Vistas:', vistas.recordset.map((v) => v.name).join(', ') || '(ninguna)');

  // Senales de datos reales sin revelarlos: dominios de correo agregados.
  const tieneUsuario = tablas.recordset.some((t) => t.tabla === 'USUARIO');
  if (tieneUsuario) {
    const dominios = await pool.request().query(`
      SELECT RIGHT(email, LEN(email) - CHARINDEX('@', email)) AS dominio, COUNT(*) AS usuarios
      FROM USUARIO GROUP BY RIGHT(email, LEN(email) - CHARINDEX('@', email))`);
    console.log('Usuarios por dominio (sin direcciones):');
    console.table(dominios.recordset);
  }
  const otras = await pool.request().query(`SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name`);
  console.log('Bases de usuario en el servidor:', otras.recordset.map((d) => d.name).join(', '));
  await pool.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
