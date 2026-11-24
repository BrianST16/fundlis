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
  /** Rol de mantenimiento. Implica esAdministrador. */
  esSuperusuario: boolean;
  esAuxiliar: boolean;
  /** true para ADMINISTRADOR y para SUPERUSUARIO. */
  esAdministrador: boolean;
  esPersonalLis: boolean;
}
