import * as fs from 'fs';
import * as path from 'path';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

type Leer = (clave: string) => string | undefined;

const LOCAL = /^(localhost|127\.0\.0\.1|::1)$/;

/**
 * TLS hacia la BD (D-68). Fuera de localhost es OBLIGATORIO y verificado
 * contra el certificado CA del proyecto de Supabase:
 *   DB_SSL_CA_PEM  contenido del certificado (comodo en el hosting), o
 *   DB_SSL_CA      ruta al archivo, relativa a backend/.
 * Sin certificado, el backend no arranca: nunca se conecta sin verificar.
 */
export function sslBaseDatos(leer: Leer, host: string): false | { ca: string; rejectUnauthorized: true } {
  if (LOCAL.test(host)) return false;
  const pem = leer('DB_SSL_CA_PEM')?.replace(/\\n/g, '\n');
  if (pem) return { ca: pem, rejectUnauthorized: true };
  const ruta = leer('DB_SSL_CA');
  if (!ruta) {
    throw new Error('Falta DB_SSL_CA o DB_SSL_CA_PEM: la conexión a la base de datos exige TLS verificado.');
  }
  const archivo = path.isAbsolute(ruta) ? ruta : path.join(process.cwd(), ruta);
  return { ca: fs.readFileSync(archivo, 'utf8'), rejectUnauthorized: true };
}

/** Opciones de TypeORM para PostgreSQL / Supabase con el usuario de mínimo privilegio. */
export function opcionesBaseDatos(leer: Leer): TypeOrmModuleOptions {
  const host = leer('DB_HOST') || 'localhost';
  return {
    type: 'postgres',
    host,
    port: Number(leer('DB_PORT')) || 5432,
    username: leer('DB_USER'),
    password: leer('DB_PASSWORD'),
    database: leer('DB_NAME') || 'postgres',
    schema: leer('DB_SCHEMA') || 'lis',
    ssl: sslBaseDatos(leer, host),
    // El esquema lo crean las migraciones de db/postgres. Nunca se
    // sincroniza: TypeORM no altera tablas (y lis_app no tiene DDL).
    synchronize: false,
    migrationsRun: false,
    autoLoadEntities: true,
    logging: leer('NODE_ENV') !== 'production' ? ['error', 'warn'] : ['error'],
    applicationName: 'lis-dona-api',
    extra: {
      // El pooler de Supabase limita las conexiones por proyecto.
      max: Number(leer('DB_POOL_MAX')) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    },
  };
}
