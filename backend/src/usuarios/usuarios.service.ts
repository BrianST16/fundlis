import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, ILike, Repository } from 'typeorm';
import { ASIGNACION_VIGENTE, EntidadHistorial, EstadoAsignacion, EstadoOferta, EstadoPeticion, Perfil, Rol } from '../common/enums';
import { HistorialService } from '../common/historial.service';
import { DestinoLocal, LoteFisico, Oferta, OfertaXPeticion, Peticion, Usuario, UsuarioRol } from '../entities';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioRol) private readonly roles: Repository<UsuarioRol>,
    private readonly historial: HistorialService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * D-64 (C2): mediaciones en proceso de una cuenta (como donador o estudiante):
   * asignaciones vigentes, devoluciones con el producto aun en el LIS y
   * destinos Local que esperan algo del donador.
   */
  async mediacionesEnCurso(usuarioId: number): Promise<{ asignaciones: number; devoluciones: number; local: number; total: number }> {
    const [asignaciones, devoluciones, local] = await Promise.all([
      this.dataSource
        .getRepository(OfertaXPeticion)
        .createQueryBuilder('x')
        .leftJoin('x.oferta', 'o')
        .leftJoin('x.peticion', 'p')
        .where('x.estado IN (:...vigentes)', { vigentes: ASIGNACION_VIGENTE })
        .andWhere('(o.donadorId = :u OR p.estudianteId = :u)', { u: usuarioId })
        .getCount(),
      this.dataSource
        .getRepository(OfertaXPeticion)
        .createQueryBuilder('x')
        .innerJoin('x.oferta', 'o')
        .innerJoin(LoteFisico, 'l', 'l.id = x.loteId')
        .where('x.estado = :dev', { dev: EstadoAsignacion.DEVOLUCION })
        .andWhere("l.ubicacion = 'EN_LIS'")
        .andWhere('o.donadorId = :u', { u: usuarioId })
        .getCount(),
      this.dataSource
        .getRepository(DestinoLocal)
        .createQueryBuilder('d')
        .innerJoin('d.oferta', 'o')
        .where('d.estado IN (:...pendientes)', { pendientes: ['ESPERA_RECEPCION', 'PROPUESTO_DONADOR', 'POR_DEVOLVER'] })
        .andWhere('o.donadorId = :u', { u: usuarioId })
        .getCount(),
    ]);
    return { asignaciones, devoluciones, local, total: asignaciones + devoluciones + local };
  }

  /**
   * D-64 (C2): al bloquear se cierran sus publicaciones abiertas. Ofertas:
   * pendientes -> CANCELADA, aprobadas -> CERRADA. Peticiones abiertas ->
   * CANCELADA (sin incumplimiento). Todo queda en el historial.
   */
  private async cerrarPublicacionesEn(
    mgr: EntityManager,
    usuarioId: number,
    motivo: string,
    actorId: number,
  ): Promise<{ ofertas: number; peticiones: number }> {
    const ahora = new Date();
    const repoO = mgr.getRepository(Oferta);
    const ofertas = await repoO.find({
      where: { donadorId: usuarioId, estado: In([EstadoOferta.PENDIENTE_APROBACION, EstadoOferta.APROBADA]) },
    });
    for (const o of ofertas) {
      const anterior = o.estado;
      o.estado = anterior === EstadoOferta.PENDIENTE_APROBACION ? EstadoOferta.CANCELADA : EstadoOferta.CERRADA;
      o.cerradaEn = ahora;
      await repoO.save(o);
      await this.historial.registrar(
        { entidad: EntidadHistorial.OFERTA, entidadId: o.id, estadoAnterior: anterior, estadoNuevo: o.estado, actorId, motivo },
        mgr,
      );
    }
    const repoP = mgr.getRepository(Peticion);
    const peticiones = await repoP.find({
      where: { estudianteId: usuarioId, estado: In([EstadoPeticion.PENDIENTE_APROBACION, EstadoPeticion.APROBADA]) },
    });
    for (const p of peticiones) {
      const anterior = p.estado;
      p.estado = EstadoPeticion.CANCELADA;
      p.cerradaEn = ahora;
      p.motivoCierre = motivo.slice(0, 400);
      await repoP.save(p);
      await this.historial.registrar(
        { entidad: EntidadHistorial.PETICION, entidadId: p.id, estadoAnterior: anterior, estadoNuevo: EstadoPeticion.CANCELADA, actorId, motivo },
        mgr,
      );
    }
    return { ofertas: ofertas.length, peticiones: peticiones.length };
  }

  async listar(filtro?: string) {
    // ILIKE: sin distinguir mayusculas. Los comodines que escriba el usuario
    // (% _ \) se escapan para que busque el texto tal cual.
    const patron = filtro ? `%${filtro.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : '';
    const where = filtro ? [{ email: ILike(patron) }, { nombre: ILike(patron) }] : {};
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

  /**
   * D-45: quien puede gestionar cada rol.
   *  - SUPERUSUARIO: nadie desde la API (solo script de BD).
   *  - ADMINISTRADOR: solo un SUPERUSUARIO.
   *  - AUXILIAR_LIS: cualquier administrador (o superusuario).
   * Se valida aqui, en el backend; ocultar botones en Angular no basta.
   */
  private validarGestionRol(rol: Rol, actorEsSuperusuario: boolean): void {
    if (rol === Rol.SUPERUSUARIO) {
      throw new ForbiddenException(
        'El rol SUPERUSUARIO solo se asigna o retira por script de mantenimiento.',
      );
    }
    if (rol === Rol.ADMINISTRADOR && !actorEsSuperusuario) {
      throw new ForbiddenException(
        'Solo un superusuario puede otorgar o quitar el rol ADMINISTRADOR.',
      );
    }
  }

  private quienActua(actorEsSuperusuario: boolean): string {
    return actorEsSuperusuario ? 'un superusuario' : 'un administrador';
  }

  /** Otorga un rol administrativo. Lo invoca un administrador o superusuario. */
  async otorgarRol(usuarioId: number, rol: Rol, actorId: number, actorEsSuperusuario = false) {
    this.validarGestionRol(rol, actorEsSuperusuario);

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
          motivo: `Rol otorgado por ${this.quienActua(actorEsSuperusuario)}`,
        },
        mgr,
      );
    });

    return this.detalle(usuarioId);
  }

  /** Revoca un rol. Nunca deja la plataforma sin administradores. */
  async revocarRol(usuarioId: number, rol: Rol, actorId: number, actorEsSuperusuario = false) {
    this.validarGestionRol(rol, actorEsSuperusuario);

    const fila = await this.roles.findOne({ where: { usuarioId, rol } });
    if (!fila) throw new NotFoundException('El usuario no tiene ese rol.');

    if (rol === Rol.ADMINISTRADOR) {
      const total = await this.roles.count({ where: { rol: Rol.ADMINISTRADOR } });
      if (total <= 1) {
        throw new BadRequestException(
          'No se puede revocar el último administrador de la plataforma.',
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
          motivo: `Rol revocado por ${this.quienActua(actorEsSuperusuario)}`,
        },
        mgr,
      );
    });

    return this.detalle(usuarioId);
  }

  /** Baja logica: se bloquea el acceso, no se borra el historial. */
  async bloquear(usuarioId: number, motivo: string, actorId: number, actorEsSuperusuario = false) {
    const u = await this.usuarios.findOne({ where: { id: usuarioId } });
    if (!u) throw new NotFoundException('El usuario no existe.');
    if (usuarioId === actorId) {
      throw new BadRequestException('No puedes bloquear tu propia cuenta.');
    }
    if (!u.activo) throw new BadRequestException('La cuenta ya está bloqueada.');

    // D-45: bloquear equivale a quitar todos los permisos, asi que sigue
    // las mismas reglas que la gestion de roles.
    const rolesObjetivo = (await this.roles.find({ where: { usuarioId } })).map((r) => r.rol);
    if (rolesObjetivo.includes(Rol.SUPERUSUARIO)) {
      throw new ForbiddenException(
        'Un superusuario no se bloquea desde la interfaz; usa el script de mantenimiento.',
      );
    }
    const esAdmin = rolesObjetivo.includes(Rol.ADMINISTRADOR);
    if (esAdmin && !actorEsSuperusuario) {
      throw new ForbiddenException('Solo un superusuario puede bloquear a un administrador.');
    }
    if (esAdmin) {
      const total = await this.roles.count({ where: { rol: Rol.ADMINISTRADOR } });
      if (total <= 1) {
        throw new BadRequestException('No se puede bloquear al último administrador.');
      }
    }

    // D-64 (C2): no se bloquea a quien tiene una mediacion en proceso; primero
    // hay que resolverla (asi nada queda a medias con una cuenta bloqueada).
    const enCurso = await this.mediacionesEnCurso(usuarioId);
    if (enCurso.total > 0) {
      const partes = [
        enCurso.asignaciones ? `${enCurso.asignaciones} asignación(es) en curso` : '',
        enCurso.devoluciones ? `${enCurso.devoluciones} devolución(es) pendiente(s)` : '',
        enCurso.local ? `${enCurso.local} destino(s) Local pendiente(s) con el donador` : '',
      ].filter(Boolean);
      throw new BadRequestException(
        `${u.nombre} tiene ${partes.join(', ')}. Resuélvelas antes de bloquear la cuenta ` +
          '(Entregas y plazos, Local y lotes).',
      );
    }

    // Bloqueo y cierre de sus publicaciones, todo o nada.
    const cerradas = await this.dataSource.transaction(async (mgr) => {
      u.activo = false;
      u.motivoBloqueo = motivo;
      await mgr.getRepository(Usuario).save(u);
      await this.historial.registrar(
        { entidad: EntidadHistorial.USUARIO, entidadId: usuarioId, estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO', actorId, motivo },
        mgr,
      );
      return this.cerrarPublicacionesEn(mgr, usuarioId, `Cerrada por bloqueo de la cuenta: ${motivo}`, actorId);
    });
    return { ...(await this.detalle(usuarioId)), cerradas };
  }

  async desbloquear(usuarioId: number, actorId: number, actorEsSuperusuario = false) {
    const u = await this.usuarios.findOne({ where: { id: usuarioId } });
    if (!u) throw new NotFoundException('El usuario no existe.');
    if (u.activo) throw new BadRequestException('La cuenta ya está activa.');

    // Simetrico con bloquear: un administrador no deshace el bloqueo que un
    // superusuario aplico a otro administrador.
    const rolesObjetivo = (await this.roles.find({ where: { usuarioId } })).map((r) => r.rol);
    if (
      (rolesObjetivo.includes(Rol.SUPERUSUARIO) || rolesObjetivo.includes(Rol.ADMINISTRADOR)) &&
      !actorEsSuperusuario
    ) {
      throw new ForbiddenException('Solo un superusuario puede desbloquear a un administrador.');
    }

    u.activo = true;
    u.motivoBloqueo = null;
    await this.usuarios.save(u);
    await this.historial.registrar({
      entidad: EntidadHistorial.USUARIO,
      entidadId: usuarioId,
      estadoAnterior: 'BLOQUEADO',
      estadoNuevo: 'ACTIVO',
      actorId,
      motivo: `Desbloqueo por ${this.quienActua(actorEsSuperusuario)}`,
    });
    return this.detalle(usuarioId);
  }
}
