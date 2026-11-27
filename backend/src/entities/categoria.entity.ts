import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/transformers';

@Entity('categoria')
export class Categoria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 120 })
  nombre: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 400, nullable: true })
  descripcion: string | null;

  @Column({ name: 'activa', type: 'boolean', default: true })
  activa: boolean;

  /** Medida principal de compatibilidad (p. ej. talla). NULL = la categoria
   *  no usa medida y solo se compara el estado de conservacion. */
  @Column({ name: 'medida_nombre', type: 'varchar', length: 80, nullable: true })
  medidaNombre: string | null;

  @Column({ name: 'medida_unidad', type: 'varchar', length: 60, nullable: true })
  medidaUnidad: string | null;

  @Column({ name: 'medida_min', type: 'decimal', precision: 9, scale: 2, nullable: true, transformer: decimalTransformer })
  medidaMin: number | null;

  @Column({ name: 'medida_max', type: 'decimal', precision: 9, scale: 2, nullable: true, transformer: decimalTransformer })
  medidaMax: number | null;
}
