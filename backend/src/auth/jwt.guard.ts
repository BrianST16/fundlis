import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Rol } from '../common/enums';
import { AuthService } from './auth.service';
import { PayloadJwt, UsuarioActual } from './auth.types';
import { CLAVE_PUBLICO } from './decoradores';

/**
 * Guard global. Exige un Bearer token propio de la plataforma salvo en
 * las rutas marcadas con @Publico() (catalogo anonimo e inicio de sesion).
 *
 * El JWT solo prueba QUIEN es el usuario. Su estado (activo/bloqueado),
 * su perfil y sus roles se releen de la BD en cada peticion, para que un
 * bloqueo o una revocacion de rol surtan efecto de inmediato y no hasta
 * que expire el token (hallazgo R3-a de la auditoria de Etapa A).
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const req = ctx.switchToHttp().getRequest();
    const cabecera: string = req.headers?.authorization ?? '';
    const [tipo, token] = cabecera.split(' ');

    if (!token || tipo !== 'Bearer') {
      if (esPublico) return true;
      throw new UnauthorizedException('Falta el token de sesion.');
    }

    let payload: PayloadJwt;
    try {
      payload = await this.jwt.verifyAsync<PayloadJwt>(token);
    } catch {
      // En una ruta publica un token invalido no bloquea: se sigue como invitado.
      if (esPublico) return true;
      throw new UnauthorizedException('La sesion expiro o el token no es valido.');
    }

    let vigente: PayloadJwt;
    try {
      vigente = await this.auth.perfilVigente(payload.sub);
    } catch (e) {
      // Cuenta bloqueada o inexistente: no es un error del servidor, es una
      // sesion que ya no debe tener efecto. Otros errores (p. ej. BD caida)
      // se propagan para no confundirlos con un problema de credenciales.
      if (e instanceof ForbiddenException) {
        if (esPublico) return true;
        throw new UnauthorizedException('La cuenta no esta disponible. Inicia sesion de nuevo.');
      }
      throw e;
    }

    const roles = vigente.roles ?? [];
    const usuario: UsuarioActual = {
      ...vigente,
      roles,
      esAuxiliar: roles.includes(Rol.AUXILIAR_LIS),
      esAdministrador: roles.includes(Rol.ADMINISTRADOR),
      esPersonalLis: roles.includes(Rol.AUXILIAR_LIS) || roles.includes(Rol.ADMINISTRADOR),
    };
    req.usuario = usuario;
    return true;
  }
}
