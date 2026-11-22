import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoOferta } from '../common/enums';
import { decimalTransformer } from '../common/transformers';
import { Categoria } from './categoria.entity';
import { Evidencia } from './evidencia.entity';
import { OfertaXPeticion } from './oferta-x-peticion.entity';
import { Usuario } from './usuario.entity';

@Entity('OFERTA')
export class Oferta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'donador_id', type: 'int' })
  donadorId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'donador_id' })
  donador: Usuario;

  @Column({ name: 'categoria_id', type: 'int' })
  categoriaId: number;

  @ManyToOne(() => Categoria)
  @JoinColumn({ name: 'categoria_id' })
  categoria: Categoria;

  @Column({ name: 'nombre_producto', type: 'nvarchar', length: 200 })
  nombreProducto: string;

  @Column({ name: 'descripcion', type: 'nvarchar', length: 1000 })
  descripcion: string;

  @Column({ name: 'cantidad', type: 'int' })
  cantidad: number;

  @Column({ name: 'estado', type: 'varchar', length: 25 })
  estado: EstadoOferta;

  @Column({ name: 'foto_id', type: 'int', nullable: true })
  fotoId: number | null;

  @ManyToOne(() => Evidencia, { nullable: true })
  @JoinColumn({ name: 'foto_id' })
  foto: Evidencia | null;

  @CreateDateColumn({ name: 'creada_en', type: 'datetime2' })
  creadaEn: Date;

  @Column({ name: 'actualizada_en', type: 'datetime2', nullable: true })
  actualizadaEn: Date | null;

  @Column({ name: 'revisada_por', type: 'int', nullable: true })
  revisadaPor: number | null;

  @Column({ name: 'revisada_en', type: 'datetime2', nullable: true })
  revisadaEn: Date | null;

  @Column({ name: 'motivo_rechazo', type: 'nvarchar', length: 400, nullable: true })
  motivoRechazo: string | null;

  @Column({ name: 'cerrada_en', type: 'datetime2', nullable: true })
  cerradaEn: Date | null;

  /** Compatibilidad (D-41): 1 = deteriorado ... 5 = nuevo. */
  @Column({ name: 'estado_conservacion', type: 'tinyint', default: 3 })
  estadoConservacion: number;

  /** Valor de la medida de la categoria (p. ej. talla). NULL si no aplica. */
  @Column({ name: 'medida', type: 'decimal', precision: 9, scale: 2, nullable: true, transformer: decimalTransformer })
  medida: number | null;

  /** DONADOR o FALTANTE (generada por una recepcion incompleta, D-18). */
  @Column({ name: 'origen', type: 'varchar', length: 10, default: 'DONADOR' })
  origen: 'DONADOR' | 'FALTANTE';

  @Column({ name: 'oferta_origen_id', type: 'int', nullable: true })
  ofertaOrigenId: number | null;

  @OneToMany(() => OfertaXPeticion, (x) => x.oferta)
  asignaciones: OfertaXPeticion[];
}
