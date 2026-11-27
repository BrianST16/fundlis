/* Prueba de humo (D-68): HTTP -> API -> PostgreSQL/Supabase de DESARROLLO, con cuentas demo.
   Uso: node scripts/db/demo.js; PORT=3100 node dist/main.js; node scripts/e2e/humo-postgres.js [url-api]
   Firma JWT locales con JWT_SECRET (no se imprime). Escribe solo sobre datos demo: recarga la demo despues. */
const path = require('path');
const fs = require('fs');
const raiz = path.join(__dirname, '..', '..', '..');

require(path.join(raiz, 'backend/node_modules/dotenv')).config({ quiet: true });
const jwt = require(path.join(raiz, 'backend/node_modules/jsonwebtoken'));
const { conectar } = require(path.join(raiz, 'backend/scripts/db/conexion'));
const API = process.argv[2] || 'http://localhost:3100/api';
let fallas = 0;
const ok = (n, c, d = '') => { if (!c) fallas++; console.log(`${c ? 'PASA ' : 'FALLA'} ${n}${d ? ` -> ${d}` : ''}`); };

(async () => {
  const db = await conectar();
  const uno = async (s, p = []) => (await db.query(s, p)).rows[0];
  const usr = async (sub) => {
    const u = await uno(`SELECT u.id, u.email, u.nombre, u.perfil, string_agg(r.rol, ',') roles FROM lis.usuario u
                         LEFT JOIN lis.usuario_rol r ON r.usuario_id = u.id WHERE google_sub = $1 GROUP BY u.id`, [sub]);
    return jwt.sign({ sub: u.id, email: u.email, nombre: u.nombre, perfil: u.perfil, roles: u.roles ? u.roles.split(',') : [] },
      process.env.JWT_SECRET, { expiresIn: '10m' });
  };
  const of = async (nombre) => (await uno(`SELECT id, foto_id FROM lis.oferta WHERE nombre_producto = $1`, [nombre]));
  const T = { aux: await usr('demo-aux1'), admin: await usr('demo-admin'), est: await usr('demo-est1'), bloq: await usr('demo-bloq'), donR: await usr('demo-donR') };
  const pedir = async (ruta, token, opt = {}) => {
    const r = await fetch(API + ruta, { ...opt, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    const tipo = r.headers.get('content-type') || '';
    return { st: r.status, tipo, body: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };

  // Publico
  let r = await pedir('/categorias');
  ok('Categorías públicas (7, con tildes)', r.st === 200 && r.body.length === 7 && r.body.some((c) => c.nombre === 'Tecnología'));
  r = await pedir('/ofertas/catalogo');
  const cat = Array.isArray(r.body) ? r.body : r.body.items ?? r.body.datos ?? [];
  ok('Catálogo de ofertas anónimo', r.st === 200 && cat.length > 0 && !JSON.stringify(cat).includes('@demo.lisdona.test'), `${cat.length} ofertas`);
  const chaqueta = await of('Chaqueta impermeable [DEMO]');
  r = await pedir(`/evidencias/${chaqueta.foto_id}`);
  ok('Foto de oferta aprobada servida desde bytea', r.st === 200 && r.tipo === 'image/jpeg' && r.body[0] === 0xff && r.body[1] === 0xd8, `${r.body.length} bytes`);
  const recep = await uno(`SELECT evidencia_id FROM lis.movimiento WHERE tipo = 'RECEPCION' LIMIT 1`);
  r = await pedir(`/evidencias/${recep.evidencia_id}`);
  ok('Foto de movimiento NO es pública', r.st === 401 || r.st === 403 || r.st === 404, `HTTP ${r.st}`);

  // Personal LIS
  r = await pedir('/ofertas/pendientes', T.aux);
  ok('Aprobaciones: ofertas pendientes', r.st === 200 && r.body.length >= 4, `${r.body.length}`);
  r = await pedir(`/emparejamiento/oferta/${chaqueta.id}`, T.aux);
  const dg = r.body.diagnostico || {};
  ok('KD-tree: chaqueta con 2 compatibles y verificado contra el lineal', r.st === 200 && dg.compatibles === 2 && dg.coincideConFiltroLineal === true,
    `compatibles ${dg.compatibles}, excluidas ${dg.incompatibles}, nodos ${dg.nodosVisitados}`);
  ok('Local al final de la lista', r.body.destinoLocal?.tipo === 'LOCAL');
  r = await pedir('/tareas/revisar', T.aux, { method: 'POST' });
  const creadas1 = r.body?.tareasCreadas;
  ok('Revisar plazos crea tareas DEFINIR_ESTADO', (r.st === 200 || r.st === 201) && creadas1 > 0, `${creadas1} tareas`);
  r = await pedir('/tareas/revisar', T.aux, { method: 'POST' });
  ok('Segunda revisión no duplica (idempotencia por índice único)', (r.st === 200 || r.st === 201) && r.body?.tareasCreadas === 0, `${r.body?.tareasCreadas} nuevas`);
  r = await pedir('/tareas', T.aux);
  ok('Lista de tareas', r.st === 200 && r.body.length >= creadas1, `${r.body.length}`);
  for (const ruta of ['/analitica/indicadores', '/analitica/ranking/estudiantes', '/analitica/ranking/donadores', '/analitica/alertas', '/local', '/local/lotes', '/asignaciones', '/plazos/resumen']) {
    r = await pedir(ruta, T.aux);
    ok(`GET ${ruta}`, r.st === 200);
  }

  // Flujo de escritura: recepcion con foto (silla, ASIGNADO en plazo) y entrega con foto (kit de aseo)
  const foto = fs.readFileSync(path.join(raiz, 'db/postgres/demo/imagenes/oa4.jpg')).toString('base64');
  const silla = await uno(`SELECT x.id FROM lis.oferta_x_peticion x JOIN lis.oferta o ON o.id = x.oferta_id WHERE o.nombre_producto = 'Silla ergonómica [DEMO]' AND x.estado = 'ASIGNADO'`);
  if (silla) {
    r = await pedir(`/asignaciones/${silla.id}/recepcion`, T.aux, { method: 'POST', body: JSON.stringify({
      cantidad: 1, nombreContraparte: 'Mariana Nueva', foto: { mime: 'image/jpeg', contenidoBase64: foto, nombreOriginal: 'recepcion-silla.jpg' } }) });
    ok('Registrar recepción con foto (lote + movimiento + historial)', r.st === 200 || r.st === 201, `HTTP ${r.st} ${r.st >= 400 ? JSON.stringify(r.body).slice(0, 120) : ''}`);
  } else ok('Recepción (la silla ya no estaba ASIGNADO; recarga la demo)', false);
  const aseo = await uno(`SELECT x.id FROM lis.oferta_x_peticion x JOIN lis.oferta o ON o.id = x.oferta_id WHERE o.nombre_producto = 'Kit de aseo personal [DEMO]' AND x.estado = 'EN_CUSTODIA'`);
  if (aseo) {
    r = await pedir(`/asignaciones/${aseo.id}/entrega`, T.aux, { method: 'POST', body: JSON.stringify({
      cantidad: 2, nombreContraparte: 'Valentina Ríos', foto: { mime: 'image/jpeg', contenidoBase64: foto, nombreOriginal: 'entrega-aseo.jpg' } }) });
    ok('Registrar entrega con foto', r.st === 200 || r.st === 201, `HTTP ${r.st} ${r.st >= 400 ? JSON.stringify(r.body).slice(0, 120) : ''}`);
    r = await pedir('/notificaciones', T.donR);
    const avisos = Array.isArray(r.body) ? r.body : r.body.items ?? [];
    ok('El donador recibe el aviso de entrega con la foto (D-51)', avisos.some((n) => n.entidadId === aseo.id && n.evidenciaId));
  } else ok('Entrega (el kit ya no estaba EN_CUSTODIA; recarga la demo)', false);
  r = await pedir('/asignaciones', T.aux, { method: 'POST', body: JSON.stringify({ ofertaId: chaqueta.id, peticionId: (await uno(`SELECT id FROM lis.peticion WHERE descripcion LIKE 'Necesito un portátil%'`)).id, cantidad: 1 }) });
  ok('Asignar a una petición que ya tiene asignación vigente se rechaza', r.st === 400 || r.st === 409, `HTTP ${r.st}`);

  // Administrador
  r = await pedir('/usuarios?buscar=VALENTINA', T.admin);
  ok('Búsqueda de usuarios sin distinguir mayúsculas (ILIKE)', r.st === 200 && r.body.length === 1, `${r.body.length}`);
  r = await pedir('/usuarios?buscar=%25', T.admin);
  ok('El comodín % se busca literal (no lista a todos)', r.st === 200 && r.body.length === 0, `${r.body.length}`);
  const oh1 = await of('Cuadernos x10 [DEMO]');
  r = await pedir(`/trazabilidad/oferta/${oh1.id}`, T.admin);
  ok('Trazabilidad de una donación', r.st === 200);

  // Estudiante y cuenta bloqueada
  r = await pedir('/peticiones/mias', T.est);
  ok('Estudiante ve sus peticiones', r.st === 200 && r.body.length > 0, `${r.body.length}`);
  r = await pedir('/emparejamiento/oferta/1', T.est);
  ok('Estudiante no accede a emparejamiento', r.st === 403);
  r = await pedir('/notificaciones', T.bloq);
  ok('Cuenta bloqueada rechazada', r.st === 403 || r.st === 401, `HTTP ${r.st}`);

  await db.end();
  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodas las verificaciones pasaron.');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
