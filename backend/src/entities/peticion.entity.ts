import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoPeticion } from '../common/enums';
import { decimalTransformer } from '../common/transformers';
import { Categoria } from './categoria.entity';
import { OfertaXPeticion } from './oferta-x-peticion.entity';
import { Usuario } from './usuario.entity';

/** La peticion NO lleva cantidad solicitada: la cantidad vive en la
 *  asignacion (OFERTA_X_PETICION). */
@Entity('peticion')
export class Peticion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'estudiante_id', type: 'int' })
  estudianteId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'estudiante_id' })
  estudiante: Usuario;

  @Column({ name: 'categoria_id', type: 'int' })
  categoriaId: number;

  @ManyToOne(() => Categoria)
  @JoinColumn({ name: 'categoria_id' })
  categoria: Categoria;

  @Column({ name: 'descripcion', type: 'varchar', length: 1000 })
  descripcion: string;

  @Column({ name: 'estado', type: 'varchar', length: 25 })
  estado: EstadoPeticion;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @Column({ name: 'actualizada_en', type: 'timestamptz', nullable: true })
  actualizadaEn: Date | null;

  @Column({ name: 'revisada_por', type: 'int', nullable: true })
  revisadaPor: number | null;

  @Column({ name: 'revisada_en', type: 'timestamptz', nullable: true })
  revisadaEn: Date | null;

  @Column({ name: 'motivo_rechazo', type: 'varchar', length: 400, nullable: true })
  motivoRechazo: string | null;

  @Column({ name: 'cerrada_en', type: 'timestamptz', nullable: true })
  cerradaEn: Date | null;

  @Column({ name: 'motivo_cierre', type: 'varchar', length: 400, nullable: true })
  motivoCierre: string | null;

  /** Compatibilidad (D-41): estado de conservacion minimo aceptable (1-5). */
  @Column({ name: 'estado_minimo', type: 'smallint', default: 1 })
  estadoMinimo: number;

  /** Rango aceptable de la medida de la categoria. NULL = sin limite. */
  @Column({ name: 'medida_min', type: 'decimal', precision: 9, scale: 2, nullable: true, transformer: decimalTransformer })
  medidaMin: number | null;

  @Column({ name: 'medida_max', type: 'decimal', precision: 9, scale: 2, nullable: true, transformer: decimalTransformer })
  medidaMax: number | null;

  @OneToMany(() => OfertaXPeticion, (x) => x.peticion)
  asignaciones: OfertaXPeticion[];
}
