import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/transformers';
import { OpcionCaracterizacion } from './opcion-caracterizacion.entity';

@Entity('pregunta_caracterizacion')
export class PreguntaCaracterizacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'texto', type: 'varchar', length: 400 })
  texto: string;

  @Column({ name: 'orden', type: 'int' })
  orden: number;

  @Column({ name: 'peso', type: 'decimal', precision: 6, scale: 5, transformer: decimalTransformer })
  peso: number;

  @Column({ name: 'activa', type: 'boolean', default: true })
  activa: boolean;

  @OneToMany(() => OpcionCaracterizacion, (o) => o.pregunta)
  opciones: OpcionCaracterizacion[];
}
