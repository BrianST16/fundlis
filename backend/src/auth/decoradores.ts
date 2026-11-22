import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Perfil, Rol } from '../common/enums';
import { UsuarioActual } from './auth.types';

export const CLAVE_PUBLICO = 'es_publico';
export const CLAVE_ROLES = 'roles_requeridos';
export const CLAVE_PERFILES = 'perfiles_requeridos';

/** Marca una ruta accesible sin token (rol Invitado). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Exige al menos uno de los roles administrativos indicados. */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

/** Exige que el perfil del usuario sea uno de los indicados. */
export const Perfiles = (...perfiles: Perfil[]) => SetMetadata(CLAVE_PERFILES, perfiles);

/** Inyecta el usuario autenticado en el controlador. */
export const Actual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioActual =>
    ctx.switchToHttp().getRequest().usuario,
);
