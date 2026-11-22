import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from './usuario.entity';

/** Fotografia de evidencia. Se guarda dentro de SQL Server y solo se
 *  sirve por un endpoint autenticado: nunca como URL publica. */
@Entity('EVIDENCIA')
export class Evidencia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contenido', type: 'varbinary', length: 'MAX', select: false })
  contenido: Buffer;

  @Column({ name: 'mime', type: 'varchar', length: 100 })
  mime: string;

  @Column({ name: 'tamano_bytes', type: 'int' })
  tamanoBytes: number;

  @Column({ name: 'hash_sha256', type: 'char', length: 64 })
  hashSha256: string;

  @Column({ name: 'nombre_original', type: 'nvarchar', length: 260, nullable: true })
  nombreOriginal: string | null;

  @Column({ name: 'subida_por', type: 'int' })
  subidaPor: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'subida_por' })
  usuario: Usuario;

  @CreateDateColumn({ name: 'subida_en', type: 'datetime2' })
  subidaEn: Date;
}
