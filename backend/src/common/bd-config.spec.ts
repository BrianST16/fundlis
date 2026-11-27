import { opcionesBaseDatos, sslBaseDatos } from './bd-config';
import { esViolacionUnica } from './errores-bd';

/** D-68: conexion a PostgreSQL / Supabase. */
describe('Base de datos PostgreSQL (D-68)', () => {
  const leer = (vars: Record<string, string>) => (k: string) => vars[k];

  it('fuera de localhost exige TLS verificado: sin certificado no arranca', () => {
    expect(() => sslBaseDatos(leer({}), 'aws-1-us-east-2.pooler.supabase.com')).toThrow(/TLS verificado/);
  });

  it('acepta el certificado como contenido (hosting) y lo verifica', () => {
    const ssl = sslBaseDatos(leer({ DB_SSL_CA_PEM: '-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----' }), 'db.ejemplo.com');
    expect(ssl).toEqual({ ca: '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----', rejectUnauthorized: true });
  });

  it('en localhost no usa TLS (Postgres local de desarrollo)', () => {
    expect(sslBaseDatos(leer({}), 'localhost')).toBe(false);
  });

  it('usa el esquema lis, sin sincronizar ni migrar desde TypeORM', () => {
    const o = opcionesBaseDatos(leer({ DB_HOST: 'localhost', DB_USER: 'lis_app', DB_PASSWORD: 'x' })) as any;
    expect(o).toMatchObject({ type: 'postgres', schema: 'lis', synchronize: false, migrationsRun: false, port: 5432, ssl: false });
  });

  it('reconoce la violacion de unicidad de Postgres (23505) para la idempotencia', () => {
    expect(esViolacionUnica({ code: '23505' })).toBe(true);
    expect(esViolacionUnica({ driverError: { code: '23505' } })).toBe(true);
    expect(esViolacionUnica({ code: '23503' })).toBe(false); // otra restriccion: no se oculta
    expect(esViolacionUnica(new Error('x'))).toBe(false);
    expect(esViolacionUnica(null)).toBe(false);
  });
});
