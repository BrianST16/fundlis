import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from './usuario.entity';

export type EstadoRevisionCertificado = 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO';

/**
 * Certificado de estudio vigente (D-46). Opcional. Dato sensible: solo lo
 * ven su dueno y el ADMINISTRADOR. Va en tabla propia (no en EVIDENCIA)
 * para no heredar las reglas de acceso del personal LIS.
 */
@Entity('certificado_estudio')
export class CertificadoEstudio {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'usuario_id', type: 'int' })
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'contenido', type: 'bytea', select: false })
  contenido: Buffer;

  @Column({ name: 'mime', type: 'varchar', length: 100 })
  mime: string;

  @Column({ name: 'tamano_bytes', type: 'int' })
  tamanoBytes: number;

  @Column({ name: 'hash_sha256', type: 'char', length: 64 })
  hashSha256: string;

  @Column({ name: 'nombre_original', type: 'varchar', length: 260, nullable: true })
  nombreOriginal: string | null;

  @Column({ name: 'subido_en', type: 'timestamptz' })
  subidoEn: Date;

  @Column({ name: 'estado_revision', type: 'varchar', length: 12, default: 'PENDIENTE' })
  estadoRevision: EstadoRevisionCertificado;

  @Column({ name: 'revisado_por', type: 'int', nullable: true })
  revisadoPor: number | null;

  @Column({ name: 'revisado_en', type: 'timestamptz', nullable: true })
  revisadoEn: Date | null;

  @Column({ name: 'observacion', type: 'varchar', length: 400, nullable: true })
  observacion: string | null;
}
