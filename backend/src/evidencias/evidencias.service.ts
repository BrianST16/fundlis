import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { UsuarioActual } from '../auth/auth.types';
import { EstadoOferta, MIMES_EVIDENCIA } from '../common/enums';
import { ParametrosService } from '../common/parametros.service';
import { Evidencia, Movimiento, Notificacion, Oferta } from '../entities';

export interface EvidenciaDescargada {
  contenido: Buffer;
  mime: string;
  nombre: string;
}

/**
 * Fotografias de evidencia. Se guardan dentro de SQL Server y solo se
 * entregan por este servicio, que decide caso por caso quien puede verlas.
 * No existe URL publica ni carpeta estatica.
 */
@Injectable()
export class EvidenciasService {
  constructor(
    @InjectRepository(Evidencia) private readonly repo: Repository<Evidencia>,
    @InjectRepository(Oferta) private readonly ofertas: Repository<Oferta>,
    @InjectRepository(Movimiento) private readonly movimientos: Repository<Movimiento>,
    private readonly parametros: ParametrosService,
    @InjectRepository(Notificacion) private readonly notificaciones?: Repository<Notificacion>,
  ) {}

  /** Guarda una imagen enviada en base64. Devuelve el id de la evidencia. */
  async guardar(
    datos: { mime: string; contenidoBase64: string; nombreOriginal?: string },
    usuarioId: number,
    manager?: EntityManager,
  ): Promise<Evidencia> {
    if (!MIMES_EVIDENCIA.includes(datos.mime)) {
      throw new BadRequestException(
        `Formato no permitido. Usa uno de: ${MIMES_EVIDENCIA.join(', ')}.`,
      );
    }

    const limpio = datos.contenidoBase64.replace(/^data:[^;]+;base64,/, '');
    let contenido: Buffer;
    try {
      contenido = Buffer.from(limpio, 'base64');
    } catch {
      throw new BadRequestException('El contenido de la imagen no es base64 válido.');
    }
    if (!contenido.length) {
      throw new BadRequestException('La imagen esta vacia.');
    }

    const maximo = await this.parametros.maxBytesEvidencia();
    if (contenido.length > maximo) {
      throw new BadRequestException(
        `La imagen pesa ${(contenido.length / 1024).toFixed(0)} KB y el máximo es ${(maximo / 1024).toFixed(0)} KB.`,
      );
    }
    if (!this.firmaValida(contenido, datos.mime)) {
      throw new BadRequestException('El archivo no corresponde al formato declarado.');
    }

    const repo = manager ? manager.getRepository(Evidencia) : this.repo;
    return repo.save(
      repo.create({
        contenido,
        mime: datos.mime,
        tamanoBytes: contenido.length,
        hashSha256: createHash('sha256').update(contenido).digest('hex'),
        nombreOriginal: datos.nombreOriginal?.slice(0, 260) ?? null,
        subidaPor: usuarioId,
      }),
    );
  }

  /** Comprueba los bytes iniciales para no aceptar un archivo disfrazado. */
  private firmaValida(buf: Buffer, mime: string): boolean {
    if (buf.length < 12) return false;
    if (mime === 'image/jpeg') {
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    }
    if (mime === 'image/png') {
      return (
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
      );
    }
    if (mime === 'image/webp') {
      return (
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }

  /**
   * Entrega el binario solo a quien corresponde:
   *  - foto de un movimiento fisico (recepcion, entrega, devolucion): SOLO
   *    el personal del LIS. Puede mostrar a la persona que entrega o recibe,
   *    y las partes no deben conocerse entre si (supuesto H-7d / P-20);
   *  - foto de una oferta APROBADA: cualquiera (el catalogo es publico y
   *    la foto muestra el producto, no a personas);
   *  - foto de una oferta en otro estado: su donador y el personal del LIS;
   *  - foto suelta, aun sin asociar: quien la subio.
   */
  async descargar(id: number, actual: UsuarioActual | null): Promise<EvidenciaDescargada> {
    const meta = await this.repo.findOne({ where: { id } });
    if (!meta) throw new NotFoundException('La evidencia no existe.');

    if (!(await this.puedeVer(id, actual))) {
      throw new ForbiddenException('No tienes permiso para ver esta evidencia.');
    }

    const fila = await this.repo
      .createQueryBuilder('e')
      .addSelect('e.contenido')
      .where('e.id = :id', { id })
      .getOne();

    return {
      contenido: fila.contenido,
      mime: meta.mime,
      nombre: meta.nombreOriginal ?? `evidencia-${id}`,
    };
  }

  /** Expuesto para pruebas: decide el acceso sin leer el binario. */
  async puedeVer(evidenciaId: number, actual: UsuarioActual | null): Promise<boolean> {
    if (actual?.esPersonalLis) return true;

    // D-51: la foto adjunta a una notificacion la ve SOLO su destinatario
    // (p. ej. el donador recibe la foto de la entrega final). Es una
    // excepcion puntual y explicita a la regla de movimientos de abajo.
    if (actual && this.notificaciones) {
      const adjunta = await this.notificaciones.count({ where: { evidenciaId, usuarioId: actual.sub } });
      if (adjunta > 0) return true;
    }

    // Primero los movimientos: una evidencia fisica nunca se libera a las
    // partes, aunque por error estuviera ligada tambien a una oferta.
    const enMovimiento = await this.movimientos.count({ where: { evidenciaId } });
    if (enMovimiento > 0) return false;

    const oferta = await this.ofertas.findOne({ where: { fotoId: evidenciaId } });
    if (oferta) {
      if (oferta.estado === EstadoOferta.APROBADA) return true;
      return !!actual && actual.sub === oferta.donadorId;
    }

    if (!actual) return false;

    // Una foto aun no asociada: solo quien la subio.
    const meta = await this.repo.findOne({ where: { id: evidenciaId } });
    return meta?.subidaPor === actual.sub;
  }
}
