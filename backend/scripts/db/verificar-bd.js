/**
 * Verificacion de SOLO LECTURA de la BD PostgreSQL / Supabase.
 *   node scripts/db/verificar-bd.js
 * Muestra version, migraciones, tablas con su numero de filas y RLS, y
 * comprueba los controles de seguridad de 003_seguridad.sql. No imprime
 * credenciales ni contenido de filas. Sale con codigo 1 si un control falla.
 */
const { conectar, destinoLegible } = require('./conexion');

(async () => {
  console.log(`Destino: ${destinoLegible()}`);
  const db = await conectar();
  const fallas = [];
  const control = (nombre, ok, detalle = '') => {
    console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? ` (${detalle})` : ''}`);
    if (!ok) fallas.push(nombre);
  };
  try {
    const v = await db.query('SELECT version() AS v');
    console.log(v.rows[0].v.split(',')[0]);

    const mig = await db.query(`SELECT version, nombre FROM lis.esquema_version ORDER BY version`).catch(() => ({ rows: [] }));
    console.log('Migraciones:', mig.rows.map((r) => r.nombre).join(', ') || '(ninguna)');

    const tablas = await db.query(`
      SELECT c.relname AS tabla, c.relrowsecurity AS rls,
             (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'lis' AND p.tablename = c.relname) AS politicas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'lis' AND c.relkind = 'r' ORDER BY c.relname`);
    const filas = [];
    for (const t of tablas.rows) {
      const r = await db.query(`SELECT count(*)::int AS n FROM lis.${'"' + t.tabla.replace(/"/g, '') + '"'}`);
      filas.push({ tabla: t.tabla, filas: r.rows[0].n, rls: t.rls ? 'si' : 'NO', politicas: Number(t.politicas) });
    }
    console.table(filas);

    console.log('Controles de seguridad:');
    const negocio = filas.filter((f) => f.tabla !== 'esquema_version');
    control('22 tablas de negocio', negocio.length === 22, `${negocio.length}`);
    control('RLS activo en todas las tablas', filas.every((f) => f.rls === 'si'));
    control('Cada tabla de negocio tiene su politica para lis_app', negocio.every((f) => f.politicas >= 1));

    const publicos = await db.query(`
      SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'lis' AND grantee IN ('anon', 'authenticated', 'PUBLIC')`);
    control('anon/authenticated sin permisos sobre lis', publicos.rowCount === 0, publicos.rowCount ? `${publicos.rowCount} permisos` : '');

    const esquemaPublico = await db.query(`
      SELECT r.rolname FROM pg_roles r
      WHERE r.rolname IN ('anon', 'authenticated') AND has_schema_privilege(r.rolname, 'lis', 'USAGE')`);
    control('anon/authenticated no pueden usar el esquema lis', esquemaPublico.rowCount === 0);

    const app = await db.query(`SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'lis_app'`);
    const a = app.rows[0];
    control('Existe lis_app', !!a);
    if (a) {
      control('lis_app sin superusuario, sin BYPASSRLS, sin crear roles ni BD', !a.rolsuper && !a.rolbypassrls && !a.rolcreaterole && !a.rolcreatedb);
      control('lis_app puede iniciar sesion', a.rolcanlogin, a.rolcanlogin ? '' : 'ejecuta node scripts/db/usuario-app.js');
      const h = await db.query(`
        SELECT has_table_privilege('lis_app', 'lis.historial_estado', 'INSERT') AS ins,
               has_table_privilege('lis_app', 'lis.historial_estado', 'UPDATE') AS upd,
               has_table_privilege('lis_app', 'lis.historial_estado', 'DELETE') AS del,
               has_schema_privilege('lis_app', 'lis', 'CREATE') AS ddl`);
      const p = h.rows[0];
      control('lis_app solo agrega al historial (sin UPDATE ni DELETE)', p.ins && !p.upd && !p.del);
      control('lis_app sin DDL en el esquema lis', !p.ddl);
    }

    const trig = await db.query(`
      SELECT tgname FROM pg_trigger WHERE tgrelid = 'lis.historial_estado'::regclass AND NOT tgisinternal`);
    const nombres = trig.rows.map((r) => r.tgname);
    control('Historial inmutable (triggers de UPDATE/DELETE y TRUNCATE)',
      nombres.includes('tr_historial_inmutable') && nombres.includes('tr_historial_sin_truncate'));

    const ux = await db.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'lis'
        AND indexname IN ('ux_oxp_vigente_por_peticion', 'ux_lote_titular_oxp', 'ux_lote_titular_local', 'ux_tarea_clave', 'ux_notif_usuario_clave')`);
    control('Indices unicos de las invariantes (asignacion vigente, titular de lote, tareas y avisos)', ux.rowCount === 5, `${ux.rowCount}/5`);

    console.log('\nRecuerda revisar en el panel de Supabase (API -> Settings) que "lis" NO este en "Exposed schemas".');
  } finally {
    await db.end();
  }
  if (fallas.length) {
    console.error(`\n${fallas.length} control(es) fallaron.`);
    process.exit(1);
  }
  console.log('\nTodos los controles pasaron.');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
