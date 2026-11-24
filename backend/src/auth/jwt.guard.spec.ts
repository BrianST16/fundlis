import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Perfil, Rol } from '../common/enums';
import { JwtGuard } from './jwt.guard';

/** Contexto HTTP minimo para ejecutar el guard sin levantar Nest. */
function contexto(authorization?: string) {
  const req: any = { headers: authorization ? { authorization } : {} };
  const ctx: any = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }),
  };
  return { req, ctx };
}

const payloadToken = {
  sub: 7,
  email: 'donador.ficticio@example.com',
  nombre: 'Donador Ficticio',
  perfil: Perfil.DONADOR,
  // El token aun dice que es auxiliar...
  roles: [Rol.AUXILIAR_LIS],
};

function crearGuard(opciones: {
  publico?: boolean;
  tokenValido?: boolean;
  vigente?: any;
  errorVigente?: Error;
}) {
  const jwt: any = {
    verifyAsync: jest.fn(async () => {
      if (opciones.tokenValido === false) throw new Error('jwt expired');
      return payloadToken;
    }),
  };
  const reflector: any = { getAllAndOverride: jest.fn(() => opciones.publico ?? false) };
  const auth: any = {
    perfilVigente: jest.fn(async () => {
      if (opciones.errorVigente) throw opciones.errorVigente;
      return opciones.vigente;
    }),
  };
  return { guard: new JwtGuard(jwt, reflector, auth), auth };
}

describe('JwtGuard (revalidacion contra la BD)', () => {
  it('sin token en ruta privada responde 401', async () => {
    const { guard } = crearGuard({});
    const { ctx } = contexto();
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sin token en ruta publica deja pasar como invitado', async () => {
    const { guard } = crearGuard({ publico: true });
    const { ctx, req } = contexto();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.usuario).toBeUndefined();
  });

  it('token invalido en ruta privada responde 401', async () => {
    const { guard } = crearGuard({ tokenValido: false });
    const { ctx } = contexto('Bearer abc');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usa los roles VIGENTES de la BD, no los del token (rol revocado)', async () => {
    const { guard, auth } = crearGuard({
      vigente: { ...payloadToken, roles: [] }, // el administrador le revoco el rol
    });
    const { ctx, req } = contexto('Bearer token-firmado');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(auth.perfilVigente).toHaveBeenCalledWith(7);
    expect(req.usuario.roles).toEqual([]);
    expect(req.usuario.esPersonalLis).toBe(false);
  });

  it('usuario bloqueado despues de emitir el token: 401 en ruta privada', async () => {
    const { guard } = crearGuard({
      errorVigente: new ForbiddenException('La cuenta no esta disponible.'),
    });
    const { ctx } = contexto('Bearer token-firmado');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usuario bloqueado en ruta publica: continua como invitado, sin identidad', async () => {
    const { guard } = crearGuard({
      publico: true,
      errorVigente: new ForbiddenException('La cuenta no esta disponible.'),
    });
    const { ctx, req } = contexto('Bearer token-firmado');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.usuario).toBeUndefined();
  });

  it('un error de infraestructura (BD caida) no se disfraza de 401', async () => {
    const { guard } = crearGuard({ errorVigente: new Error('Connection lost') });
    const { ctx } = contexto('Bearer token-firmado');
    await expect(guard.canActivate(ctx)).rejects.toThrow('Connection lost');
  });

  it('administrador vigente queda marcado como personal LIS', async () => {
    const { guard } = crearGuard({
      vigente: { ...payloadToken, roles: [Rol.ADMINISTRADOR] },
    });
    const { ctx, req } = contexto('Bearer token-firmado');
    await guard.canActivate(ctx);
    expect(req.usuario.esAdministrador).toBe(true);
    expect(req.usuario.esPersonalLis).toBe(true);
    expect(req.usuario.esAuxiliar).toBe(false);
    expect(req.usuario.esSuperusuario).toBe(false);
  });

  it('D-45: superusuario vigente tiene acceso total (cuenta como administrador y personal LIS)', async () => {
    const { guard } = crearGuard({
      vigente: { ...payloadToken, roles: [Rol.SUPERUSUARIO] },
    });
    const { ctx, req } = contexto('Bearer token-firmado');
    await guard.canActivate(ctx);
    expect(req.usuario.esSuperusuario).toBe(true);
    expect(req.usuario.esAdministrador).toBe(true);
    expect(req.usuario.esPersonalLis).toBe(true);
  });
});
