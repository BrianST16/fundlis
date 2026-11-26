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
      throw new UnauthorizedException('Falta el token de sesión.');
    }

    let payload: PayloadJwt;
    try {
      payload = await this.jwt.verifyAsync<PayloadJwt>(token);
    } catch {
      // En una ruta publica un token invalido no bloquea: se sigue como invitado.
      if (esPublico) return true;
      throw new UnauthorizedException('La sesión expiro o el token no es válido.');
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
        throw new UnauthorizedException('La cuenta no está disponible. Inicia sesión de nuevo.');
      }
      throw e;
    }

    const roles = vigente.roles ?? [];
    // SUPERUSUARIO tiene acceso total: cuenta como administrador (y por
    // tanto como personal LIS) en todos los controles existentes.
    const esSuperusuario = roles.includes(Rol.SUPERUSUARIO);
    const esAdministrador = esSuperusuario || roles.includes(Rol.ADMINISTRADOR);
    const usuario: UsuarioActual = {
      ...vigente,
      roles,
      esSuperusuario,
      esAuxiliar: roles.includes(Rol.AUXILIAR_LIS),
      esAdministrador,
      esPersonalLis: esAdministrador || roles.includes(Rol.AUXILIAR_LIS),
    };
    req.usuario = usuario;
    return true;
  }
}
