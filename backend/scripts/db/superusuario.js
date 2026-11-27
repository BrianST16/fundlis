/**
 * Asignar o quitar el rol SUPERUSUARIO - SOLO MANTENIMIENTO (D-45).
 *   node scripts/db/superusuario.js asignar correo@dominio
 *   node scripts/db/superusuario.js quitar  correo@dominio
 *
 * - El rol nunca se otorga desde la interfaz ni la API: solo con este script,
 *   que usa el usuario ADMINISTRADOR de la BD.
 * - La persona debe haber iniciado sesion con Google al menos una vez.
 * - Queda constancia en el historial (actor NULL = mantenimiento).
 */
const { conectar, destinoLegible } = require('./conexion');

(async () => {
  const [accion, correo] = process.argv.slice(2);
  if (!['asignar', 'quitar'].includes(accion) || !correo) {
    throw new Error('Uso: node scripts/db/superusuario.js asignar|quitar correo@dominio');
  }
  console.log(`Destino: ${destinoLegible()}`);
  const db = await conectar();
  try {
    await db.query('BEGIN');
    const u = await db.query(`SELECT id FROM lis.usuario WHERE email = $1`, [correo.toLowerCase().trim()]);
    if (!u.rowCount) throw new Error('Ese correo no existe: debe iniciar sesión al menos una vez.');
    const id = u.rows[0].id;
    const tiene = (await db.query(`SELECT 1 FROM lis.usuario_rol WHERE usuario_id = $1 AND rol = 'SUPERUSUARIO'`, [id])).rowCount > 0;
    if (accion === 'asignar') {
      if (tiene) console.log('Ya es SUPERUSUARIO. No se hizo nada.');
      else {
        await db.query(`INSERT INTO lis.usuario_rol (usuario_id, rol, asignado_por) VALUES ($1, 'SUPERUSUARIO', NULL)`, [id]);
        await db.query(`INSERT INTO lis.historial_estado (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo)
                        VALUES ('USUARIO', $1, NULL, 'ROL_SUPERUSUARIO', NULL, 'Asignado manualmente por script de mantenimiento')`, [id]);
        console.log('Rol SUPERUSUARIO asignado. Se refleja en la próxima petición de esa cuenta.');
      }
    } else if (!tiene) console.log('No es SUPERUSUARIO. No se hizo nada.');
    else {
      await db.query(`DELETE FROM lis.usuario_rol WHERE usuario_id = $1 AND rol = 'SUPERUSUARIO'`, [id]);
      await db.query(`INSERT INTO lis.historial_estado (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo)
                      VALUES ('USUARIO', $1, 'ROL_SUPERUSUARIO', 'SIN_ROL_SUPERUSUARIO', NULL, 'Retirado manualmente por script de mantenimiento')`, [id]);
      console.log('Rol SUPERUSUARIO retirado.');
    }
    await db.query('COMMIT');
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
