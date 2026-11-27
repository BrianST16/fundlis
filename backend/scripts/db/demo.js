/**
 * DATOS DE DEMOSTRACION (FICTICIOS) con imagenes, para PostgreSQL / Supabase.
 * Port de db/sqlserver/03_demo_presentacion.sql (mismo escenario).
 *
 *   node scripts/db/demo.js            borra SOLO lo demo y lo vuelve a sembrar
 *   node scripts/db/demo.js --borrar   solo borra lo demo
 *
 * - Repetible y en UNA transaccion: si algo falla, no queda nada a medias.
 * - Solo toca cuentas 'demo-%' y filas marcadas [DEMO]; no toca datos reales.
 * - Las cuentas demo no pueden iniciar sesion con Google (google_sub 'demo-...',
 *   dominios ficticios) y nunca reciben correo (dominios excluidos).
 * - Imagenes: db/postgres/demo/imagenes (generar_imagenes.py). Cualquier .jpg
 *   se puede cambiar por una foto real con el mismo nombre (maximo 2 MB).
 * - Opcional, casos sobre TUS cuentas (deben haber iniciado sesion una vez):
 *     DEMO_EMAIL_DONADOR=tu.cuenta@gmail.com      (perfil DONADOR)
 *     DEMO_EMAIL_ESTUDIANTE=tu.nombre@udea.edu.co (perfil ESTUDIANTE)
 * - Se ejecuta como ADMINISTRADOR (dueno de las tablas). Para borrar sus
 *   propias filas del historial marca la transaccion con lis.mantenimiento_demo.
 *
 * Despues: en "Entregas y plazos" pulsa "Revisar ahora" para crear las tareas
 * DEFINIR_ESTADO de los casos vencidos.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { conectar, destinoLegible } = require('./conexion');

const DIR_IMG = path.join(__dirname, '..', '..', '..', 'db', 'postgres', 'demo', 'imagenes');
const DIA = 86_400_000;
const AHORA = new Date();
const hace = (d) => new Date(AHORA.getTime() - d * DIA);
const fechaCivil = (d) => new Date(AHORA.getTime() + d * DIA).toISOString().slice(0, 10);
const COEF = 'kC=0.5000;kS=0.3000;kA=0.2000;H=90';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const MAX_BYTES = 2 * 1024 * 1024;

/* ------------------------------------------------------------------ */
function archivo(nombre) {
  const ruta = path.join(DIR_IMG, nombre);
  const contenido = fs.readFileSync(ruta);
  const mime = MIME[path.extname(nombre).toLowerCase()];
  if (!mime) throw new Error(`Tipo de archivo no admitido: ${nombre}`);
  if (contenido.length > MAX_BYTES) throw new Error(`${nombre} supera 2 MB.`);
  return { contenido, mime, nombre, tamano: contenido.length, hash: crypto.createHash('sha256').update(contenido).digest('hex') };
}

async function ins(db, tabla, fila, retorno = 'id') {
  const cols = Object.keys(fila);
  const sql = `INSERT INTO lis.${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})${retorno ? ` RETURNING ${retorno}` : ''}`;
  const r = await db.query(sql, Object.values(fila));
  return retorno ? r.rows[0][retorno] : null;
}

async function evidencia(db, f, subidaPor, subidaEn) {
  return ins(db, 'evidencia', {
    contenido: f.contenido, mime: f.mime, tamano_bytes: f.tamano, hash_sha256: f.hash,
    nombre_original: f.nombre, subida_por: subidaPor, subida_en: subidaEn,
  });
}

/* ------------------------------------------------------------------ */
async function borrar(db) {
  const ids = async (sql, p = []) => (await db.query(sql, p)).rows.map((r) => r.id);
  const u = await ids(`SELECT id FROM lis.usuario WHERE google_sub LIKE 'demo-%'`);
  let o = await ids(`SELECT id FROM lis.oferta WHERE donador_id = ANY($1) OR nombre_producto LIKE '%[DEMO]%'`, [u]);
  o = [...new Set([...o, ...(await ids(`SELECT id FROM lis.oferta WHERE oferta_origen_id = ANY($1)`, [o]))])];
  const p = await ids(`SELECT id FROM lis.peticion WHERE estudiante_id = ANY($1) OR descripcion LIKE '%[DEMO]%'`, [u]);
  const x = await ids(`SELECT id FROM lis.oferta_x_peticion WHERE oferta_id = ANY($1) OR peticion_id = ANY($2)`, [o, p]);
  const l = await ids(`SELECT id FROM lis.lote_fisico WHERE oferta_id = ANY($1)`, [o]);
  const d = await ids(`SELECT id FROM lis.destino_local WHERE oferta_id = ANY($1)`, [o]);
  const m = (await db.query(
    `SELECT id, evidencia_id FROM lis.movimiento WHERE oferta_x_peticion_id = ANY($1) OR destino_local_id = ANY($2) OR lote_id = ANY($3)`,
    [x, d, l])).rows;
  const n = (await db.query(
    `SELECT id, evidencia_id FROM lis.notificacion
      WHERE usuario_id = ANY($1) OR clave LIKE 'DEMO:%'
         OR (entidad = 'ASIGNACION' AND entidad_id = ANY($2)) OR (entidad = 'LOCAL' AND entidad_id = ANY($3))
         OR (entidad = 'LOTE' AND entidad_id = ANY($4))       OR (entidad = 'OFERTA' AND entidad_id = ANY($5))
         OR (entidad = 'PETICION' AND entidad_id = ANY($6))`, [u, x, d, l, o, p])).rows;
  const e = new Set([...m.map((r) => r.evidencia_id), ...n.map((r) => r.evidencia_id).filter(Boolean)]);
  for (const id of await ids(`SELECT foto_id AS id FROM lis.oferta WHERE id = ANY($1) AND foto_id IS NOT NULL`, [o])) e.add(id);
  for (const id of await ids(`SELECT id FROM lis.evidencia WHERE subida_por = ANY($1)`, [u])) e.add(id);
  const mIds = m.map((r) => r.id);
  const nIds = n.map((r) => r.id);

  const q = (sql, prm) => db.query(sql, prm);
  // Romper referencias cruzadas lote <-> movimiento <-> intento.
  await q(`UPDATE lis.movimiento SET lote_id = NULL WHERE id = ANY($1)`, [mIds]);
  await q(`UPDATE lis.lote_fisico SET recepcion_movimiento_id = NULL, intento_origen_id = NULL WHERE id = ANY($1)`, [l]);
  await q(`UPDATE lis.oferta SET foto_id = NULL WHERE id = ANY($1)`, [o]);
  await q(`DELETE FROM lis.tarea WHERE asignacion_id = ANY($1) OR lote_id = ANY($2) OR destino_local_id = ANY($3) OR resuelta_por = ANY($4)`, [x, l, d, u]);
  await q(`DELETE FROM lis.correo_salida WHERE notificacion_id = ANY($1)`, [nIds]);
  await q(`DELETE FROM lis.notificacion WHERE id = ANY($1)`, [nIds]);
  await q(`DELETE FROM lis.movimiento WHERE id = ANY($1)`, [mIds]);
  await q(`DELETE FROM lis.oferta_x_peticion WHERE id = ANY($1)`, [x]);
  await q(`DELETE FROM lis.destino_local WHERE id = ANY($1)`, [d]);
  await q(`DELETE FROM lis.lote_fisico WHERE id = ANY($1)`, [l]);
  // Historial inmutable: el script demo se identifica para borrar SOLO sus filas.
  await q(`SET LOCAL lis.mantenimiento_demo = '1'`);
  await q(`DELETE FROM lis.historial_estado
            WHERE actor_id = ANY($1)
               OR (entidad = 'OFERTA' AND entidad_id = ANY($2))     OR (entidad = 'PETICION' AND entidad_id = ANY($3))
               OR (entidad = 'ASIGNACION' AND entidad_id = ANY($4)) OR (entidad = 'LOTE' AND entidad_id = ANY($5))
               OR (entidad = 'LOCAL' AND entidad_id = ANY($6))      OR (entidad = 'USUARIO' AND entidad_id = ANY($1))`, [u, o, p, x, l, d]);
  await q(`SET LOCAL lis.mantenimiento_demo = '0'`);
  await q(`DELETE FROM lis.oferta WHERE id = ANY($1) AND oferta_origen_id IS NOT NULL`, [o]);
  await q(`DELETE FROM lis.oferta WHERE id = ANY($1)`, [o]);
  await q(`DELETE FROM lis.peticion WHERE id = ANY($1)`, [p]);
  await q(`DELETE FROM lis.certificado_estudio WHERE usuario_id = ANY($1)`, [u]);
  await q(`UPDATE lis.certificado_estudio SET estado_revision = 'PENDIENTE', revisado_por = NULL, revisado_en = NULL WHERE revisado_por = ANY($1)`, [u]);
  await q(`DELETE FROM lis.evidencia WHERE id = ANY($1)`, [[...e]]);
  await q(`DELETE FROM lis.caracterizacion WHERE usuario_id = ANY($1)`, [u]); // respuestas: ON DELETE CASCADE
  await q(`UPDATE lis.usuario_rol SET asignado_por = NULL WHERE asignado_por = ANY($1) AND NOT (usuario_id = ANY($1))`, [u]);
  await q(`DELETE FROM lis.usuario_rol WHERE usuario_id = ANY($1)`, [u]);
  await q(`DELETE FROM lis.usuario WHERE id = ANY($1)`, [u]);
}

/* ------------------------------------------------------------------ */
async function sembrar(db) {
  const img = JSON.parse(fs.readFileSync(path.join(DIR_IMG, 'imagenes.json'), 'utf8'));
  const foto = (tipo, clave) => archivo(img[tipo][clave]);

  // 1. Usuarios ficticios
  const U = {};
  const usuarios = [
    ['SUPER', 'demo-super', 'superusuario@demo.lisdona.test', 'Sofía Superusuaria (demo)', 'DONADOR', 120, 1],
    ['ADMIN', 'demo-admin', 'administrador@demo.lisdona.test', 'Andrés Administrador (demo)', 'DONADOR', 110, 0],
    ['AUX1', 'demo-aux1', 'auxiliar@demo.lisdona.test', 'Laura Auxiliar (demo)', 'DONADOR', 100, 0],
    ['AUX2', 'demo-aux2', 'auxiliar2@demo.lisdona.test', 'Camilo Auxiliar y donador (demo)', 'DONADOR', 95, 2],
    ['DONR', 'demo-donR', 'fundacion@demo.lisdona.test', 'Fundación Amigos UdeA (demo)', 'DONADOR', 90, 1],
    ['DONN', 'demo-donN', 'mariana@demo.lisdona.test', 'Mariana Nueva (demo)', 'DONADOR', 30, 1],
    ['DONF', 'demo-donF', 'jorge@demo.lisdona.test', 'Jorge Incumplido (demo)', 'DONADOR', 80, 5],
    ['DONL', 'demo-donL', 'empresa@demo.lisdona.test', 'Tecnología Solidaria SAS (demo)', 'DONADOR', 70, 3],
    ['BLOQ', 'demo-bloq', 'bloqueado@demo.lisdona.test', 'Cuenta Bloqueada (demo)', 'DONADOR', 60, 40],
    ['E1', 'demo-est1', 'valentina@demo.udea.edu.co', 'Valentina Ríos (demo)', 'ESTUDIANTE', 100, 1],
    ['E2', 'demo-est2', 'santiago@demo.udea.edu.co', 'Santiago Gómez (demo)', 'ESTUDIANTE', 100, 2],
    ['E3', 'demo-est3', 'daniela@demo.udea.edu.co', 'Daniela Mejía (demo)', 'ESTUDIANTE', 95, 3],
    ['E4', 'demo-est4', 'mateo@demo.udea.edu.co', 'Mateo Álvarez (demo)', 'ESTUDIANTE', 90, 1],
    ['E5', 'demo-est5', 'isabella@demo.udea.edu.co', 'Isabella Torres (demo)', 'ESTUDIANTE', 85, 4],
    ['E6', 'demo-est6', 'rperez.docente@demo.udea.edu.co', 'Prof. Ricardo Pérez - docente (demo)', 'ESTUDIANTE', 20, 2],
  ];
  for (const [k, sub, email, nombre, perfil, creado, ingreso] of usuarios) {
    const bloqueado = k === 'BLOQ';
    U[k] = await ins(db, 'usuario', {
      google_sub: sub, email, nombre, perfil, activo: !bloqueado,
      motivo_bloqueo: bloqueado ? 'Publicó ofertas falsas de forma reiterada (caso de demostración).' : null,
      creado_en: hace(creado), ultimo_ingreso_en: ingreso === 0 ? AHORA : hace(ingreso),
    });
  }
  for (const [usr, rol, por, dias] of [['SUPER', 'SUPERUSUARIO', null, 120], ['ADMIN', 'ADMINISTRADOR', 'SUPER', 110],
    ['AUX1', 'AUXILIAR_LIS', 'ADMIN', 100], ['AUX2', 'AUXILIAR_LIS', 'ADMIN', 95]]) {
    await ins(db, 'usuario_rol', { usuario_id: U[usr], rol, asignado_por: por ? U[por] : null, asignado_en: hace(dias) }, null);
  }

  // Cuentas reales opcionales
  const real = async (email, perfil) => {
    if (!email) return null;
    const r = await db.query(`SELECT id FROM lis.usuario WHERE email = $1 AND perfil = $2 AND activo`, [email.toLowerCase().trim(), perfil]);
    if (!r.rowCount) console.warn(`AVISO: ${perfil.toLowerCase()} real no existe, no tiene ese perfil o está bloqueado. Se omiten sus casos.`);
    return r.rows[0]?.id ?? null;
  };
  const DR = await real(process.env.DEMO_EMAIL_DONADOR, 'DONADOR');
  const ER = await real(process.env.DEMO_EMAIL_ESTUDIANTE, 'ESTUDIANTE');

  // 2. Caracterizacion y certificados (pregunta y opcion por su orden)
  const respuestas = {
    E1: ['A2', [4, 4, 3, 4, 2]], E2: ['B3', [3, 3, 2, 3, 1]], E3: ['C5', [2, 2, 2, 2, 1]],
    E4: ['A1', [4, 4, 3, 4, 3]], E5: ['C12', [2, 1, 1, 2, 1]], E6: ['D4', [1, 1, 1, 1, 1]],
  };
  const opciones = (await db.query(`
    SELECT p.id AS pregunta, p.orden AS po, p.peso, o.id AS opcion, o.orden AS oo, o.puntaje
    FROM lis.pregunta_caracterizacion p JOIN lis.opcion_caracterizacion o ON o.pregunta_id = p.id WHERE p.activa`)).rows;
  for (const [k, [sisben, elegidas]] of Object.entries(respuestas)) {
    const sel = elegidas.map((oo, i) => opciones.find((x) => x.po === i + 1 && x.oo === oo));
    const total = sel.reduce((s, x) => s + Number(x.puntaje) * Number(x.peso), 0) / sel.reduce((s, x) => s + Number(x.peso), 0);
    const c = await ins(db, 'caracterizacion', { usuario_id: U[k], grupo_sisben: sisben, puntaje_total: total.toFixed(5), completada_en: hace(80) });
    for (const x of sel) await ins(db, 'respuesta_caracterizacion', { caracterizacion_id: c, pregunta_id: x.pregunta, opcion_id: x.opcion }, null);
  }
  const cert = archivo(img.certificado);
  for (const [k, nombre, subido, estado, revisado, obs] of [
    ['E1', 'certificado-valentina.pdf', 60, 'VALIDADO', 59, null],
    ['E2', 'certificado-santiago.pdf', 1, 'PENDIENTE', null, null],
    ['E6', 'constancia-laboral.pdf', 10, 'RECHAZADO', 9, 'El documento es una constancia laboral de docente, no un certificado de estudio vigente.'],
  ]) {
    await ins(db, 'certificado_estudio', {
      usuario_id: U[k], contenido: cert.contenido, mime: cert.mime, tamano_bytes: cert.tamano, hash_sha256: cert.hash,
      nombre_original: nombre, subido_en: hace(subido), estado_revision: estado,
      revisado_por: revisado ? U.ADMIN : null, revisado_en: revisado ? hace(revisado) : null, observacion: obs,
    }, null);
  }

  // 3. Ofertas
  const cat = {};
  for (const r of (await db.query(`SELECT id, nombre FROM lis.categoria`)).rows) cat[r.nombre] = r.id;
  const C = {
    UTIL: cat['Útiles escolares'], TEC: cat['Tecnología'], LIB: cat['Libros y textos'], ROPA: cat['Ropa y calzado'],
    ASEO: cat['Implementos de aseo'], MOB: cat['Mobiliario pequeño'], LAB: cat['Material de laboratorio'],
  };
  if (Object.values(C).some((v) => !v)) throw new Error('Faltan categorías de los datos base (migración 002).');

  const O = {};
  const ofertas = [
    // clave, donador, cat, nombre, descripcion, cant, estado, conservacion, medida, dias, revisor, motivoRechazo, cerradaDias
    ['OP1', 'DONR', 'UTIL', 'Morral escolar [DEMO]', 'Morral escolar resistente, dos compartimentos.', 2, 'PENDIENTE_APROBACION', 4, null, 1],
    ['OP2', 'DONN', 'LIB', 'Diccionario inglés-español [DEMO]', 'Diccionario de bolsillo en buen estado.', 1, 'PENDIENTE_APROBACION', 4, null, 1],
    ['OP3', 'AUX2', 'MOB', 'Lámpara de escritorio [DEMO]', 'Lámpara LED de escritorio. Publicada por un auxiliar.', 1, 'PENDIENTE_APROBACION', 5, null, 2],
    ['OP4', 'DONF', 'TEC', 'Mouse inalámbrico [DEMO]', 'Mouse inalámbrico con pilas.', 1, 'PENDIENTE_APROBACION', 3, null, 1],
    ['OR1', 'DONN', 'ROPA', 'Gorra deportiva [DEMO]', 'Gorra con el logo roto.', 1, 'RECHAZADA', 1, 4, 15, 'AUX1', 'La foto no permite verificar el estado y el producto tiene daño visible.'],
    ['OC1', 'DONF', 'UTIL', 'Set de marcadores [DEMO]', 'Marcadores de colores.', 1, 'CANCELADA', 4, null, 18, null, null, 16],
    ['OA1', 'DONR', 'ROPA', 'Chaqueta impermeable [DEMO]', 'Chaqueta impermeable talla M, uso de un semestre.', 3, 'APROBADA', 4, 3, 12, 'AUX1'],
    ['OA2', 'DONN', 'UTIL', 'Calculadora científica [DEMO]', 'Calculadoras científicas nuevas en su empaque.', 5, 'APROBADA', 5, null, 30, 'AUX1'],
    ['OA3', 'DONL', 'TEC', 'Portátil 8 GB [DEMO]', 'Portátil de 8 GB de RAM, batería con buena duración.', 1, 'APROBADA', 3, null, 25, 'AUX1'],
    ['OA4', 'DONN', 'MOB', 'Silla ergonómica [DEMO]', 'Silla de estudio con espaldar ajustable.', 1, 'APROBADA', 4, null, 6, 'AUX2'],
    ['OA5', 'DONR', 'ASEO', 'Kit de aseo personal [DEMO]', 'Kits con jabón, crema dental y cepillo.', 4, 'APROBADA', 5, null, 10, 'AUX1'],
    ['OH1', 'DONR', 'UTIL', 'Cuadernos x10 [DEMO]', 'Paquete de 10 cuadernos cuadriculados.', 1, 'CERRADA', 5, null, 60, 'AUX1', null, 40],
    ['OH2', 'DONR', 'LIB', 'Libro de Cálculo I [DEMO]', 'Libro de cálculo diferencial, edición reciente.', 1, 'APROBADA', 4, null, 50, 'AUX1'],
    ['OH3', 'DONR', 'LAB', 'Bata de laboratorio [DEMO]', 'Bata blanca talla M.', 1, 'APROBADA', 4, null, 45, 'AUX2'],
    ['OS1', 'DONR', 'TEC', 'Tablet 10 pulgadas [DEMO]', 'Tablet con cargador.', 1, 'APROBADA', 4, null, 25, 'AUX1'],
    ['OF1', 'DONF', 'TEC', 'Audífonos con micrófono [DEMO]', 'Audífonos de diadema con micrófono.', 1, 'APROBADA', 3, null, 40, 'AUX1'],
    ['OI1', 'DONF', 'UTIL', 'Resmas de papel carta [DEMO]', 'Resmas de papel de 500 hojas.', 5, 'APROBADA', 5, null, 14, 'AUX1'],
    ['OD1', 'DONL', 'TEC', 'Monitor 19 pulgadas [DEMO]', 'Monitor LCD con cable VGA.', 1, 'APROBADA', 3, null, 28, 'AUX1'],
    ['L1', 'DONL', 'TEC', 'Impresora láser [DEMO]', 'Impresora láser monocromática.', 1, 'APROBADA', 3, null, 9, 'AUX1'],
    ['L2', 'DONL', 'TEC', 'Videoproyector [DEMO]', 'Videoproyector HDMI con control.', 1, 'APROBADA', 4, null, 12, 'AUX1'],
    ['L3', 'DONL', 'MOB', 'Estantería metálica [DEMO]', 'Estantería de 4 niveles.', 1, 'APROBADA', 4, null, 20, 'AUX1'],
    ['L4', 'DONN', 'MOB', 'Pizarra acrílica [DEMO]', 'Pizarra acrílica de 120 x 80 cm.', 1, 'APROBADA', 4, null, 22, 'AUX1'],
    ['L5', 'DONL', 'LAB', 'Microscopio escolar [DEMO]', 'Microscopio óptico escolar.', 1, 'APROBADA', 4, null, 24, 'AUX1'],
    ['L6', 'DONR', 'LAB', 'Osciloscopio digital [DEMO]', 'Osciloscopio digital de dos canales.', 1, 'APROBADA', 4, null, 35, 'AUX1'],
  ];
  const fotoClave = {};
  const crearOferta = async (clave, donador, c, nombre, desc, cant, estado, cons, medida, dias, revisor = null, motivoRechazo = null, cerradaDias = null) => {
    const id = await ins(db, 'oferta', {
      donador_id: donador, categoria_id: c, nombre_producto: nombre, descripcion: desc, cantidad: cant, estado,
      estado_conservacion: cons, medida, creada_en: hace(dias), revisada_por: revisor,
      revisada_en: revisor ? hace(dias - 1) : null, motivo_rechazo: motivoRechazo,
      cerrada_en: cerradaDias ? hace(cerradaDias) : null, origen: 'DONADOR',
    });
    fotoClave[id] = { clave, donador, fecha: hace(dias) };
    return id;
  };
  for (const [k, don, c, nombre, desc, cant, estado, cons, medida, dias, rev, mr, cd] of ofertas) {
    O[k] = await crearOferta(k, U[don], C[c], nombre, desc, cant, estado, cons, medida, dias, rev ? U[rev] : null, mr ?? null, cd ?? null);
  }
  // Oferta generada por la recepcion incompleta (D-18): 3 unidades ya en el LIS.
  O.OI1F = await ins(db, 'oferta', {
    donador_id: U.DONF, categoria_id: C.UTIL, nombre_producto: 'Resmas de papel carta (recibidas) [DEMO]',
    descripcion: 'Resmas de papel de 500 hojas.\n\n[Generada automáticamente por recepción incompleta]', cantidad: 3,
    estado: 'APROBADA', estado_conservacion: 5, creada_en: hace(4), revisada_por: U.AUX1, revisada_en: hace(4),
    origen: 'FALTANTE', oferta_origen_id: O.OI1,
  });

  // 4. Peticiones
  const P = {};
  const peticiones = [
    // clave, est, cat, descripcion, estado, estadoMin, min, max, dias, revisor, motivoRechazo, cerradaDias, motivoCierre
    ['P1', 'E1', 'ROPA', 'Necesito una chaqueta para la temporada de lluvias [DEMO]', 'APROBADA', 3, 2, 4, 60, 'AUX1'],
    ['P2', 'E2', 'ROPA', 'Necesito ropa abrigada para ir a clase [DEMO]', 'APROBADA', 1, null, null, 30, 'AUX1'],
    ['P3', 'E3', 'ROPA', 'Necesito una chaqueta nueva para prácticas [DEMO]', 'APROBADA', 5, null, null, 45, 'AUX1'],
    ['P4', 'E4', 'ROPA', 'Necesito una chaqueta talla grande [DEMO]', 'APROBADA', 1, 5, 7, 10, 'AUX1'],
    ['P5', 'E2', 'UTIL', 'Necesito una calculadora científica para cálculo [DEMO]', 'APROBADA', 1, null, null, 50, 'AUX1'],
    ['P6', 'E3', 'TEC', 'Necesito un portátil para programar [DEMO]', 'APROBADA', 3, null, null, 35, 'AUX1'],
    ['P7', 'E1', 'MOB', 'Necesito una silla para estudiar en casa [DEMO]', 'APROBADA', 1, null, null, 15, 'AUX2'],
    ['P8', 'E1', 'ASEO', 'Necesito implementos de aseo personal [DEMO]', 'APROBADA', 1, null, null, 20, 'AUX1'],
    ['PH1', 'E2', 'UTIL', 'Necesito cuadernos para el semestre [DEMO]', 'CERRADA_ENTREGA', 1, null, null, 70, 'AUX1', null, 40, 'Producto entregado al estudiante'],
    ['PH2', 'E3', 'LIB', 'Necesito el libro de Cálculo I [DEMO]', 'CERRADA_ENTREGA', 1, null, null, 65, 'AUX1', null, 30, 'Producto entregado al estudiante'],
    ['PH3', 'E1', 'LAB', 'Necesito una bata para laboratorio de química [DEMO]', 'CERRADA_ENTREGA', 1, null, null, 55, 'AUX1', null, 25, 'Producto entregado al estudiante'],
    ['PS1', 'E4', 'TEC', 'Necesito una tablet para leer material [DEMO]', 'CERRADA_INCUMPLIMIENTO', 1, null, null, 40, 'AUX1', null, 6, 'El estudiante no recogió el producto: no se presentó en el plazo de 3 días hábiles'],
    ['PD1', 'E5', 'TEC', 'Necesito un monitor para estudiar [DEMO]', 'CERRADA_INCUMPLIMIENTO', 1, null, null, 35, 'AUX1', null, 11, 'El estudiante no recogió el producto: se devuelve al donador'],
    ['PF1', 'E2', 'TEC', 'Necesito audífonos para clases virtuales [DEMO]', 'APROBADA', 1, null, null, 45, 'AUX1'],
    ['PF2', 'E3', 'TEC', 'Necesito audífonos con micrófono [DEMO]', 'APROBADA', 1, null, null, 32, 'AUX1'],
    ['PI1', 'E4', 'UTIL', 'Necesito papel para imprimir trabajos [DEMO]', 'APROBADA', 1, null, null, 16, 'AUX1'],
    ['PM1', 'E4', 'TEC', 'Necesito un mouse para el computador de la casa [DEMO]', 'APROBADA', 1, null, null, 12, 'AUX1'],
    ['PM2', 'E4', 'LIB', 'Necesito libros de programación [DEMO]', 'PENDIENTE_APROBACION', 1, null, null, 2],
    ['PM3', 'E4', 'ASEO', 'Necesito implementos de aseo [DEMO]', 'PENDIENTE_APROBACION', 1, null, null, 1],
    ['PP1', 'E5', 'UTIL', 'Necesito una mochila para la universidad [DEMO]', 'PENDIENTE_APROBACION', 1, null, null, 1],
    ['PP2', 'E6', 'TEC', 'Necesito un videoproyector para mis clases [DEMO]', 'PENDIENTE_APROBACION', 1, null, null, 1],
    ['PP3', 'E5', 'MOB', 'Necesito una estantería para mis libros [DEMO]', 'APROBADA', 1, null, null, 8, 'AUX2'],
    ['PR1', 'E6', 'LIB', 'Necesito libros de consulta para mi curso [DEMO]', 'RECHAZADA', 1, null, null, 15, 'ADMIN', 'El certificado indica que es docente: la plataforma es para estudiantes.'],
    ['PC1', 'E2', 'ROPA', 'Necesito zapatos deportivos [DEMO]', 'CANCELADA', 1, null, null, 25, null, null, 20, 'Ya conseguí los zapatos'],
  ];
  const crearPeticion = (est, c, desc, estado, emin, min, max, dias, revisor = null, mr = null, cd = null, mc = null) =>
    ins(db, 'peticion', {
      estudiante_id: est, categoria_id: c, descripcion: desc, estado, estado_minimo: emin, medida_min: min, medida_max: max,
      creada_en: hace(dias), revisada_por: revisor, revisada_en: revisor ? hace(dias - 1) : null,
      motivo_rechazo: mr, cerrada_en: cd ? hace(cd) : null, motivo_cierre: mc,
    });
  for (const [k, est, c, desc, estado, emin, min, max, dias, rev, mr, cd, mc] of peticiones) {
    P[k] = await crearPeticion(U[est], C[c], desc, estado, emin, min, max, dias, rev ? U[rev] : null, mr ?? null, cd ?? null, mc ?? null);
  }

  // 5. Asignaciones
  const X = {};
  const asignacion = (o, p, cant, estado, pr, s, c, a, por, asig, rec = null, ent = null, cer = null, motivo = null) =>
    ins(db, 'oferta_x_peticion', {
      oferta_id: o, peticion_id: p, cantidad_asignada: cant, estado, puntaje_prioridad: pr, puntaje_sisben: s,
      puntaje_caracterizacion: c, puntaje_antiguedad: a, coeficientes_prioridad: COEF, asignada_por: por,
      asignada_en: hace(asig), recibida_en: rec === null ? null : hace(rec), custodia_desde: rec === null || estado === 'CANCELADO' && motivo?.startsWith('Recepción incompleta') ? null : hace(rec),
      entregada_en: ent === null ? null : hace(ent), cerrada_en: cer === null ? null : hace(cer), motivo_cierre: motivo, origen: 'DONADOR',
    });
  await asignacion(O.OA2, P.P5, 1, 'ASIGNADO', 0.64, 0.75, 0.62, 0.55, U.AUX1, 25);           // plazo del donador vencido
  await asignacion(O.OA4, P.P7, 1, 'ASIGNADO', 0.812, 0.97, 0.81, 0.16, U.AUX2, 2);           // en plazo
  X.port = await asignacion(O.OA3, P.P6, 1, 'EN_CUSTODIA', 0.402, 0.48, 0.35, 0.38, U.AUX1, 14, 8); // recogida vencida
  X.aseo = await asignacion(O.OA5, P.P8, 2, 'EN_CUSTODIA', 0.845, 0.97, 0.81, 0.22, U.AUX1, 6, 1);  // para entregar en vivo
  X.h1 = await asignacion(O.OH1, P.PH1, 1, 'ENTREGADO', 0.705, 0.75, 0.62, 0.8, U.AUX1, 55, 48, 46, 46, 'Entregada al estudiante');
  X.h2 = await asignacion(O.OH2, P.PH2, 1, 'ENTREGADO', 0.52, 0.48, 0.35, 0.7, U.AUX1, 45, 38, 36, 36, 'Entregada al estudiante');
  X.h3 = await asignacion(O.OH3, P.PH3, 1, 'ENTREGADO', 0.88, 0.97, 0.81, 0.6, U.AUX2, 40, 33, 31, 31, 'Entregada al estudiante');
  X.tab = await asignacion(O.OS1, P.PS1, 1, 'CANCELADO', 0.91, 1, 0.88, 0.3, U.AUX1, 20, 12, null, 6, 'El estudiante no recogió el producto en el plazo');
  await asignacion(O.OF1, P.PF1, 1, 'CANCELADO', 0.6, 0.75, 0.62, 0.4, U.AUX1, 38, null, null, 22, 'El donador no llevó el producto en el plazo');
  await asignacion(O.OF1, P.PF2, 1, 'CANCELADO', 0.41, 0.48, 0.35, 0.33, U.AUX1, 20, null, null, 5, 'El donador no llevó el producto en el plazo');
  X.res = await asignacion(O.OI1, P.PI1, 5, 'CANCELADO', 0.9, 1, 0.88, 0.17, U.AUX1, 12, 4, null, 4, 'Recepción incompleta: llegaron 3 de 5 unidades');
  X.mon = await asignacion(O.OD1, P.PD1, 1, 'DEVOLUCION', 0.38, 0.43, 0.2, 0.35, U.AUX1, 25, 17, null, null, 'El estudiante no recogió; se devuelve al donador');

  // 6. Destinos Local (nacen en ESPERA_RECEPCION; tras recibirlos con foto pasan a su estado final)
  const L = {};
  for (const [k, dias, motivo] of [
    ['L1', 2, 'Sin peticiones compatibles por ahora; Local como última opción.'],
    ['L2', 6, 'Sin peticiones compatibles al publicarse.'],
    ['L3', 15, 'Útil para la sala de estudio del LIS.'],
    ['L4', 18, 'Útil para las asesorías del LIS.'],
    ['L5', 20, 'Sin peticiones compatibles.'],
    ['L6', 30, 'Equipo de alto valor para prácticas del LIS.'],
  ]) {
    L[k] = await ins(db, 'destino_local', {
      oferta_id: O[k], origen: 'OFERTA', cantidad: 1, estado: 'ESPERA_RECEPCION', seleccionado_por: U.AUX1, seleccionado_en: hace(dias), motivo,
    });
  }

  // 7. Opcional: casos sobre cuentas reales
  const R = {};
  if (DR) {
    R.ofReglas = await crearOferta('R_REGLAS', DR, C.UTIL, 'Juego de reglas y escuadras [DEMO]', 'Juego de geometría completo.', 2, 'PENDIENTE_APROBACION', 5, null, 1);
    R.ofEntrega = await crearOferta('R_MOCHILA', DR, C.UTIL, 'Mochila deportiva [DEMO]', 'Mochila deportiva en buen estado.', 1, 'APROBADA', 4, null, 12, U.AUX1);
    R.petEntrega = await crearPeticion(U.E5, C.UTIL, 'Necesito una mochila para cargar mis libros [DEMO]', 'CERRADA_ENTREGA', 1, null, null, 20, U.AUX1, null, 2, 'Producto entregado al estudiante');
    R.xEntrega = await asignacion(R.ofEntrega, R.petEntrega, 1, 'ENTREGADO', 0.42, null, null, null, U.AUX1, 10, 5, 2, 2, 'Entregada al estudiante');
    R.ofLocal = await crearOferta('R_TERMOMETRO', DR, C.LAB, 'Termómetro digital de laboratorio [DEMO]', 'Termómetro digital con sonda.', 1, 'APROBADA', 4, null, 14, U.AUX1);
    R.local = await ins(db, 'destino_local', {
      oferta_id: R.ofLocal, origen: 'OFERTA', cantidad: 1, estado: 'ESPERA_RECEPCION', seleccionado_por: U.AUX1, seleccionado_en: hace(8),
      motivo: 'Sin peticiones compatibles; útil para el laboratorio.',
    });
  }
  if (ER) {
    await crearPeticion(ER, C.LIB, 'Necesito un libro de estructuras de datos [DEMO]', 'PENDIENTE_APROBACION', 1, null, null, 1);
    R.ofEst = await crearOferta('R_GRAFICADORA', U.DONR, C.UTIL, 'Calculadora graficadora [DEMO]', 'Calculadora graficadora con manual.', 1, 'APROBADA', 4, null, 9, U.AUX1);
    R.petEst = await crearPeticion(ER, C.UTIL, 'Necesito una calculadora para mis cursos [DEMO]', 'APROBADA', 1, null, null, 15, U.AUX1);
    R.xEst = await asignacion(R.ofEst, R.petEst, 1, 'EN_CUSTODIA', 0.7, null, null, null, U.AUX1, 5, 0);
    await ins(db, 'notificacion', {
      usuario_id: ER, tipo: 'LISTO_PARA_RECOGER', titulo: 'Tu producto ya está en el LIS',
      mensaje: 'El producto de tu petición "Necesito una calculadora para mis cursos" ya está en el LIS. Recógelo dentro de los próximos 3 días hábiles.',
      entidad: 'ASIGNACION', entidad_id: R.xEst, clave: `DEMO:LISTO:${R.xEst}`, creada_en: AHORA,
    });
  }

  // 8. Recepciones con foto, lotes fisicos y entregas con foto (+ aviso al donador con la foto, D-51)
  const recepciones = [
    // oxp, destino, ofertaLote, clave de foto, cant, contraparte, obs, dias, ubicacion, origenLote, sinDestinoDias, vincular, entregaDias, entregaA
    [X.port, null, O.OA3, 'OA3', 1, 'Repartidor de Tecnología Solidaria', 'Portátil con cargador, sin golpes.', 8, 'EN_LIS', 'RECEPCION_ASIGNACION', null, true],
    [X.aseo, null, O.OA5, 'OA5', 2, 'Voluntario Fundación Amigos', 'Dos kits sellados.', 1, 'EN_LIS', 'RECEPCION_ASIGNACION', null, true],
    [X.h1, null, O.OH1, 'OH1', 1, 'Voluntario Fundación Amigos', null, 48, 'ENTREGADO', 'RECEPCION_ASIGNACION', null, true, 46, 'Santiago Gómez'],
    [X.h2, null, O.OH2, 'OH2', 1, 'Voluntario Fundación Amigos', null, 38, 'ENTREGADO', 'RECEPCION_ASIGNACION', null, true, 36, 'Daniela Mejía'],
    [X.h3, null, O.OH3, 'OH3', 1, 'Voluntario Fundación Amigos', null, 33, 'ENTREGADO', 'RECEPCION_ASIGNACION', null, true, 31, 'Valentina Ríos'],
    [X.tab, null, O.OS1, 'OS1', 1, 'Voluntario Fundación Amigos', 'Tablet con cargador.', 12, 'EN_LIS', 'RECEPCION_ASIGNACION', 6, true],
    [X.mon, null, O.OD1, 'OD1', 1, 'Repartidor de Tecnología Solidaria', null, 17, 'EN_LIS', 'RECEPCION_ASIGNACION', null, true],
    // Incompleta: el lote pertenece a la oferta generada y NO se liga al intento cancelado
    [X.res, null, O.OI1F, 'OI1', 3, 'Jorge Incumplido', 'Llegaron 3 de las 5 resmas.', 4, 'EN_LIS', 'RECEPCION_INCOMPLETA', 4, false],
    [null, L.L2, O.L2, 'L2', 1, 'Repartidor de Tecnología Solidaria', null, 1, 'EN_LIS', 'RECEPCION_LOCAL', null, false],
    [null, L.L3, O.L3, 'L3', 1, 'Repartidor de Tecnología Solidaria', null, 8, 'EN_LIS', 'RECEPCION_LOCAL', null, false],
    [null, L.L4, O.L4, 'L4', 1, 'Mariana Nueva', null, 12, 'EN_LIS', 'RECEPCION_LOCAL', null, false],
    [null, L.L5, O.L5, 'L5', 1, 'Repartidor de Tecnología Solidaria', null, 14, 'EN_LIS', 'RECEPCION_LOCAL', null, false],
    [null, L.L6, O.L6, 'L6', 1, 'Voluntario Fundación Amigos', 'Equipo en su caja.', 25, 'PATRIMONIO_LIS', 'RECEPCION_LOCAL', null, false],
  ];
  if (DR) {
    recepciones.push([R.xEntrega, null, R.ofEntrega, 'R_MOCHILA', 1, 'Donador (cuenta real)', null, 5, 'ENTREGADO', 'RECEPCION_ASIGNACION', null, true, 2, 'Isabella Torres']);
    recepciones.push([null, R.local, R.ofLocal, 'R_TERMOMETRO', 1, 'Donador (cuenta real)', null, 6, 'EN_LIS', 'RECEPCION_LOCAL', null, false]);
  }
  if (ER) recepciones.push([R.xEst, null, R.ofEst, 'R_GRAFICADORA', 1, 'Voluntario Fundación Amigos', null, 0, 'EN_LIS', 'RECEPCION_ASIGNACION', null, true]);

  for (const [oxp, destino, ofertaLote, clave, cant, contra, obs, dias, ubic, origenLote, sdDias, vincular, entDias, entA] of recepciones) {
    const fecha = hace(dias);
    const ev = await evidencia(db, foto('recepcion', clave), U.AUX1, fecha);
    const mov = await ins(db, 'movimiento', {
      oferta_x_peticion_id: oxp, destino_local_id: destino, tipo: 'RECEPCION', cantidad: cant, nombre_contraparte: contra,
      evidencia_id: ev, observaciones: obs, registrado_por: U.AUX1, registrado_en: fecha,
    });
    const entrega = entDias === undefined ? null : hace(entDias);
    const sinDestino = sdDias === null ? null : hace(sdDias);
    const lote = await ins(db, 'lote_fisico', {
      oferta_id: ofertaLote, cantidad: cant, ubicacion: ubic, origen: origenLote, intento_origen_id: oxp,
      recepcion_movimiento_id: mov, sin_destino_desde: sinDestino, creado_en: fecha, actualizado_en: entrega ?? sinDestino,
    });
    await db.query(`UPDATE lis.movimiento SET lote_id = $1 WHERE id = $2`, [lote, mov]);
    if (vincular) await db.query(`UPDATE lis.oferta_x_peticion SET lote_id = $1 WHERE id = $2`, [lote, oxp]);
    if (destino) {
      await db.query(`UPDATE lis.destino_local SET lote_id = $1, estado = 'CUSTODIA_TEMPORAL', custodia_desde = $2 WHERE id = $3`, [lote, fecha, destino]);
    }
    if (entrega) {
      const ev2 = await evidencia(db, foto('entrega', clave), U.AUX1, entrega);
      await ins(db, 'movimiento', {
        oferta_x_peticion_id: oxp, lote_id: lote, tipo: 'ENTREGA', cantidad: cant, nombre_contraparte: entA,
        evidencia_id: ev2, observaciones: 'Entrega completa.', registrado_por: U.AUX1, registrado_en: entrega,
      }, null);
      const of = (await db.query(`SELECT donador_id, nombre_producto FROM lis.oferta WHERE id = $1`, [ofertaLote])).rows[0];
      await ins(db, 'notificacion', {
        usuario_id: of.donador_id, tipo: 'ENTREGA_REGISTRADA', titulo: 'Tu donación llegó a su destino',
        mensaje: `Tu donación "${of.nombre_producto.replace(' [DEMO]', '')}" (${cant} u.) fue entregada a un estudiante. Adjuntamos la foto de la entrega. Gracias por tu aporte.`,
        entidad: 'ASIGNACION', entidad_id: oxp, clave: `DEMO:ENTREGA:${oxp}`, creada_en: entrega, evidencia_id: ev2,
      });
    }
  }

  // 9. Estados finales de Local (D-50)
  const local = (id, campos) => {
    const cols = Object.keys(campos);
    return db.query(`UPDATE lis.destino_local SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...Object.values(campos)]);
  };
  // L2 queda en CUSTODIA_TEMPORAL: se puede emparejar con un estudiante.
  await local(L.L3, { estado: 'PROPUESTO_DONADOR', aceptacion_solicitada_por: U.ADMIN, aceptacion_solicitada_en: hace(1),
    propuesta_motivo: 'La sala de estudio del LIS necesita estanterías para los libros de consulta.', propuesta_limite: fechaCivil(6) });
  await local(L.L4, { estado: 'PROPUESTO_DONADOR', aceptacion_solicitada_por: U.ADMIN, aceptacion_solicitada_en: hace(10),
    propuesta_motivo: 'La pizarra serviría para las asesorías académicas del LIS.', propuesta_limite: fechaCivil(-2) });
  await local(L.L5, { estado: 'POR_DEVOLVER', aceptacion_solicitada_por: U.ADMIN, aceptacion_solicitada_en: hace(6),
    propuesta_motivo: 'El microscopio apoyaría las prácticas del laboratorio.', propuesta_limite: fechaCivil(1),
    respuesta_donador: 'RECHAZA', respuesta_en: hace(1), respuesta_motivo: 'Preferimos donarlo a un colegio; por favor devolverlo.' });
  await local(L.L6, { estado: 'ACEPTADO', aceptacion_solicitada_por: U.ADMIN, aceptacion_solicitada_en: hace(20),
    propuesta_motivo: 'Equipo de alto valor para las prácticas de electrónica del LIS.', propuesta_limite: fechaCivil(-13),
    respuesta_donador: 'ACEPTA', respuesta_en: hace(18), aceptado_por: U.ADMIN, aceptado_en: hace(18), cerrado_en: hace(18),
    motivo_cierre: 'Aceptado con consentimiento del donador. Motivo del LIS: equipo para prácticas de electrónica.' });
  if (R.local) {
    await local(R.local, { estado: 'PROPUESTO_DONADOR', aceptacion_solicitada_por: U.ADMIN, aceptacion_solicitada_en: hace(1),
      propuesta_motivo: 'El laboratorio de química del LIS necesita un termómetro digital para sus prácticas.', propuesta_limite: fechaCivil(6) });
  }

  // 10. Avisos de bandeja (correo fuera de alcance, D-53)
  const avisos = [
    [U.DONL, 'LOCAL_PROPUESTA', 'El LIS quiere quedarse con tu donación: necesitamos tu respuesta',
      'El administrador del LIS propone que "Estantería metálica" (1 u.) quede como donativo para el laboratorio. Entra a "Mis donaciones" para aceptar o rechazar.', L.L3, `DEMO:PROPUESTA:${L.L3}`, hace(1)],
    [U.DONR, 'LOCAL_ACEPTADO', 'Tu donación quedó para el LIS',
      'Gracias. "Osciloscopio digital" queda como donativo del LIS. Motivo: equipo para prácticas de electrónica.', L.L6, `DEMO:ACEPTADO:${L.L6}`, hace(18)],
    [U.AUX1, 'LOCAL_POR_DEVOLVER', 'Local: el donador rechazó, hay que devolver',
      'El donador rechazó la propuesta del microscopio. Coordina la devolución y regístrala con foto.', L.L5, `DEMO:PORDEVOLVER:${L.L5}`, hace(1)],
  ];
  if (R.local) {
    avisos.push([DR, 'LOCAL_PROPUESTA', 'El LIS quiere quedarse con tu donación: necesitamos tu respuesta',
      'El administrador del LIS propone que "Termómetro digital de laboratorio" (1 u.) quede como donativo para el laboratorio. Entra a "Mis donaciones" para aceptar o rechazar. Si rechazas, el LIS te devolverá el producto.',
      R.local, `DEMO:PROPUESTA:${R.local}`, hace(1)]);
  }
  for (const [usuario, tipo, titulo, mensaje, entidadId, clave, creada] of avisos) {
    await ins(db, 'notificacion', { usuario_id: usuario, tipo, titulo, mensaje, entidad: 'LOCAL', entidad_id: entidadId, clave, creada_en: creada }, null);
  }

  // 11. Foto de cada publicacion (catalogo, aprobaciones, mis donaciones)
  for (const [id, { clave, donador, fecha }] of Object.entries(fotoClave)) {
    const ev = await evidencia(db, foto('productos', clave), donador, fecha);
    await db.query(`UPDATE lis.oferta SET foto_id = $1 WHERE id = $2`, [ev, Number(id)]);
  }
  // La oferta generada por faltante reutiliza la foto de su oferta de origen (como hace el backend).
  await db.query(`UPDATE lis.oferta f SET foto_id = o.foto_id FROM lis.oferta o WHERE o.id = f.oferta_origen_id AND f.id = $1`, [O.OI1F]);

  // 12. Historial de estados (alimenta la trazabilidad, D-52)
  await historial(db, U, X.tab);
  return { usuarios: Object.keys(U).length, ofertas: Object.keys(fotoClave).length + 1, peticiones: peticiones.length, cuentasReales: { donador: !!DR, estudiante: !!ER } };
}

async function historial(db, U, xTab) {
  const demoO = `(SELECT id FROM lis.oferta WHERE nombre_producto LIKE '%[DEMO]%')`;
  const demoP = `(SELECT id FROM lis.peticion WHERE descripcion LIKE '%[DEMO]%')`;
  const H = 'INSERT INTO lis.historial_estado (entidad, entidad_id, estado_anterior, estado_nuevo, actor_id, motivo, ocurrido_en)';
  const aux = U.AUX1;
  await db.query(`${H}
    SELECT 'OFERTA', o.id, NULL, CASE WHEN o.origen = 'FALTANTE' THEN 'APROBADA' ELSE 'PENDIENTE_APROBACION' END,
           CASE WHEN o.origen = 'FALTANTE' THEN o.revisada_por ELSE o.donador_id END,
           CASE WHEN o.origen = 'FALTANTE' THEN 'Generada por recepción incompleta de la oferta ' || o.oferta_origen_id ELSE 'Publicada por el donador' END,
           o.creada_en
    FROM lis.oferta o WHERE o.id IN ${demoO}`);
  await db.query(`${H}
    SELECT 'OFERTA', o.id, 'PENDIENTE_APROBACION', CASE WHEN o.estado = 'RECHAZADA' THEN 'RECHAZADA' ELSE 'APROBADA' END, o.revisada_por,
           CASE WHEN o.estado = 'RECHAZADA' THEN o.motivo_rechazo ELSE 'Aprobada por el personal del LIS' END, o.revisada_en
    FROM lis.oferta o WHERE o.id IN ${demoO} AND o.origen = 'DONADOR' AND o.revisada_en IS NOT NULL`);
  await db.query(`${H}
    SELECT 'OFERTA', o.id, CASE WHEN o.estado = 'CANCELADA' THEN 'PENDIENTE_APROBACION' ELSE 'APROBADA' END, o.estado,
           CASE WHEN o.estado = 'CANCELADA' THEN o.donador_id ELSE $1 END,
           CASE WHEN o.estado = 'CANCELADA' THEN 'Cancelada por el donador: ya no dispone del producto' ELSE 'Todas las unidades fueron entregadas' END,
           o.cerrada_en
    FROM lis.oferta o WHERE o.id IN ${demoO} AND o.estado IN ('CANCELADA','CERRADA')`, [aux]);
  await db.query(`${H}
    SELECT 'PETICION', p.id, NULL, 'PENDIENTE_APROBACION', p.estudiante_id, 'Petición registrada por el estudiante', p.creada_en
    FROM lis.peticion p WHERE p.id IN ${demoP}`);
  await db.query(`${H}
    SELECT 'PETICION', p.id, 'PENDIENTE_APROBACION', CASE WHEN p.estado = 'RECHAZADA' THEN 'RECHAZADA' ELSE 'APROBADA' END, p.revisada_por,
           CASE WHEN p.estado = 'RECHAZADA' THEN p.motivo_rechazo ELSE 'Aprobada por el personal del LIS' END, p.revisada_en
    FROM lis.peticion p WHERE p.id IN ${demoP} AND p.revisada_en IS NOT NULL`);
  await db.query(`${H}
    SELECT 'PETICION', p.id, CASE WHEN p.estado = 'CANCELADA' THEN 'PENDIENTE_APROBACION' ELSE 'APROBADA' END, p.estado,
           CASE WHEN p.estado = 'CANCELADA' THEN p.estudiante_id ELSE $1 END, p.motivo_cierre, p.cerrada_en
    FROM lis.peticion p WHERE p.id IN ${demoP} AND p.estado IN ('CANCELADA','CERRADA_ENTREGA','CERRADA_INCUMPLIMIENTO')`, [aux]);
  await db.query(`${H}
    SELECT 'ASIGNACION', x.id, NULL, 'ASIGNADO', x.asignada_por,
           'Asignadas ' || x.cantidad_asignada || ' unidades de la oferta ' || x.oferta_id || ' a la petición ' || x.peticion_id
             || '. Prioridad ' || to_char(x.puntaje_prioridad, 'FM0.000'),
           x.asignada_en
    FROM lis.oferta_x_peticion x WHERE x.oferta_id IN ${demoO}`);
  await db.query(`${H}
    SELECT 'ASIGNACION', x.id, 'ASIGNADO', 'EN_CUSTODIA', $1, 'Recibidas ' || x.cantidad_asignada || ' unidades con foto (lote ' || x.lote_id || ')', x.recibida_en
    FROM lis.oferta_x_peticion x WHERE x.oferta_id IN ${demoO} AND x.recibida_en IS NOT NULL AND x.lote_id IS NOT NULL`, [aux]);
  await db.query(`${H}
    SELECT 'ASIGNACION', x.id, 'EN_CUSTODIA', 'ENTREGADO', $1, 'Entregadas ' || x.cantidad_asignada || ' unidades con foto', x.entregada_en
    FROM lis.oferta_x_peticion x WHERE x.oferta_id IN ${demoO} AND x.estado = 'ENTREGADO'`, [aux]);
  await db.query(`${H}
    SELECT 'ASIGNACION', x.id, CASE WHEN x.lote_id IS NULL THEN 'ASIGNADO' ELSE 'EN_CUSTODIA' END, 'CANCELADO', $1, x.motivo_cierre, x.cerrada_en
    FROM lis.oferta_x_peticion x WHERE x.oferta_id IN ${demoO} AND x.estado = 'CANCELADO'`, [aux]);
  await db.query(`${H}
    SELECT 'ASIGNACION', x.id, 'EN_CUSTODIA', 'DEVOLUCION', $1, x.motivo_cierre, x.recibida_en + interval '6 days'
    FROM lis.oferta_x_peticion x WHERE x.oferta_id IN ${demoO} AND x.estado = 'DEVOLUCION'`, [aux]);
  await db.query(`${H}
    SELECT 'LOTE', x.lote_id, 'EN_CUSTODIA', 'SIN_DESTINO', $1, 'Asignación ' || x.id || ' cancelada', x.cerrada_en
    FROM lis.oferta_x_peticion x WHERE x.id = $2`, [aux, xTab]);
  await db.query(`${H}
    SELECT 'LOCAL', d.id, NULL, 'ESPERA_RECEPCION', d.seleccionado_por, 'Local elegido como última opción: ' || d.motivo, d.seleccionado_en
    FROM lis.destino_local d WHERE d.oferta_id IN ${demoO}`);
  await db.query(`${H}
    SELECT 'LOCAL', d.id, 'ESPERA_RECEPCION', 'CUSTODIA_TEMPORAL', $1, 'Recibido con foto (lote ' || d.lote_id || '); inicia custodia temporal del LIS', d.custodia_desde
    FROM lis.destino_local d WHERE d.oferta_id IN ${demoO} AND d.custodia_desde IS NOT NULL`, [aux]);
  await db.query(`${H}
    SELECT 'LOCAL', d.id, 'CUSTODIA_TEMPORAL', 'PROPUESTO_DONADOR', d.aceptacion_solicitada_por,
           'Propuesta al donador (responde hasta ' || to_char(d.propuesta_limite, 'YYYY-MM-DD') || '): ' || d.propuesta_motivo, d.aceptacion_solicitada_en
    FROM lis.destino_local d WHERE d.oferta_id IN ${demoO} AND d.aceptacion_solicitada_en IS NOT NULL`);
  await db.query(`${H}
    SELECT 'LOCAL', d.id, 'PROPUESTO_DONADOR', d.estado, o.donador_id,
           CASE WHEN d.respuesta_donador = 'ACEPTA' THEN 'El donador aceptó que quede para el LIS'
                ELSE 'El donador rechazó que quede para el LIS; se le debe devolver: ' || COALESCE(d.respuesta_motivo, '') END,
           d.respuesta_en
    FROM lis.destino_local d JOIN lis.oferta o ON o.id = d.oferta_id
    WHERE d.oferta_id IN ${demoO} AND d.respuesta_en IS NOT NULL`);
  await db.query(`${H}
    SELECT 'LOTE', d.lote_id, 'CUSTODIA_LOCAL', 'PATRIMONIO_LIS', o.donador_id, 'Destino Local ' || d.id || ' aceptado por el donador', d.aceptado_en
    FROM lis.destino_local d JOIN lis.oferta o ON o.id = d.oferta_id
    WHERE d.oferta_id IN ${demoO} AND d.estado = 'ACEPTADO'`);
  const filas = [
    [U.SUPER, null, 'ROL_SUPERUSUARIO', null, 'Asignado manualmente por script de mantenimiento', 120],
    [U.ADMIN, null, 'ROL_ADMINISTRADOR', U.SUPER, 'Rol otorgado por un superusuario', 110],
    [U.AUX1, null, 'ROL_AUXILIAR_LIS', U.ADMIN, 'Rol otorgado por un administrador', 100],
    [U.AUX2, null, 'ROL_AUXILIAR_LIS', U.ADMIN, 'Rol otorgado por un administrador', 95],
    [U.BLOQ, 'ACTIVO', 'BLOQUEADO', U.ADMIN, 'Publicó ofertas falsas de forma reiterada (caso de demostración).', 40],
    [U.E6, 'CERTIFICADO_PENDIENTE', 'CERTIFICADO_RECHAZADO', U.ADMIN, 'El documento es una constancia laboral de docente.', 9],
  ];
  for (const [id, ant, nuevo, actor, motivo, dias] of filas) {
    await db.query(`${H} VALUES ('USUARIO', $1, $2, $3, $4, $5, $6)`, [id, ant, nuevo, actor, motivo, hace(dias)]);
  }
}

/* ------------------------------------------------------------------ */
(async () => {
  const soloBorrar = process.argv.includes('--borrar');
  console.log(`Destino: ${destinoLegible()}`);
  const db = await conectar();
  try {
    const v = await db.query(`SELECT max(version) AS v FROM lis.esquema_version`).catch(() => ({ rows: [{ v: null }] }));
    if (!(v.rows[0].v >= 3)) throw new Error('Faltan migraciones: ejecuta "node scripts/db/migrar.js".');
    await db.query('BEGIN');
    await borrar(db);
    const r = soloBorrar ? null : await sembrar(db);
    await db.query('COMMIT');
    console.log(soloBorrar ? 'Datos demo borrados.' : `Escenario demo cargado: ${JSON.stringify(r)}`);
    if (!soloBorrar) console.log('En "Entregas y plazos" pulsa "Revisar ahora" para generar las tareas DEFINIR_ESTADO.');
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
