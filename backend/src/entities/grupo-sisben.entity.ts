import { Column, Entity, PrimaryColumn } from 'typeorm';
import { decimalTransformer } from '../common/transformers';

@Entity('grupo_sisben')
export class GrupoSisben {
  @PrimaryColumn({ name: 'codigo', type: 'varchar', length: 4 })
  codigo: string;

  @Column({ name: 'letra', type: 'char', length: 1 })
  letra: string;

  @Column({ name: 'subgrupo', type: 'int' })
  subgrupo: number;

  @Column({ name: 'descripcion', type: 'varchar', length: 120 })
  descripcion: string;

  @Column({ name: 'puntaje_necesidad', type: 'decimal', precision: 6, scale: 5, transformer: decimalTransformer })
  puntajeNecesidad: number;
}
