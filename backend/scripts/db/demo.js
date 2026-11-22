/**
 * Escenario de DEMOSTRACION con datos FICTICIOS (INDICACIONES §8).
 *   node scripts/db/demo.js            restaura: borra SOLO lo demo y lo vuelve a sembrar
 *   node scripts/db/demo.js --borrar   solo borra lo demo
 *
 * - Todas las cuentas demo tienen google_sub 'demo-...' y dominios ficticios
 *   (demo.lisdona.test / demo.udea.edu.co): no son personas reales, no pueden
 *   iniciar sesion con Google y nunca reciben correo (dominios excluidos).
 * - El borrado solo toca filas ligadas a cuentas demo; los datos reales del
 *   equipo no se modifican.
 * - Solo opera sobre la base experimental permitida (ver conexion.js).
 */
const { conectar, destinoLegible, sql } = require('./conexion');

const DIA = 86_400_000;
const hace = (dias) => new Date(Date.now() - dias * DIA);

const USUARIOS = [
  { sub: 'demo-admin', email: 'admin.demo@demo.lisdona.test', nombre: 'Administradora Demo', perfil: 'DONADOR', rol: 'ADMINISTRADOR' },
  { sub: 'demo-aux', email: 'auxiliar.demo@demo.lisdona.test', nombre: 'Auxiliar LIS Demo', perfil: 'DONADOR', rol: 'AUXILIAR_LIS' },
  { sub: 'demo-don1', email: 'donador.uno@demo.lisdona.test', nombre: 'Donador Demo Uno', perfil: 'DONADOR' },
  { sub: 'demo-don2', email: 'donador.dos@demo.lisdona.test', nombre: 'Donadora Demo Dos', perfil: 'DONADOR' },
  { sub: 'demo-est1', email: 'estudiante.uno@demo.udea.edu.co', nombre: 'Estudiante Demo Uno', perfil: 'ESTUDIANTE', sisben: 'A2', respuestas: [4, 4, 3, 4, 2] },
  { sub: 'demo-est2', email: 'estudiante.dos@demo.udea.edu.co', nombre: 'Estudiante Demo Dos', perfil: 'ESTUDIANTE', sisben: 'B3', respuestas: [3, 3, 2, 3, 1] },
  { sub: 'demo-est3', email: 'estudiante.tres@demo.udea.edu.co', nombre: 'Estudiante Demo Tres', perfil: 'ESTUDIANTE', sisben: 'C5', respuestas: [2, 2, 2, 2, 1] },
  { sub: 'demo-est4', email: 'estudiante.cuatro@demo.udea.edu.co', nombre: 'Estudiante Demo Cuatro', perfil: 'ESTUDIANTE', sisben: 'A1', respuestas: [4, 4, 3, 4, 3] },
];

async function borrar(tx) {
  const q = (s) => new sql.Request(tx).batch(s);
  await q(`
    DECLARE @u TABLE (id INT PRIMARY KEY);
    INSERT INTO @u SELECT id FROM USUARIO WHERE google_sub LIKE 'demo-%';
    DECLARE @o TABLE (id INT PRIMARY KEY);
    INSERT INTO @o SELECT id FROM OFERTA WHERE donador_id IN (SELECT id FROM @u);
    INSERT INTO @o SELECT id FROM OFERTA WHERE oferta_origen_id IN (SELECT id FROM @o) AND id NOT IN (SELECT id FROM @o);
    DECLARE @p TABLE (id INT PRIMARY KEY);
    INSERT INTO @p SELECT id FROM PETICION WHERE estudiante_id IN (SELECT id FROM @u);
    DECLARE @x TABLE (id INT PRIMARY KEY);
    INSERT INTO @x SELECT id FROM OFERTA_X_PETICION WHERE oferta_id IN (SELECT id FROM @o) OR peticion_id IN (SELECT id FROM @p);
    DECLARE @l TABLE (id INT PRIMARY KEY);
    INSERT INTO @l SELECT id FROM LOTE_FISICO WHERE oferta_id IN (SELECT id FROM @o);
    DECLARE @d TABLE (id INT PRIMARY KEY);
    INSERT INTO @d SELECT id FROM DESTINO_LOCAL WHERE oferta_id IN (SELECT id FROM @o);
    DECLARE @m TABLE (id INT PRIMARY KEY, evidencia INT);
    INSERT INTO @m SELECT id, evidencia_id FROM MOVIMIENTO WHERE oferta_x_peticion_id IN (SELECT id FROM @x) OR destino_local_id IN (SELECT id FROM @d);
    DECLARE @e TABLE (id INT PRIMARY KEY);
    INSERT INTO @e SELECT DISTINCT evidencia FROM @m;
    INSERT INTO @e SELECT foto_id FROM OFERTA WHERE id IN (SELECT id FROM @o) AND foto_id IS NOT NULL AND foto_id NOT IN (SELECT id FROM @e);
    INSERT INTO @e SELECT id FROM EVIDENCIA WHERE subida_por IN (SELECT id FROM @u) AND id NOT IN (SELECT id FROM @e);

    -- Romper referencias circulares lote <-> movimiento <-> intento.
    UPDATE MOVIMIENTO SET lote_id = NULL WHERE id IN (SELECT id FROM @m) OR lote_id IN (SELECT id FROM @l);
    UPDATE LOTE_FISICO SET recepcion_movimiento_id = NULL, intento_origen_id = NULL WHERE id IN (SELECT id FROM @l);
    UPDATE OFERTA_X_PETICION SET lote_id = NULL WHERE id IN (SELECT id FROM @x);
    UPDATE OFERTA SET foto_id = NULL WHERE id IN (SELECT id FROM @o);

    DELETE FROM TAREA WHERE asignacion_id IN (SELECT id FROM @x) OR lote_id IN (SELECT id FROM @l)
                         OR destino_local_id IN (SELECT id FROM @d) OR resuelta_por IN (SELECT id FROM @u);
    DELETE c FROM CORREO_SALIDA c JOIN NOTIFICACION n ON n.id = c.notificacion_id
     WHERE n.usuario_id IN (SELECT id FROM @u)
        OR (n.entidad = 'ASIGNACION' AND n.entidad_id IN (SELECT id FROM @x))
        OR (n.entidad = 'LOCAL' AND n.entidad_id IN (SELECT id FROM @d))
        OR (n.entidad = 'LOTE' AND n.entidad_id IN (SELECT id FROM @l))
        OR (n.entidad = 'OFERTA' AND n.entidad_id IN (SELECT id FROM @o))
        OR (n.entidad = 'PETICION' AND n.entidad_id IN (SELECT id FROM @p));
    DELETE n FROM NOTIFICACION n
     WHERE n.usuario_id IN (SELECT id FROM @u)
        OR (n.entidad = 'ASIGNACION' AND n.entidad_id IN (SELECT id FROM @x))
        OR (n.entidad = 'LOCAL' AND n.entidad_id IN (SELECT id FROM @d))
        OR (n.entidad = 'LOTE' AND n.entidad_id IN (SELECT id FROM @l))
        OR (n.entidad = 'OFERTA' AND n.entidad_id IN (SELECT id FROM @o))
        OR (n.entidad = 'PETICION' AND n.entidad_id IN (SELECT id FROM @p));
    DELETE FROM MOVIMIENTO WHERE id IN (SELECT id FROM @m);
    DELETE FROM DESTINO_LOCAL WHERE id IN (SELECT id FROM @d);
    DELETE FROM OFERTA_X_PETICION WHERE id IN (SELECT id FROM @x);
    DELETE FROM LOTE_FISICO WHERE id IN (SELECT id FROM @l);
    DELETE FROM HISTORIAL_ESTADO
     WHERE actor_id IN (SELECT id FROM @u)
        OR (entidad = 'OFERTA' AND entidad_id IN (SELECT id FROM @o))
        OR (entidad = 'PETICION' AND entidad_id IN (SELECT id FROM @p))
        OR (entidad = 'ASIGNACION' AND entidad_id IN (SELECT id FROM @x))
        OR (entidad = 'LOTE' AND entidad_id IN (SELECT id FROM @l))
        OR (entidad = 'LOCAL' AND entidad_id IN (SELECT id FROM @d))
        OR (entidad = 'USUARIO' AND entidad_id IN (SELECT id FROM @u));
    DELETE FROM OFERTA WHERE id IN (SELECT id FROM @o) AND oferta_origen_id IS NOT NULL;
    DELETE FROM OFERTA WHERE id IN (SELECT id FROM @o);
    DELETE FROM PETICION WHERE id IN (SELECT id FROM @p);
    DELETE FROM EVIDENCIA WHERE id IN (SELECT id FROM @e);
    DELETE FROM CARACTERIZACION WHERE usuario_id IN (SELECT id FROM @u);
    DELETE FROM USUARIO_ROL WHERE usuario_id IN (SELECT id FROM @u);
    DELETE FROM USUARIO WHERE id IN (SELECT id FROM @u);`);
}

async function sembrar(tx) {
  const req = () => new sql.Request(tx);
  const ids = {};
  for (const u of USUARIOS) {
    const r = await req()
      .input('sub', u.sub).input('email', u.email).input('nombre', u.nombre).input('perfil', u.perfil)
      .query(`INSERT INTO USUARIO (google_sub, email, nombre, perfil) OUTPUT INSERTED.id VALUES (@sub, @email, @nombre, @perfil)`);
    ids[u.sub] = r.recordset[0].id;
    if (u.rol) {
      await req().input('u', ids[u.sub]).input('rol', u.rol).query(`INSERT INTO USUARIO_ROL (usuario_id, rol) VALUES (@u, @rol)`);
    }
    if (u.respuestas) {
      // Caracterizacion: la opcion elegida por pregunta se indica por su orden.
      const opciones = await req().query(`
        SELECT p.id AS pregunta, p.orden AS po, p.peso, o.id AS opcion, o.orden AS oo, o.puntaje
        FROM PREGUNTA_CARACTERIZACION p JOIN OPCION_CARACTERIZACION o ON o.pregunta_id = p.id WHERE p.activa = 1`);
      const elegidas = u.respuestas.map((orden, i) => opciones.recordset.find((x) => x.po === i + 1 && x.oo === orden)).filter(Boolean);
      const total = elegidas.reduce((s, x) => s + Number(x.puntaje) * Number(x.peso), 0) / elegidas.reduce((s, x) => s + Number(x.peso), 0);
      const c = await req().input('u', ids[u.sub]).input('g', u.sisben).input('t', sql.Decimal(7, 5), Number(total.toFixed(5)))
        .query(`INSERT INTO CARACTERIZACION (usuario_id, grupo_sisben, puntaje_total) OUTPUT INSERTED.id VALUES (@u, @g, @t)`);
      for (const x of elegidas) {
        await req().input('c', c.recordset[0].id).input('p', x.pregunta).input('o', x.opcion)
          .query(`INSERT INTO RESPUESTA_CARACTERIZACION (caracterizacion_id, pregunta_id, opcion_id) VALUES (@c, @p, @o)`);
      }
    }
  }
  const cat = async (nombre) => (await req().input('n', nombre).query(`SELECT id FROM CATEGORIA WHERE nombre = @n`)).recordset[0].id;
  const ROPA = await cat('Ropa y calzado');
  const TEC = await cat('Tecnologia');
  const UTIL = await cat('Utiles escolares');
  const aux = ids['demo-aux'];

  const oferta = async (o) => {
    const r = await req()
      .input('d', ids[o.donador]).input('c', o.cat).input('n', o.nombre).input('desc', o.desc).input('q', o.cantidad)
      .input('e', o.estado).input('ec', o.conservacion).input('m', sql.Decimal(9, 2), o.medida ?? null)
      .input('rp', o.estado === 'APROBADA' ? aux : null).input('re', o.estado === 'APROBADA' ? hace(o.dias - 1) : null)
      .input('cr', hace(o.dias))
      .query(`INSERT INTO OFERTA (donador_id, categoria_id, nombre_producto, descripcion, cantidad, estado, estado_conservacion, medida, revisada_por, revisada_en, creada_en)
              OUTPUT INSERTED.id VALUES (@d, @c, @n, @desc, @q, @e, @ec, @m, @rp, @re, @cr)`);
    return r.recordset[0].id;
  };
  const peticion = async (p) => {
    const r = await req()
      .input('s', ids[p.est]).input('c', p.cat).input('desc', p.desc).input('e', p.estado)
      .input('em', p.estadoMin ?? 1).input('mi', sql.Decimal(9, 2), p.min ?? null).input('ma', sql.Decimal(9, 2), p.max ?? null)
      .input('rp', p.estado === 'APROBADA' ? aux : null).input('re', p.estado === 'APROBADA' ? hace(p.dias - 1) : null)
      .input('cr', hace(p.dias))
      .query(`INSERT INTO PETICION (estudiante_id, categoria_id, descripcion, estado, estado_minimo, medida_min, medida_max, revisada_por, revisada_en, creada_en)
              OUTPUT INSERTED.id VALUES (@s, @c, @desc, @e, @em, @mi, @ma, @rp, @re, @cr)`);
    return r.recordset[0].id;
  };

  // Ofertas (ficticias)
  const O1 = await oferta({ donador: 'demo-don1', cat: ROPA, nombre: 'Chaqueta impermeable [DEMO]', desc: 'Chaqueta impermeable talla M, uso de un semestre.', cantidad: 3, estado: 'APROBADA', conservacion: 4, medida: 3, dias: 12 });
  const O2 = await oferta({ donador: 'demo-don2', cat: TEC, nombre: 'Portatil usado [DEMO]', desc: 'Portatil de 8 GB de RAM, bateria con buena duracion.', cantidad: 1, estado: 'APROBADA', conservacion: 3, dias: 30 });
  const O3 = await oferta({ donador: 'demo-don1', cat: UTIL, nombre: 'Calculadora cientifica [DEMO]', desc: 'Calculadoras cientificas nuevas en su empaque.', cantidad: 5, estado: 'APROBADA', conservacion: 5, dias: 40 });
  await oferta({ donador: 'demo-don2', cat: ROPA, nombre: 'Zapatos deportivos [DEMO]', desc: 'Zapatos deportivos con desgaste visible, talla grande.', cantidad: 2, estado: 'PENDIENTE_APROBACION', conservacion: 2, medida: 5, dias: 1 });

  // Peticiones (ficticias). En Ropa: 2 compatibles con la chaqueta y 2 incompatibles.
  await peticion({ est: 'demo-est1', cat: ROPA, desc: 'Necesito una chaqueta para la temporada de lluvias [DEMO]', estado: 'APROBADA', estadoMin: 3, min: 2, max: 4, dias: 60 });
  await peticion({ est: 'demo-est2', cat: ROPA, desc: 'Necesito ropa abrigada para ir a clase [DEMO]', estado: 'APROBADA', estadoMin: 1, dias: 30 });
  await peticion({ est: 'demo-est3', cat: ROPA, desc: 'Necesito una chaqueta nueva para practicas [DEMO]', estado: 'APROBADA', estadoMin: 5, dias: 45 });
  await peticion({ est: 'demo-est4', cat: ROPA, desc: 'Necesito una chaqueta talla grande [DEMO]', estado: 'APROBADA', estadoMin: 1, min: 5, max: 7, dias: 10 });
  const P5 = await peticion({ est: 'demo-est1', cat: UTIL, desc: 'Necesito una calculadora cientifica para calculo [DEMO]', estado: 'APROBADA', dias: 50 });
  const P6 = await peticion({ est: 'demo-est3', cat: TEC, desc: 'Necesito un portatil para programar [DEMO]', estado: 'APROBADA', estadoMin: 3, dias: 35 });
  await peticion({ est: 'demo-est2', cat: UTIL, desc: 'Necesito una calculadora para estadistica [DEMO]', estado: 'APROBADA', dias: 20 });
  await peticion({ est: 'demo-est4', cat: UTIL, desc: 'Necesito utiles para el semestre [DEMO]', estado: 'PENDIENTE_APROBACION', dias: 2 });

  // Intento ASIGNADO hace 25 dias: el plazo de 10 dias habiles del donador ya vencio -> DEFINIR_ESTADO.
  await req().input('o', O3).input('p', P5).input('a', aux).input('f', hace(25))
    .query(`INSERT INTO OFERTA_X_PETICION (oferta_id, peticion_id, cantidad_asignada, estado, asignada_por, asignada_en, origen)
            VALUES (@o, @p, 1, 'ASIGNADO', @a, @f, 'DONADOR')`);

  // Intento EN_CUSTODIA desde hace 8 dias (portatil): el plazo de recogida vencio -> DEFINIR_ESTADO.
  // La recepcion necesita foto: PNG minimo de 1x1 generado aqui (ficticio).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const ev = await req().input('c', sql.VarBinary(sql.MAX), png).input('t', png.length).input('u', aux)
    .input('h', require('crypto').createHash('sha256').update(png).digest('hex'))
    .query(`INSERT INTO EVIDENCIA (contenido, mime, tamano_bytes, hash_sha256, nombre_original, subida_por)
            OUTPUT INSERTED.id VALUES (@c, 'image/png', @t, @h, 'recepcion-demo.png', @u)`);
  const x2 = await req().input('o', O2).input('p', P6).input('a', aux).input('f', hace(12)).input('r', hace(8))
    .query(`INSERT INTO OFERTA_X_PETICION (oferta_id, peticion_id, cantidad_asignada, estado, asignada_por, asignada_en, recibida_en, custodia_desde, origen)
            OUTPUT INSERTED.id VALUES (@o, @p, 1, 'EN_CUSTODIA', @a, @f, @r, @r, 'DONADOR')`);
  const mov = await req().input('x', x2.recordset[0].id).input('e', ev.recordset[0].id).input('a', aux).input('r', hace(8))
    .query(`INSERT INTO MOVIMIENTO (oferta_x_peticion_id, tipo, cantidad, nombre_contraparte, evidencia_id, registrado_por, registrado_en)
            OUTPUT INSERTED.id VALUES (@x, 'RECEPCION', 1, 'Persona ficticia (demo)', @e, @a, @r)`);
  const lote = await req().input('o', O2).input('x', x2.recordset[0].id).input('m', mov.recordset[0].id).input('r', hace(8))
    .query(`INSERT INTO LOTE_FISICO (oferta_id, cantidad, ubicacion, origen, intento_origen_id, recepcion_movimiento_id, creado_en)
            OUTPUT INSERTED.id VALUES (@o, 1, 'EN_LIS', 'RECEPCION_ASIGNACION', @x, @m, @r)`);
  await req().input('l', lote.recordset[0].id).input('m', mov.recordset[0].id).query(`UPDATE MOVIMIENTO SET lote_id = @l WHERE id = @m`);
  await req().input('l', lote.recordset[0].id).input('x', x2.recordset[0].id).query(`UPDATE OFERTA_X_PETICION SET lote_id = @l WHERE id = @x`);

  return { usuarios: ids, ofertas: { O1, O2, O3 }, peticiones: { P5, P6 } };
}

(async () => {
  const soloBorrar = process.argv.includes('--borrar');
  console.log(`Destino: ${destinoLegible()}`);
  const pool = await conectar();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await borrar(tx);
    const r = soloBorrar ? null : await sembrar(tx);
    await tx.commit();
    console.log(soloBorrar ? 'Datos demo borrados.' : 'Escenario demo restaurado.');
    if (r) console.log(JSON.stringify(r));
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    await pool.close();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
