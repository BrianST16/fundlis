import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EntidadHistorial, Perfil, Rol } from '../common/enums';
import { HistorialEstado, Usuario, UsuarioRol } from '../entities';
import { PayloadJwt } from './auth.types';
import { GoogleService, IdentidadGoogle } from './google.service';

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  private readonly dominioEstudiante: string;
  private readonly correosAdmin: string[];

  constructor(
    private readonly google: GoogleService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioRol) private readonly usuarioRoles: Repository<UsuarioRol>,
  ) {
    this.dominioEstudiante = (this.config.get<string>('DOMINIO_ESTUDIANTE') || 'udea.edu.co')
      .toLowerCase()
      .trim();
    this.correosAdmin = (this.config.get<string>('ADMIN_EMAILS') || '')
      .split(',')
      .map((c) => c.toLowerCase().trim())
      .filter(Boolean);
  }

  /**
   * El perfil se deduce del correo verificado por Google:
   *  - dominio institucional  -> ESTUDIANTE
   *  - cualquier otro dominio -> DONADOR
   * Los perfiles son excluyentes por cuenta, asi que quien quiera
   * participar como ambos debe usar dos cuentas de Google distintas.
   */
  private perfilSegunDominio(identidad: IdentidadGoogle): Perfil {
    const dominioCorreo = identidad.email.split('@')[1] ?? '';
    const esInstitucional =
      dominioCorreo === this.dominioEstudiante ||
      dominioCorreo.endsWith(`.${this.dominioEstudiante}`) ||
      identidad.dominioHospedado?.toLowerCase() === this.dominioEstudiante;
    return esInstitucional ? Perfil.ESTUDIANTE : Perfil.DONADOR;
  }

  /** Alta o actualizacion del usuario a partir del token verificado. */
  async iniciarSesion(idToken: string): Promise<{ token: string; usuario: PayloadJwt }> {
    const identidad = await this.google.verificar(idToken);
    const perfil = this.perfilSegunDominio(identidad);

    const usuario = await this.dataSource.transaction(async (mgr) => {
      const repoUsuario = mgr.getRepository(Usuario);
      const repoRol = mgr.getRepository(UsuarioRol);
      const repoHist = mgr.getRepository(HistorialEstado);

      let u = await repoUsuario.findOne({ where: { googleSub: identidad.sub } });

      if (!u) {
        // Un correo ya usado por otra cuenta de Google es un conflicto real.
        const porCorreo = await repoUsuario.findOne({ where: { email: identidad.email } });
        if (porCorreo) {
          throw new ForbiddenException(
            'Ese correo ya esta registrado con otra cuenta de Google.',
          );
        }
        u = repoUsuario.create({
          googleSub: identidad.sub,
          email: identidad.email,
          nombre: identidad.nombre,
          perfil,
          activo: true,
          ultimoIngresoEn: new Date(),
        });
        u = await repoUsuario.save(u);
        await repoHist.save(
          repoHist.create({
            entidad: EntidadHistorial.USUARIO,
            entidadId: u.id,
            estadoAnterior: null,
            estadoNuevo: `ALTA_${perfil}`,
            actorId: u.id,
            motivo: 'Primer inicio de sesion con Google',
          }),
        );
        this.log.log(`Usuario nuevo ${u.email} con perfil ${perfil}`);
      } else {
        u.nombre = identidad.nombre;
        u.ultimoIngresoEn = new Date();
        await repoUsuario.save(u);
      }

      if (!u.activo) {
        throw new ForbiddenException(
          `La cuenta esta bloqueada. Motivo: ${u.motivoBloqueo ?? 'no registrado'}`,
        );
      }

      // Bootstrap del administrador inicial: unico rol que no otorga otra
      // persona. Se apoya en el correo verificado del token.
      if (this.correosAdmin.includes(u.email)) {
        const yaEs = await repoRol.findOne({
          where: { usuarioId: u.id, rol: Rol.ADMINISTRADOR },
        });
        if (!yaEs) {
          await repoRol.save(
            repoRol.create({ usuarioId: u.id, rol: Rol.ADMINISTRADOR, asignadoPor: null }),
          );
          await repoHist.save(
            repoHist.create({
              entidad: EntidadHistorial.USUARIO,
              entidadId: u.id,
              estadoAnterior: null,
              estadoNuevo: 'ROL_ADMINISTRADOR',
              actorId: null,
              motivo: 'Administrador inicial definido por configuracion (ADMIN_EMAILS)',
            }),
          );
          this.log.warn(`Rol ADMINISTRADOR otorgado por configuracion a ${u.email}`);
        }
      }

      return u;
    });

    const roles = await this.rolesDe(usuario.id);
    const payload: PayloadJwt = {
      sub: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      perfil: usuario.perfil,
      roles,
    };

    return { token: await this.jwt.signAsync(payload), usuario: payload };
  }

  async rolesDe(usuarioId: number): Promise<Rol[]> {
    const filas = await this.usuarioRoles.find({ where: { usuarioId } });
    return filas.map((f) => f.rol);
  }

  /** Relee perfil y roles desde la BD (el JWT puede estar desactualizado). */
  async perfilVigente(usuarioId: number): Promise<PayloadJwt> {
    const u = await this.usuarios.findOne({ where: { id: usuarioId } });
    if (!u || !u.activo) {
      throw new ForbiddenException('La cuenta no esta disponible.');
    }
    return {
      sub: u.id,
      email: u.email,
      nombre: u.nombre,
      perfil: u.perfil,
      roles: await this.rolesDe(u.id),
    };
  }
}
