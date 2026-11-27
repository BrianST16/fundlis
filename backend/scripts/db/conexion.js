/**
 * Conexion compartida por las herramientas de BD PostgreSQL / Supabase
 * (migrar, usuario-app, verificar, demo). Lee backend/.env SIN imprimir
 * credenciales.
 *
 * Variables (ver backend/.env.example):
 *   DB_HOST, DB_PORT, DB_NAME          servidor (Session pooler de Supabase)
 *   DB_ADMIN_USER, DB_ADMIN_PASSWORD   administrador (postgres.<ref>): solo herramientas
 *   DB_USER, DB_PASSWORD               usuario de la aplicacion (lis_app.<ref>)
 *   DB_SSL_CA                          ruta al certificado CA del proyecto
 *   BD_PROYECTO_PERMITIDO              ref del proyecto sobre el que se permite operar
 *
 * Proteccion: las herramientas solo operan sobre el proyecto cuyo ref esta
 * en BD_PROYECTO_PERMITIDO. Cualquier otro destino aborta antes de conectar.
 * Asi una prueba de escritura nunca cae por error en otro proyecto.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const { Client } = require('pg');

const ESQUEMA = process.env.DB_SCHEMA || 'lis';
const LOCAL = /^(localhost|127\.0\.0\.1|::1)$/;

/** Ref del proyecto de Supabase, deducido del usuario (postgres.<ref>) o del host (db.<ref>.supabase.co). */
function refProyecto(host, usuario) {
  const porUsuario = /\.([a-z0-9]{20})$/.exec(usuario || '');
  if (porUsuario) return porUsuario[1];
  const porHost = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host || '');
  return porHost ? porHost[1] : null;
}

function ssl(host) {
  if (LOCAL.test(host)) return false;
  const ruta = process.env.DB_SSL_CA;
  if (!ruta) throw new Error('Falta DB_SSL_CA: la conexion a Supabase exige TLS verificado con el certificado del proyecto.');
  const archivo = path.isAbsolute(ruta) ? ruta : path.join(__dirname, '..', '..', ruta);
  return { ca: fs.readFileSync(archivo, 'utf8'), rejectUnauthorized: true };
}

function configuracion({ comoApp = false } = {}) {
  const host = process.env.DB_HOST || 'localhost';
  const user = comoApp ? process.env.DB_USER : process.env.DB_ADMIN_USER;
  const password = comoApp ? process.env.DB_PASSWORD : process.env.DB_ADMIN_PASSWORD;
  if (!user || !password) {
    throw new Error(comoApp ? 'Faltan DB_USER / DB_PASSWORD.' : 'Faltan DB_ADMIN_USER / DB_ADMIN_PASSWORD (usuario administrador).');
  }
  return {
    host,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'postgres',
    user,
    password,
    ssl: ssl(host),
    application_name: 'lis-dona-herramientas',
    statement_timeout: 120_000,
  };
}

/** Conecta (como administrador por defecto) o aborta si el destino no es el permitido. */
async function conectar(opciones = {}) {
  const cfg = configuracion(opciones);
  if (!LOCAL.test(cfg.host)) {
    const permitido = process.env.BD_PROYECTO_PERMITIDO;
    const ref = refProyecto(cfg.host, cfg.user);
    if (!permitido) throw new Error('Falta BD_PROYECTO_PERMITIDO (ref del proyecto de Supabase sobre el que se permite operar).');
    if (ref !== permitido) {
      throw new Error(`Proyecto "${ref ?? 'desconocido'}" no autorizado. Solo se opera sobre "${permitido}".`);
    }
  }
  const cliente = new Client(cfg);
  await cliente.connect();
  return cliente;
}

/** Destino legible, sin credenciales. */
function destinoLegible(opciones = {}) {
  const c = configuracion(opciones);
  const ref = refProyecto(c.host, c.user);
  return `${c.host}:${c.port} / ${c.database} / esquema ${ESQUEMA}${ref ? ` / proyecto ${ref}` : ''} (usuario ${c.user.split('.')[0]})`;
}

module.exports = { conectar, configuracion, destinoLegible, refProyecto, ESQUEMA };
