import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { esViolacionUnica } from '../common/errores-bd';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Rol } from '../common/enums';
import { CorreoSalida, Notificacion, Usuario, UsuarioRol } from '../entities';
import { CorreoService } from './correo.service';

export interface Aviso {
  tipo: string;
  titulo: string;
  mensaje: string;
  entidad?: string;
  entidadId?: number;
  /** Identifica el evento. Con el usuario forma la clave de idempotencia. */
  clave: string;
  /** D-51: foto adjunta; el destinatario queda autorizado a verla. */
  evidenciaId?: number;
  /** D-51: no encolar correo (solo bandeja interna). */
  soloBandeja?: boolean;
}

/**
 * Bandeja interna + encolado de correo (D-42).
 *
 * Reglas:
 *  - se llama DESPUES de confirmar la operacion de negocio y NUNCA lanza:
 *    un fallo de notificacion no revierte la operacion;
 *  - un mismo evento (clave) no se repite al mismo usuario;
 *  - los mensajes los redactan los servicios de negocio SIN identidades de
 *    la otra parte (el donador nunca ve al estudiante, ni al reves).
 */
@Injectable()
export class NotificacionesService {
  private readonly log = new Logger(NotificacionesService.name);

  constructor(
    @InjectRepository(Notificacion) private readonly notificaciones: Repository<Notificacion>,
    @InjectRepository(CorreoSalida) private readonly correos: Repository<CorreoSalida>,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioRol) private readonly roles: Repository<UsuarioRol>,
    private readonly correo: CorreoService,
  ) {}

  /** Ids del personal del LIS activo (auxiliares y administradores). */
  async personalLis(): Promise<number[]> {
    const filas = await this.roles.find({ where: { rol: In([Rol.AUXILIAR_LIS, Rol.ADMINISTRADOR]) } });
    const ids = [...new Set(filas.map((f) => f.usuarioId))];
    if (!ids.length) return [];
    const activos = await this.usuarios.find({ where: { id: In(ids), activo: true } });
    return activos.map((u) => u.id);
  }

  async administradores(): Promise<number[]> {
    const filas = await this.roles.find({ where: { rol: Rol.ADMINISTRADOR } });
    return [...new Set(filas.map((f) => f.usuarioId))];
  }

  /** Avisa a usuarios concretos. Devuelve cuantas notificaciones NUEVAS creo. */
  async aUsuarios(ids: (number | null | undefined)[], aviso: Aviso): Promise<number> {
    let creadas = 0;
    const unicos = [...new Set(ids.filter((x): x is number => typeof x === 'number'))];
    for (const usuarioId of unicos) {
      try {
        if (await this.crearUna(usuarioId, aviso)) creadas++;
      } catch (e: any) {
        this.log.error(`No se pudo notificar ${aviso.tipo} al usuario ${usuarioId}: ${e?.message}`);
      }
    }
    return creadas;
  }

  async aPersonalLis(aviso: Aviso): Promise<number> {
    try {
      return this.aUsuarios(await this.personalLis(), aviso);
    } catch (e: any) {
      this.log.error(`No se pudo resolver el personal LIS: ${e?.message}`);
      return 0;
    }
  }

  async aAdministradores(aviso: Aviso): Promise<number> {
    try {
      return this.aUsuarios(await this.administradores(), aviso);
    } catch (e: any) {
      this.log.error(`No se pudo resolver los administradores: ${e?.message}`);
      return 0;
    }
  }

  private async crearUna(usuarioId: number, aviso: Aviso): Promise<boolean> {
    const existe = await this.notificaciones.findOne({ where: { usuarioId, clave: aviso.clave } });
    if (existe) return false;

    const usuario = await this.usuarios.findOne({ where: { id: usuarioId } });
    if (!usuario) return false;

    let n: Notificacion;
    try {
      n = await this.notificaciones.save(
        this.notificaciones.create({
          usuarioId,
          tipo: aviso.tipo,
          titulo: aviso.titulo.slice(0, 200),
          mensaje: aviso.mensaje.slice(0, 1000),
          entidad: aviso.entidad ?? null,
          entidadId: aviso.entidadId ?? null,
          clave: aviso.clave.slice(0, 160),
          evidenciaId: aviso.evidenciaId ?? null,
        }),
      );
    } catch (e: any) {
      // Violacion de unicidad: otro proceso ya la creo (idempotencia).
      if (esViolacionUnica(e)) return false;
      throw e;
    }

    if (usuario.activo && usuario.email && !aviso.soloBandeja) {
      await this.correos.save(
        this.correos.create({
          notificacionId: n.id,
          destinatario: usuario.email,
          asunto: `[LIS Dona] ${aviso.titulo}`.slice(0, 200),
          cuerpo:
            `${aviso.mensaje}\n\n` +
            'Consulta el detalle en la bandeja de la plataforma LIS Dona.\n' +
            'Este es un mensaje automático del Laboratorio Integrado de Sistemas (UdeA).',
          estado: this.correo.estadoPara ? this.correo.estadoPara(usuario.email) : this.correo.estadoInicial(),
        }),
      );
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Bandeja del usuario
  // ------------------------------------------------------------------
  async bandeja(usuarioId: number, soloNoLeidas = false, limite = 50) {
    const lista = await this.notificaciones.find({
      where: soloNoLeidas ? { usuarioId, leidaEn: IsNull() } : { usuarioId },
      order: { creadaEn: 'DESC', id: 'DESC' },
      take: Math.min(Math.max(limite, 1), 200),
    });
    return lista.map((n) => ({
      id: Number(n.id),
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      entidad: n.entidad,
      entidadId: n.entidadId,
      evidenciaId: n.evidenciaId ?? null,
      creadaEn: n.creadaEn,
      leida: !!n.leidaEn,
    }));
  }

  async noLeidas(usuarioId: number) {
    return { noLeidas: await this.notificaciones.count({ where: { usuarioId, leidaEn: IsNull() } }) };
  }

  async marcarLeida(id: number, usuarioId: number) {
    const n = await this.notificaciones.findOne({ where: { id: String(id), usuarioId } });
    // Una notificacion ajena responde igual que una inexistente.
    if (!n) throw new NotFoundException('La notificación no existe.');
    if (!n.leidaEn) await this.notificaciones.update({ id: n.id }, { leidaEn: new Date() });
    return { ok: true };
  }

  async marcarTodas(usuarioId: number) {
    const r = await this.notificaciones.update({ usuarioId, leidaEn: IsNull() }, { leidaEn: new Date() });
    return { marcadas: r.affected ?? 0 };
  }

  /** Estado de entrega por canal de las notificaciones de un evento (evidencia). */
  async trazaEvento(clave: string) {
    const ns = await this.notificaciones.find({ where: { clave } });
    if (!ns.length) return [];
    const correos = await this.correos.find({ where: { notificacionId: In(ns.map((n) => n.id)) } });
    const porNotif = new Map(correos.map((c) => [c.notificacionId, c]));
    return ns.map((n) => ({
      usuarioId: n.usuarioId,
      bandeja: true,
      correo: porNotif.get(n.id)?.estado ?? 'SIN_CORREO',
    }));
  }
}
