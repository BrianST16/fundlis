import { Perfil, Rol } from '../common/enums';

/** Contenido del JWT propio de la plataforma. */
export interface PayloadJwt {
  sub: number;
  email: string;
  nombre: string;
  perfil: Perfil;
  roles: Rol[];
}

/** Usuario autenticado tal como lo ve un controlador. */
export interface UsuarioActual extends PayloadJwt {
  esAuxiliar: boolean;
  esAdministrador: boolean;
  esPersonalLis: boolean;
}
