import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Like, Repository } from 'typeorm';
import { EntidadHistorial, Perfil, Rol } from '../common/enums';
import { HistorialService } from '../common/historial.service';
import { Usuario, UsuarioRol } from '../entities';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioRol) private readonly roles: Repository<UsuarioRol>,
    private readonly historial: HistorialService,
    private readonly dataSource: DataSource,
  ) {}

  async listar(filtro?: string) {
    const where = filtro
      ? [{ email: Like(`%${filtro}%`) }, { nombre: Like(`%${filtro}%`) }]
      : {};
    const lista = await this.usuarios.find({
      where: where as any,
      relations: { roles: true },
      order: { creadoEn: 'DESC' },
    });
    return lista.map((u) => ({
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      perfil: u.perfil,
      activo: !!u.activo,
      motivoBloqueo: u.motivoBloqueo,
      creadoEn: u.creadoEn,
      ultimoIngresoEn: u.ultimoIngresoEn,
      roles: (u.roles ?? []).map((r) => r.rol),
    }));
  }

  async detalle(id: number) {
    const u = await this.usuarios.findOne({ where: { id } });
    if (!u) throw new NotFoundException('El usuario no existe.');
    const roles = await this.roles.find({ where: { usuarioId: id } });
    return { ...u, roles: roles.map((r) => r.rol) };
  }

  /** Otorga un rol administrativo. Solo lo invoca un administrador. */
  async otorgarRol(usuarioId: number, rol: Rol, actorId: number) {
    const u = await this.usuarios.findOne({ where: { id: usuarioId } });
    if (!u) throw new NotFoundException('El usuario no existe.');

    // D-04: el auxiliar se registra con un correo no institucional. Los
    // perfiles ESTUDIANTE y auxiliar son excluyentes por cuenta (D-05).
    // El ADMINISTRADOR no se restringe aqui: su dominio sigue pendiente (P-03).
    if (rol === Rol.AUXILIAR_LIS && u.perfil !== Perfil.DONADOR) {
      throw new BadRequestException(
        'El rol AUXILIAR_LIS requiere una cuenta no institucional. Una cuenta de estudiante no puede ser auxiliar.',
      );
    }

    const existente = await this.roles.findOne({ where: { usuarioId, rol } });
    if (existente) throw new BadRequestException('El usuario ya tiene ese rol.');

    await this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(UsuarioRol);
      await repo.save(repo.create({ usuarioId, rol, asignadoPor: actorId }));
      await this.historial.registrar(
        {
          entidad: EntidadHistorial.USUARIO,
          entidadId: usuarioId,
          estadoAnterior: null,
          estadoNuevo: `ROL_${rol}`,
          actorId,
          motivo: 'Rol otorgado por un administrador',
        },
        mgr,
      );
    });

    return this.detalle(usuarioId);
  }

  /** Revoca un rol. Nunca deja la plataforma sin administradores. */
  async revocarRol(usuarioId: number, rol: Rol, actorId: number) {
    const fila = await this.roles.findOne({ where: { usuarioId, rol } });
    if (!fila) throw new NotFoundException('El usuario no tiene ese rol.');

    if (rol === Rol.ADMINISTRADOR) {
      const total = await this.roles.count({ where: { rol: Rol.ADMINISTRADOR } });
      if (total <= 1) {
        throw new BadRequestException(
          'No se puede revocar el ultimo administrador de la plataforma.',
        );
      }
    }

    await this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(UsuarioRol).delete({ usuarioId, rol });
      await this.historial.registrar(
        {
          entidad: EntidadHistorial.USUARIO,
          entidadId: usuarioId,
          estadoAnterior: `ROL_${rol}`,
          estadoNuevo: `SIN_ROL_${rol}`,
          actorId,
          motivo: 'Rol revocado por un administrador',
        },
        mgr,
      );
    });

    return this.detalle(usuarioId);
  }

  /** Baja logica: se bloquea el acceso, no se borra el historial. */
  async bloquear(usuarioId: number, motivo: string, actorId: number) {
    const u = await this.usuarios.findOne({ where: { id: usuarioId } });
    if (!u) throw new NotFoundException('El usuario no existe.');
    if (usuarioId === actorId) {
      throw new BadRequestException('No puedes bloquear tu propia cuenta.');
    }
    if (!u.activo) throw new BadRequestException('La cuenta ya esta bloqueada.');

    const esAdmin = await this.roles.findOne({
      where: { usuarioId, rol: Rol.ADMINISTRADOR },
    });
    if (esAdmin) {
      const total = await this.roles.count({ where: { rol: Rol.ADMINISTRADOR } });
      if (total <= 1) {
        throw new BadRequestException('No se puede bloquear al ultimo administrador.');
      }
    }

    u.activo = false;
    u.motivoBloqueo = motivo;
    await this.usuarios.save(u);
    await this.historial.registrar({
      entidad: EntidadHistorial.USUARIO,
      entidadId: usuarioId,
      estadoAnterior: 'ACTIVO',
      estadoNuevo: 'BLOQUEADO',
      actorId,
      motivo,
    });
    return this.detalle(usuarioId);
  }

  async desbloquear(usuarioId: number, actorId: number) {
    const u = await this.usuarios.findOne({ where: { id: usuarioId } });
    if (!u) throw new NotFoundException('El usuario no existe.');
    if (u.activo) throw new BadRequestException('La cuenta ya esta activa.');

    u.activo = true;
    u.motivoBloqueo = null;
    await this.usuarios.save(u);
    await this.historial.registrar({
      entidad: EntidadHistorial.USUARIO,
      entidadId: usuarioId,
      estadoAnterior: 'BLOQUEADO',
      estadoNuevo: 'ACTIVO',
      actorId,
      motivo: 'Desbloqueo por un administrador',
    });
    return this.detalle(usuarioId);
  }
}
