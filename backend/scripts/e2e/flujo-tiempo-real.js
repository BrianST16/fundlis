/**
 * Prueba de extremo a extremo EN TIEMPO REAL: HTTP -> API NestJS -> SQL Server
 * experimental, con el escenario demo (cuentas ficticias).
 *
 *   1) node scripts/db/demo.js                 (restaurar escenario)
 *   2) PORT=3100 node dist/main.js             (API corriendo)
 *   3) node scripts/e2e/flujo-tiempo-real.js [http://localhost:3100/api]
 *
 * Las cuentas demo no existen en Google; por eso este script firma LOCALMENTE
 * un JWT de la plataforma con JWT_SECRET (no lo imprime). El guard igual
 * revalida usuario, estado y roles contra la BD en cada peticion.
 * Escribe SOLO sobre datos demo. Imprime PASA/FALLA por verificacion.
 */
const path = require('path');
const zlib = require('zlib');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const jwt = require('jsonwebtoken');
const { conectar } = require('../db/conexion');

const BASE = process.argv[2] || 'http://localhost:3100/api';
const resultados = [];
const ok = (nombre, cond, detalle = '') => {
  resultados.push({ nombre, pasa: !!cond });
  console.log(`${cond ? 'PASA ' : 'FALLA'} ${nombre}${detalle ? ` -> ${detalle}` : ''}`);
};

/** PNG valido de 16x16 generado en memoria (foto ficticia de evidencia). */
function pngFicticio(semilla) {
  const w = 16, h = 16;
  const filas = [];
  for (let y = 0; y < h; y++) {
    filas.push(0);
    for (let x = 0; x < w; x++) filas.push((x * 16 + semilla) & 255, (y * 16) & 255, 128);
  }
  const chunk = (tipo, datos) => {
    const t = Buffer.from(tipo, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, datos])) >>> 0);
    return Buffer.concat([len, t, datos, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from(filas))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { mime: 'image/png', contenidoBase64: png.toString('base64'), nombreOriginal: `demo-${semilla}.png` };
}

async function llamar(metodo, ruta, token, cuerpo) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let datos = null;
  const texto = await r.text();
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { status: r.status, datos };
}

(async () => {
  const pool = await conectar();
  const filas = (await pool.request().query(`
    SELECT u.id, u.google_sub, u.email, u.nombre, u.perfil,
           (SELECT STRING_AGG(r.rol, ',') FROM USUARIO_ROL r WHERE r.usuario_id = u.id) AS roles
    FROM USUARIO u WHERE u.google_sub LIKE 'demo-%'`)).recordset;
  if (filas.length < 8) throw new Error('No hay escenario demo. Ejecuta primero: node scripts/db/demo.js');
  const U = Object.fromEntries(filas.map((f) => [f.google_sub, f]));
  const token = (sub) => {
    const u = U[sub];
    return jwt.sign(
      { sub: u.id, email: u.email, nombre: u.nombre, perfil: u.perfil, roles: u.roles ? u.roles.split(',') : [] },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );
  };
  const T = Object.fromEntries(Object.keys(U).map((k) => [k, token(k)]));
  const q1 = async (s) => (await pool.request().query(s)).recordset[0];

  // ---------------------------------------------------------------- R1
  const salud = await llamar('GET', '/salud');
  ok('R1 /salud responde ok y BD conectada (3 componentes)', salud.status === 200 && salud.datos?.baseDatos === 'conectada' && salud.datos?.detalle === undefined);

  // ---------------------------------------------------------------- R3 privacidad
  const catO = await llamar('GET', '/ofertas/catalogo');
  const chaqueta = catO.datos.find((o) => o.nombreProducto === 'Chaqueta impermeable [DEMO]');
  ok('R3 catalogo de ofertas anonimo (invitado), con atributos de compatibilidad', catO.status === 200 && chaqueta && chaqueta.donador === undefined && chaqueta.estadoConservacion === 4 && Number(chaqueta.medida) === 3);
  const catP = await llamar('GET', '/peticiones/catalogo');
  const sinIdentidad = catP.datos.every((p) => p.estudiante === undefined && p.estudianteId === undefined);
  const ocultas = !catP.datos.some((p) => /calculadora cientifica para calculo|portatil para programar/i.test(p.descripcion));
  ok('R3/R4 catalogo de peticiones anonimo y oculta las que estan en proceso', catP.status === 200 && sinIdentidad && ocultas);
  ok('R3 invitado sin token -> 401 en analitica', (await llamar('GET', '/analitica/indicadores')).status === 401);
  ok('R3 estudiante -> 403 en analitica', (await llamar('GET', '/analitica/indicadores', T['demo-est1'])).status === 403);
  ok('R3 auxiliar -> 403 en caracterizacion sensible', (await llamar('GET', `/caracterizacion/usuario/${U['demo-est1'].id}`, T['demo-aux'])).status === 403);
  ok('R3 administrador -> 200 en caracterizacion sensible', (await llamar('GET', `/caracterizacion/usuario/${U['demo-est1'].id}`, T['demo-admin'])).status === 200);

  // ---------------------------------------------------------------- R4 aprobacion + notificacion
  const pend = await llamar('GET', '/ofertas/pendientes', T['demo-aux']);
  const zapatos = pend.datos.find((o) => o.nombreProducto === 'Zapatos deportivos [DEMO]');
  const ap = await llamar('PATCH', `/ofertas/${zapatos.id}/aprobar`, T['demo-aux']);
  ok('R4 auxiliar aprueba oferta pendiente', ap.status === 200 && ap.datos.estado === 'APROBADA');
  const bandejaD2 = await llamar('GET', '/notificaciones', T['demo-don2']);
  ok('R6 bandeja interna: el donador recibe OFERTA_APROBADA', bandejaD2.datos.some((n) => n.tipo === 'OFERTA_APROBADA'));

  // ---------------------------------------------------------------- R5 KD-tree + prioridad
  const emp = await llamar('GET', `/emparejamiento/oferta/${chaqueta.id}`, T['demo-aux']);
  const cand = emp.datos.candidatos || [];
  // La categoria puede tener peticiones reales del equipo: se verifican SOLO las demo
  // y no se imprimen nombres de cuentas reales.
  const demo = cand.filter((c) => /^Estudiante Demo /.test(c.estudianteNombre));
  const nombresDemo = demo.map((c) => c.estudianteNombre);
  ok(
    'R5 KD-tree: compatibles demo = Uno y Dos; excluye Tres (exige nuevo) y Cuatro (talla grande)',
    emp.status === 200 &&
      nombresDemo.includes('Estudiante Demo Uno') && nombresDemo.includes('Estudiante Demo Dos') &&
      !nombresDemo.includes('Estudiante Demo Tres') && !nombresDemo.includes('Estudiante Demo Cuatro') &&
      emp.datos.diagnostico.incompatibles >= 2,
    JSON.stringify({ demo: nombresDemo, compatibles: emp.datos.diagnostico.compatibles, incompatibles: emp.datos.diagnostico.incompatibles }),
  );
  ok('R5 arbol coincide con el filtro lineal', emp.datos.diagnostico.coincideConFiltroLineal === true);
  const ordenado = cand.every((c, i) => i === 0 || cand[i - 1].prioridad.total >= c.prioridad.total);
  ok('R5 prioridad ordenada desc con componentes numericos (sin %)', ordenado && typeof cand[0].prioridad.sisben === 'number' && !JSON.stringify(emp.datos).includes('%'));
  ok('R5 LOCAL al final de la lista de recibidores', emp.datos.destinoLocal?.tipo === 'LOCAL');
  ok('D-39 el auxiliar no ve el grupo Sisben', cand.every((c) => c.grupoSisben === undefined));
  const empAdm = await llamar('GET', `/emparejamiento/oferta/${chaqueta.id}`, T['demo-admin']);
  ok('D-39 el administrador si ve el grupo Sisben', empAdm.datos.candidatos.every((c) => typeof c.grupoSisben === 'string'));
  const inversa = await llamar('GET', `/emparejamiento/peticion/${cand[0].peticionId}`, T['demo-aux']);
  ok('R5 consulta inversa (ofertas compatibles con una peticion) en 2D', inversa.status === 200 && inversa.datos.ofertas.some((o) => o.id === chaqueta.id) && inversa.datos.diagnostico.coincideConFiltroLineal);

  // ---------------------------------------------------------------- R4 asignar -> recibir -> entregar
  const elegido = demo[0]; // nunca se asigna a una peticion real
  const asig = await llamar('POST', '/asignaciones', T['demo-aux'], { ofertaId: chaqueta.id, peticionId: elegido.peticionId, cantidad: 1 });
  ok('R4 asignacion confirmada por el auxiliar', asig.status === 201 && asig.datos.estado === 'ASIGNADO');
  ok('D-38 la asignacion conserva los componentes de prioridad', asig.datos.prioridad && asig.datos.prioridad.sisben !== null && asig.datos.prioridad.caracterizacion !== null && asig.datos.prioridad.antiguedad !== null && /kC=/.test(asig.datos.prioridad.coeficientes));
  const bD1 = await llamar('GET', '/notificaciones', T['demo-don1']);
  const avisoAsig = bD1.datos.find((n) => n.tipo === 'ASIGNACION_CONFIRMADA' && n.entidadId === asig.datos.id);
  ok('R6 donador notificado de la asignacion SIN identidad del estudiante', avisoAsig && !avisoAsig.mensaje.includes(elegido.estudianteNombre));
  const estudianteSub = Object.keys(U).find((k) => U[k].nombre === elegido.estudianteNombre);
  const bEst = await llamar('GET', '/notificaciones', T[estudianteSub]);
  ok('R6 estudiante notificado de la asignacion', bEst.datos.some((n) => n.tipo === 'ASIGNACION_CONFIRMADA'));
  const correoAsig = await q1(`SELECT TOP 1 c.estado FROM CORREO_SALIDA c JOIN NOTIFICACION n ON n.id = c.notificacion_id WHERE n.usuario_id = ${U['demo-don1'].id} AND n.tipo = 'ASIGNACION_CONFIRMADA'`);
  ok('R6 canal correo encolado (cuenta demo -> DESCARTADO, nunca se envia a dominios ficticios)', correoAsig?.estado === 'DESCARTADO');

  const recep = await llamar('POST', `/asignaciones/${asig.datos.id}/recepcion`, T['demo-aux'], { cantidad: 1, nombreContraparte: 'Persona ficticia', foto: pngFicticio(1) });
  ok('R4 recepcion fisica con foto -> EN_CUSTODIA y lote fisico', recep.status === 201 && recep.datos.estado === 'EN_CUSTODIA' && recep.datos.loteId);
  const fotoRecep = recep.datos.movimientos.find((m) => m.tipo === 'RECEPCION').evidenciaId;
  ok('R3 el estudiante NO puede ver la foto de recepcion', (await llamar('GET', `/evidencias/${fotoRecep}`, T[estudianteSub])).status === 403);
  ok('R3 el donador NO puede ver la foto de recepcion', (await llamar('GET', `/evidencias/${fotoRecep}`, T['demo-don1'])).status === 403);
  ok('R3 el personal LIS si puede ver la foto de recepcion', (await llamar('GET', `/evidencias/${fotoRecep}`, T['demo-aux'])).status === 200);
  const detEst = await llamar('GET', `/asignaciones/${asig.datos.id}`, T[estudianteSub]);
  ok('R3 el estudiante ve su asignacion sin identidad del donador ni fotos', detEst.status === 200 && detEst.datos.oferta.donador === undefined && detEst.datos.movimientos.every((m) => m.evidenciaId === undefined));
  ok('R6 estudiante avisado: producto listo para recoger con fecha limite', (await llamar('GET', '/notificaciones', T[estudianteSub])).datos.some((n) => n.tipo === 'LISTO_PARA_RECOGER'));
  const mios = await llamar('GET', '/plazos/mios', T[estudianteSub]);
  ok('R6 "mis plazos" muestra la fecha limite de recogida', mios.datos.some((p) => p.asignacionId === asig.datos.id && p.responsable === 'ESTUDIANTE'));

  const entrega = await llamar('POST', `/asignaciones/${asig.datos.id}/entrega`, T['demo-aux'], { cantidad: 1, nombreContraparte: 'Persona ficticia', foto: pngFicticio(2) });
  ok('R4 entrega con foto -> ENTREGADO', entrega.status === 201 && entrega.datos.estado === 'ENTREGADO');
  const petCerrada = await q1(`SELECT estado FROM PETICION WHERE id = ${elegido.peticionId}`);
  ok('R4 la peticion queda CERRADA_ENTREGA', petCerrada.estado === 'CERRADA_ENTREGA');
  const loteEnt = await q1(`SELECT ubicacion FROM LOTE_FISICO WHERE id = ${recep.datos.loteId}`);
  ok('D-43 ubicacion fisica del lote = ENTREGADO (separada del intento)', loteEnt.ubicacion === 'ENTREGADO');

  // ---------------------------------------------------------------- LOCAL
  const local = await llamar('POST', '/local/desde-oferta', T['demo-aux'], { ofertaId: chaqueta.id, cantidad: 1, motivo: 'Sin estudiantes compatibles para esta unidad' });
  ok('LOCAL elegido desde la oferta -> ESPERA_RECEPCION', local.status === 201 && local.datos.estado === 'ESPERA_RECEPCION');
  const petsAntes = await q1(`SELECT COUNT(*) n FROM PETICION`);
  const lRec = await llamar('POST', `/local/${local.datos.id}/recepcion`, T['demo-aux'], { cantidad: 1, nombreContraparte: 'Persona ficticia', foto: pngFicticio(3) });
  ok('LOCAL recepcion con foto -> CUSTODIA_TEMPORAL (la inicia el auxiliar)', lRec.status === 201 && lRec.datos.estado === 'CUSTODIA_TEMPORAL' && lRec.datos.loteId);
  ok('LOCAL el auxiliar NO puede aceptar el donativo institucional (403)', (await llamar('POST', `/local/${local.datos.id}/aceptar`, T['demo-aux'], { motivo: 'Uso del laboratorio' })).status === 403);
  const sol = await llamar('POST', `/local/${local.datos.id}/solicitar-aceptacion`, T['demo-aux'], { motivo: 'Util para el laboratorio' });
  ok('LOCAL el auxiliar solicita aceptacion', sol.status === 201 && sol.datos.aceptacionSolicitada);
  ok('R6 el administrador recibe la solicitud en su bandeja', (await llamar('GET', '/notificaciones', T['demo-admin'])).datos.some((n) => n.tipo === 'LOCAL_ACEPTACION_SOLICITADA'));
  const acept = await llamar('POST', `/local/${local.datos.id}/aceptar`, T['demo-admin'], { motivo: 'Aceptado para uso del laboratorio' });
  ok('LOCAL el administrador acepta -> ACEPTADO con autorizacion registrada', acept.status === 201 && acept.datos.estado === 'ACEPTADO' && acept.datos.aceptadoPor === U['demo-admin'].id);
  const loteLocal = await q1(`SELECT ubicacion FROM LOTE_FISICO WHERE id = ${lRec.datos.loteId}`);
  ok('LOCAL lote en PATRIMONIO_LIS', loteLocal.ubicacion === 'PATRIMONIO_LIS');
  ok('LOCAL no crea peticiones ficticias', (await q1(`SELECT COUNT(*) n FROM PETICION`)).n === petsAntes.n);
  const saldo = await q1(`SELECT cantidad_disponible FROM VW_OFERTA_SALDO WHERE oferta_id = ${chaqueta.id}`);
  ok('Saldo (vista SQL) = 3 - 1 entregada - 1 LOCAL = 1', saldo.cantidad_disponible === 1);

  // ---------------------------------------------------------------- R6 tareas con revision controlada
  const rev1 = await llamar('POST', '/tareas/revisar', T['demo-aux'], {});
  const rev2 = await llamar('POST', '/tareas/revisar', T['demo-aux'], {});
  ok('R6 revision crea tareas DEFINIR_ESTADO para vencimientos', rev1.status === 200 && rev1.datos.tareasCreadas >= 2, JSON.stringify(rev1.datos));
  ok('R6 revision idempotente (segunda corrida no duplica)', rev2.datos.tareasCreadas === 0);
  const idsDemo = new Set(
    (await pool.request().query(`SELECT x.id FROM OFERTA_X_PETICION x JOIN OFERTA o ON o.id = x.oferta_id JOIN USUARIO u ON u.id = o.donador_id WHERE u.google_sub LIKE 'demo-%'`)).recordset.map((r) => r.id),
  );
  const abiertas = (await llamar('GET', '/tareas?estado=ABIERTA', T['demo-aux'])).datos.filter((t) => idsDemo.has(t.asignacionId));
  const tDonador = abiertas.find((t) => t.responsable === 'DONADOR');
  const tEstudiante = abiertas.find((t) => t.responsable === 'ESTUDIANTE');
  ok('R6 hay tarea del donador y tarea del estudiante', !!tDonador && !!tEstudiante);
  ok('R6 alerta bilateral: el donador recibe PLAZO_VENCIDO', (await llamar('GET', '/notificaciones', T['demo-don1'])).datos.some((n) => n.tipo === 'PLAZO_VENCIDO'));
  const resD = await llamar('POST', `/tareas/${tDonador.id}/resolver`, T['demo-aux'], { decision: 'APLAZAR', motivo: 'El donador pidio una semana mas' });
  ok('R6 resolver tarea del donador: APLAZAR', resD.status === 200 && resD.datos.estado === 'RESUELTA');
  const resE = await llamar('POST', `/tareas/${tEstudiante.id}/resolver`, T['demo-aux'], { decision: 'CUSTODIA_LOCAL', motivo: 'El estudiante no respondio; se custodia en el LIS' });
  ok('R6 resolver tarea del estudiante: cancelar y pasar el lote a custodia LOCAL', resE.status === 200 && resE.datos.decision === 'CUSTODIA_LOCAL');
  const enCustodia = (await llamar('GET', '/local?estado=CUSTODIA_TEMPORAL', T['demo-aux'])).datos;
  ok('D-43 el lote del portatil queda en custodia temporal LOCAL', enCustodia.some((d) => /Portatil/.test(d.producto)));
  const sinTareaDup = await llamar('POST', '/tareas/revisar', T['demo-aux'], {});
  ok('R6 tras aplazar, la revision no vuelve a crear la misma tarea', sinTareaDup.datos.tareasCreadas === 0);

  // ---------------------------------------------------------------- R7 analitica
  const rankD = await llamar('GET', '/analitica/ranking/donadores', T['demo-aux']);
  ok('R7 ranking directo de donadores (tasa de cumplimiento)', rankD.status === 200 && rankD.datos.some((d) => 'tasaCumplimiento' in d));
  const rankE = await llamar('GET', '/analitica/ranking/estudiantes', T['demo-aux']);
  ok('R7 ranking de estudiantes con explicacion de factores', rankE.status === 200 && rankE.datos.every((e) => typeof e.explicacion === 'string'));
  const correo = await llamar('GET', '/notificaciones/correo/estado', T['demo-admin']);
  ok('R6 estado del canal de correo informado (SMTP sin configurar en este entorno)', correo.status === 200 && correo.datos.smtpConfigurado === false, JSON.stringify(correo.datos.porEstado));

  await pool.close();
  const fallas = resultados.filter((r) => !r.pasa).length;
  console.log(`\nRESUMEN: ${resultados.length - fallas}/${resultados.length} verificaciones pasan.`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
