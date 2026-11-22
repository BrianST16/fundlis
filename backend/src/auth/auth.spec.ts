/**
 * R2: verificacion del ID token de Google en el servidor y perfil por
 * dominio. google-auth-library se reemplaza por un doble: no hay red ni BD.
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Perfil, Rol } from '../common/enums';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

const config = (valores: Record<string, string>) => ({ get: (k: string) => valores[k] }) as any;
const CLIENT_ID = 'cliente-ficticio.apps.googleusercontent.com';

describe('GoogleService.verificar', () => {
  const google = () => new GoogleService(config({ GOOGLE_CLIENT_ID: CLIENT_ID }));
  beforeEach(() => verifyIdToken.mockReset());

  it('sin GOOGLE_CLIENT_ID el servicio no arranca', () => {
    expect(() => new GoogleService(config({}))).toThrow('GOOGLE_CLIENT_ID');
  });

  it('firma, emisor, audiencia o expiracion invalidos -> 401', async () => {
    verifyIdToken.mockRejectedValue(new Error('Token used too late'));
    await expect(google().verificar('x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('valida contra la audiencia configurada', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 's1', email: 'a@example.com', email_verified: true, name: 'A' }),
    });
    await google().verificar('token');
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'token', audience: CLIENT_ID });
  });

  it('correo no verificado -> 401', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 's1', email: 'a@example.com', email_verified: false }),
    });
    await expect(google().verificar('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('normaliza el correo a minusculas', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 's1', email: '  Est.Ficticio@UdeA.edu.co ', email_verified: true, hd: 'udea.edu.co' }),
    });
    const r = await google().verificar('token');
    expect(r.email).toBe('est.ficticio@udea.edu.co');
    expect(r.dominioHospedado).toBe('udea.edu.co');
  });
});

describe('AuthService.iniciarSesion: perfil por dominio y bloqueo', () => {
  function crear(identidad: any, opc: { existente?: any; admins?: string } = {}) {
    const google: any = { verificar: jest.fn(async () => identidad) };
    const jwt: any = { signAsync: jest.fn(async () => 'jwt-propio') };
    const guardados: any[] = [];
    const repoUsuario = {
      findOne: jest.fn(async ({ where }: any) => (where.googleSub ? opc.existente ?? null : null)),
      create: (x: any) => x,
      save: jest.fn(async (x: any) => {
        guardados.push(x);
        return { id: 10, ...x };
      }),
    };
    const repoRol = { findOne: jest.fn(async () => null), create: (x: any) => x, save: jest.fn() };
    const repoHist = { create: (x: any) => x, save: jest.fn() };
    const mgr = {
      getRepository: (e: any) =>
        ({ Usuario: repoUsuario, UsuarioRol: repoRol, HistorialEstado: repoHist })[e.name],
    };
    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(mgr)) };
    const usuarioRoles: any = { find: jest.fn(async () => (opc.admins ? [{ rol: Rol.ADMINISTRADOR }] : [])) };
    const s = new AuthService(
      google,
      jwt,
      config({ DOMINIO_ESTUDIANTE: 'udea.edu.co', ADMIN_EMAILS: opc.admins ?? '' }),
      dataSource,
      {} as any,
      usuarioRoles,
    );
    return { s, guardados, repoRol };
  }

  it('correo @udea.edu.co verificado -> ESTUDIANTE', async () => {
    const { s } = crear({ sub: 'g1', email: 'est@udea.edu.co', nombre: 'E' });
    const r = await s.iniciarSesion('t');
    expect(r.usuario.perfil).toBe(Perfil.ESTUDIANTE);
    expect(r.token).toBe('jwt-propio');
  });

  it('correo no institucional -> DONADOR', async () => {
    const { s } = crear({ sub: 'g2', email: 'persona@gmail.com', nombre: 'P' });
    expect((await s.iniciarSesion('t')).usuario.perfil).toBe(Perfil.DONADOR);
  });

  it('un dominio que solo "contiene" udea.edu.co no es institucional', async () => {
    const { s } = crear({ sub: 'g3', email: 'x@udea.edu.co.falso.com', nombre: 'X' });
    expect((await s.iniciarSesion('t')).usuario.perfil).toBe(Perfil.DONADOR);
  });

  it('el perfil sale del token verificado, nunca del cliente', async () => {
    const { s, guardados } = crear({ sub: 'g4', email: 'p@gmail.com', nombre: 'P' });
    await s.iniciarSesion('t');
    expect(guardados[0].perfil).toBe(Perfil.DONADOR);
  });

  it('cuenta bloqueada -> 403', async () => {
    const { s } = crear(
      { sub: 'g5', email: 'b@gmail.com', nombre: 'B' },
      { existente: { id: 10, activo: false, motivoBloqueo: 'Prueba', email: 'b@gmail.com' } },
    );
    await expect(s.iniciarSesion('t')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ADMIN_EMAILS otorga ADMINISTRADOR al primer ingreso', async () => {
    const { s, repoRol } = crear({ sub: 'g6', email: 'admin@example.com', nombre: 'Adm' }, { admins: 'admin@example.com' });
    const r = await s.iniciarSesion('t');
    expect(repoRol.save).toHaveBeenCalledWith(expect.objectContaining({ rol: Rol.ADMINISTRADOR }));
    expect(r.usuario.roles).toEqual([Rol.ADMINISTRADOR]);
  });
});
