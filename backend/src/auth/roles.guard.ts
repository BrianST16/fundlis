import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Perfil, Rol } from '../common/enums';
import { UsuarioActual } from './auth.types';
import { CLAVE_PERFILES, CLAVE_ROLES } from './decoradores';

/**
 * Autorizacion por rol administrativo y por perfil.
 * Un ADMINISTRADOR hereda todo lo que puede hacer un AUXILIAR_LIS, y un
 * SUPERUSUARIO hereda todo lo del ADMINISTRADOR.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<Rol[]>(CLAVE_ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const perfilesRequeridos = this.reflector.getAllAndOverride<Perfil[]>(CLAVE_PERFILES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!rolesRequeridos?.length && !perfilesRequeridos?.length) return true;

    const usuario: UsuarioActual = ctx.switchToHttp().getRequest().usuario;
    if (!usuario) throw new ForbiddenException('Se requiere iniciar sesion.');

    if (rolesRequeridos?.length) {
      // esAdministrador ya incluye al SUPERUSUARIO (ver JwtGuard).
      const tiene = rolesRequeridos.some(
        (r) =>
          usuario.roles.includes(r) ||
          (r === Rol.AUXILIAR_LIS && usuario.esAdministrador) ||
          (r === Rol.ADMINISTRADOR && usuario.esAdministrador),
      );
      if (!tiene) {
        throw new ForbiddenException('Tu rol no permite esta operacion.');
      }
    }

    if (perfilesRequeridos?.length && !perfilesRequeridos.includes(usuario.perfil)) {
      throw new ForbiddenException(
        `Esta operacion es solo para el perfil ${perfilesRequeridos.join(' o ')}.`,
      );
    }

    return true;
  }
}
