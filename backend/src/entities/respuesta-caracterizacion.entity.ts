import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Caracterizacion } from './caracterizacion.entity';

@Entity('respuesta_caracterizacion')
export class RespuestaCaracterizacion {
  @PrimaryColumn({ name: 'caracterizacion_id', type: 'int' })
  caracterizacionId: number;

  @PrimaryColumn({ name: 'pregunta_id', type: 'int' })
  preguntaId: number;

  @Column({ name: 'opcion_id', type: 'int' })
  opcionId: number;

  @ManyToOne(() => Caracterizacion, (c) => c.respuestas)
  @JoinColumn({ name: 'caracterizacion_id' })
  caracterizacion: Caracterizacion;
}
