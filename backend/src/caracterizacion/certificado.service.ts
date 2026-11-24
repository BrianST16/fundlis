import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { EntidadHistorial, MIMES_CERTIFICADO } from '../common/enums';
import { HistorialService } from '../common/historial.service';
import { ParametrosService } from '../common/parametros.service';
import { CertificadoEstudio, EstadoRevisionCertificado } from '../entities';

export interface CertificadoMeta {
  nombreOriginal: string | null;
  mime: string;
  tamanoBytes: number;
  subidoEn: Date;
  estadoRevision: EstadoRevisionCertificado;
  revisadoEn: Date | null;
  observacion: string | null;
}

/** Comprueba los bytes iniciales para no aceptar un archivo disfrazado. */
export function firmaCertificadoValida(buf: Buffer, mime: string): boolean {
  if (buf.length < 8) return false;
  if (mime === 'application/pdf') return buf.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') {
    return (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    );
  }
  return false;
}

/**
 * Certificado de estudio vigente (D-46).
 *  - OPCIONAL: no condiciona la caracterizacion ni las peticiones.
 *  - Lo sube el propio estudiante; uno vigente por estudiante.
 *  - Solo lo descargan su dueno y el ADMINISTRADOR (el control de rol esta
 *    en las rutas del controlador; este servicio nunca expone el binario
 *    de otro usuario por si solo).
 *  - El administrador lo marca VALIDADO o RECHAZADO; asi se distingue a un
 *    estudiante de un profesor o administrativo con correo institucional.
 */
@Injectable()
export class CertificadoService {
  constructor(
    @InjectRepository(CertificadoEstudio) private readonly repo: Repository<CertificadoEstudio>,
    private readonly parametros: ParametrosService,
    private readonly historial: HistorialService,
    private readonly dataSource: DataSource,
  ) {}

  async metadatos(usuarioId: number): Promise<CertificadoMeta | null> {
    const c = await this.repo.findOne({ where: { usuarioId } });
    if (!c) return null;
    return {
      nombreOriginal: c.nombreOriginal,
      mime: c.mime,
      tamanoBytes: c.tamanoBytes,
      subidoEn: c.subidoEn,
      estadoRevision: c.estadoRevision,
      revisadoEn: c.revisadoEn,
      observacion: c.observacion,
    };
  }

  /** Sube o reemplaza el certificado. Reemplazar vuelve la revision a PENDIENTE. */
  async subir(
    usuarioId: number,
    datos: { mime: string; contenidoBase64: string; nombreOriginal?: string },
  ): Promise<CertificadoMeta> {
    if (!MIMES_CERTIFICADO.includes(datos.mime)) {
      throw new BadRequestException('El certificado debe ser PDF, JPEG o PNG.');
    }
    const contenido = Buffer.from(datos.contenidoBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!contenido.length) throw new BadRequestException('El archivo esta vacio.');

    const maximo = await this.parametros.maxBytesEvidencia();
    if (contenido.length > maximo) {
      throw new BadRequestException(
        `El archivo pesa ${(contenido.length / 1024).toFixed(0)} KB y el maximo es ${(maximo / 1024).toFixed(0)} KB.`,
      );
    }
    if (!firmaCertificadoValida(contenido, datos.mime)) {
      throw new BadRequestException('El archivo no corresponde al formato declarado.');
    }

    await this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(CertificadoEstudio);
      const previo = await repo.findOne({ where: { usuarioId } });
      const valores = {
        contenido,
        mime: datos.mime,
        tamanoBytes: contenido.length,
        hashSha256: createHash('sha256').update(contenido).digest('hex'),
        nombreOriginal: datos.nombreOriginal?.slice(0, 260) ?? null,
        subidoEn: new Date(),
        estadoRevision: 'PENDIENTE' as EstadoRevisionCertificado,
        revisadoPor: null,
        revisadoEn: null,
        observacion: null,
      };
      if (previo) {
        await repo.update({ id: previo.id }, valores);
      } else {
        await repo.insert({ usuarioId, ...valores });
      }
      await this.historial.registrar(
        {
          entidad: EntidadHistorial.USUARIO,
          entidadId: usuarioId,
          estadoAnterior: previo ? `CERTIFICADO_${previo.estadoRevision}` : null,
          estadoNuevo: previo ? 'CERTIFICADO_REEMPLAZADO' : 'CERTIFICADO_SUBIDO',
          actorId: usuarioId,
          motivo: 'Certificado de estudio cargado por el estudiante',
        },
        mgr,
      );
    });

    return (await this.metadatos(usuarioId))!;
  }

  /** El estudiante retira su certificado (es opcional). */
  async eliminarPropio(usuarioId: number): Promise<void> {
    const c = await this.repo.findOne({ where: { usuarioId } });
    if (!c) throw new NotFoundException('No tienes un certificado cargado.');
    await this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(CertificadoEstudio).delete({ id: c.id });
      await this.historial.registrar(
        {
          entidad: EntidadHistorial.USUARIO,
          entidadId: usuarioId,
          estadoAnterior: `CERTIFICADO_${c.estadoRevision}`,
          estadoNuevo: 'CERTIFICADO_ELIMINADO',
          actorId: usuarioId,
          motivo: 'Certificado retirado por el estudiante',
        },
        mgr,
      );
    });
  }

  /** Binario del certificado de un usuario. Quien llama ya valido el acceso. */
  async descargar(usuarioId: number): Promise<{ contenido: Buffer; mime: string; nombre: string }> {
    const fila = await this.repo
      .createQueryBuilder('c')
      .addSelect('c.contenido')
      .where('c.usuario_id = :usuarioId', { usuarioId })
      .getOne();
    if (!fila) throw new NotFoundException('No hay certificado cargado.');
    const extension = fila.mime === 'application/pdf' ? 'pdf' : fila.mime === 'image/png' ? 'png' : 'jpg';
    return {
      contenido: fila.contenido,
      mime: fila.mime,
      nombre: `certificado-${usuarioId}.${extension}`,
    };
  }

  /** Revision del ADMINISTRADOR. Rechazar exige observacion. */
  async revisar(
    usuarioId: number,
    estado: 'VALIDADO' | 'RECHAZADO',
    observacion: string | undefined,
    actorId: number,
  ): Promise<CertificadoMeta> {
    const c = await this.repo.findOne({ where: { usuarioId } });
    if (!c) throw new NotFoundException('Ese estudiante no ha cargado certificado.');
    const nota = observacion?.trim() || null;
    if (estado === 'RECHAZADO' && (!nota || nota.length < 5)) {
      throw new BadRequestException('Para rechazar indica el motivo (minimo 5 caracteres).');
    }

    await this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(CertificadoEstudio).update(
        { id: c.id },
        { estadoRevision: estado, revisadoPor: actorId, revisadoEn: new Date(), observacion: nota },
      );
      await this.historial.registrar(
        {
          entidad: EntidadHistorial.USUARIO,
          entidadId: usuarioId,
          estadoAnterior: `CERTIFICADO_${c.estadoRevision}`,
          estadoNuevo: `CERTIFICADO_${estado}`,
          actorId,
          motivo: nota ?? 'Certificado revisado por el administrador',
        },
        mgr,
      );
    });

    return (await this.metadatos(usuarioId))!;
  }
}
