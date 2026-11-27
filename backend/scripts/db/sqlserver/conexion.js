/**
 * Conexion compartida por las herramientas de BD (verificar, respaldar,
 * migrar, sembrar demo). Lee backend/.env SIN imprimir credenciales.
 *
 * Proteccion: solo opera sobre la base cuyo nombre esta en
 * BD_EXPERIMENTAL_PERMITIDA (por defecto "LisDona"). Cualquier otro nombre
 * aborta antes de conectar.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
const sql = require('mssql');

const PERMITIDA = process.env.BD_EXPERIMENTAL_PERMITIDA || 'LisDona';

function configuracion(baseDatos) {
  const db = baseDatos || process.env.DB_NAME || 'LisDona';
  return {
    server: process.env.DB_HOST || 'localhost',
    port: process.env.DB_INSTANCE ? undefined : Number(process.env.DB_PORT) || 1433,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: db,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERT !== 'false',
      instanceName: process.env.DB_INSTANCE || undefined,
      enableArithAbort: true,
    },
    requestTimeout: 120000,
  };
}

/** Conecta a la base experimental o aborta si el nombre no es el permitido. */
async function conectar({ baseDatos, permitirMaster = false } = {}) {
  const cfg = configuracion(baseDatos);
  if (!(permitirMaster && cfg.database === 'master') && cfg.database !== PERMITIDA) {
    throw new Error(`Base "${cfg.database}" no autorizada. Solo se opera sobre "${PERMITIDA}".`);
  }
  return sql.connect(cfg);
}

/** Datos de destino legibles, sin credenciales. */
function destinoLegible(baseDatos) {
  const c = configuracion(baseDatos);
  return `${c.server}${c.options.instanceName ? '\\' + c.options.instanceName : ':' + c.port} / ${c.database}`;
}

module.exports = { sql, conectar, configuracion, destinoLegible, PERMITIDA };
