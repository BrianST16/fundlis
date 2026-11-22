import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/transformers';
import { PreguntaCaracterizacion } from './pregunta-caracterizacion.entity';

@Entity('OPCION_CARACTERIZACION')
export class OpcionCaracterizacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'pregunta_id', type: 'int' })
  preguntaId: number;

  @ManyToOne(() => PreguntaCaracterizacion, (p) => p.opciones)
  @JoinColumn({ name: 'pregunta_id' })
  pregunta: PreguntaCaracterizacion;

  @Column({ name: 'texto', type: 'nvarchar', length: 300 })
  texto: string;

  @Column({ name: 'puntaje', type: 'decimal', precision: 6, scale: 5, transformer: decimalTransformer })
  puntaje: number;

  @Column({ name: 'orden', type: 'int' })
  orden: number;
}
