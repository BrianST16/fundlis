/**
 * Respaldo recuperable de la base experimental (INDICACIONES §2, paso 2).
 *   node scripts/db/respaldar-bd.js [etiqueta]
 * Usa BACKUP DATABASE ... WITH COPY_ONLY (no altera la cadena de respaldos)
 * en el directorio de respaldos por defecto de la instancia. Verifica el
 * archivo con RESTORE VERIFYONLY. No imprime datos ni credenciales.
 *
 * Recuperacion (rollback completo):
 *   RESTORE DATABASE LisDona FROM DISK = N'<ruta impresa>' WITH REPLACE;
 */
const { conectar, PERMITIDA } = require('./conexion');

(async () => {
  const etiqueta = (process.argv[2] || 'manual').replace(/[^A-Za-z0-9_-]/g, '');
  const sello = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const pool = await conectar({ baseDatos: 'master', permitirMaster: true });

  const dir = await pool.request().query(
    `SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(4000)) AS ruta`,
  );
  const base = dir.recordset[0].ruta;
  if (!base) throw new Error('La instancia no informa un directorio de respaldos por defecto.');
  const archivo = `${base.replace(/\\$/, '')}\\${PERMITIDA}_${sello}_${etiqueta}.bak`;

  await pool
    .request()
    .input('archivo', archivo)
    .query(`BACKUP DATABASE [${PERMITIDA}] TO DISK = @archivo WITH COPY_ONLY, INIT, CHECKSUM,
            NAME = N'Respaldo experimental LIS Dona'`);
  // BACKUP ... WITH CHECKSUM ya valida las paginas al escribir. VERIFYONLY
  // requiere CREATE DATABASE; si el login de la app no lo tiene, se informa
  // y se deja la evidencia de msdb (restaurar exige un login administrador).
  try {
    await pool.request().input('archivo', archivo).query(`RESTORE VERIFYONLY FROM DISK = @archivo WITH CHECKSUM`);
    console.log(`Respaldo verificado con RESTORE VERIFYONLY: ${archivo}`);
  } catch (e) {
    const detalle = (e.precedingErrors || []).map((z) => z.message).join(' ');
    if (!/permission denied/i.test(detalle)) throw e;
    const r = await pool
      .request()
      .input('archivo', archivo)
      .query(`SELECT TOP 1 b.has_backup_checksums AS checksum, CAST(b.backup_size/1048576.0 AS DECIMAL(10,2)) AS mb
              FROM msdb.dbo.backupset b JOIN msdb.dbo.backupmediafamily m ON m.media_set_id = b.media_set_id
              WHERE m.physical_device_name = @archivo ORDER BY b.backup_finish_date DESC`);
    const fila = r.recordset[0];
    if (!fila) throw new Error('El respaldo no quedo registrado en msdb.');
    console.log(`Respaldo escrito con CHECKSUM (${fila.mb} MB) y registrado en msdb: ${archivo}`);
    console.log('AVISO: el login de la app no puede ejecutar VERIFYONLY/RESTORE; restaurar requiere un login administrador.');
  }
  console.log(`Restaurar con: RESTORE DATABASE [${PERMITIDA}] FROM DISK = N'${archivo}' WITH REPLACE;`);
  await pool.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
