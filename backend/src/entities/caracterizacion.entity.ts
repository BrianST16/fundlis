import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/transformers';
import { GrupoSisben } from './grupo-sisben.entity';
import { RespuestaCaracterizacion } from './respuesta-caracterizacion.entity';
import { Usuario } from './usuario.entity';

@Entity('CARACTERIZACION')
export class Caracterizacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'usuario_id', type: 'int' })
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'grupo_sisben', type: 'varchar', length: 4 })
  grupoSisben: string;

  @ManyToOne(() => GrupoSisben)
  @JoinColumn({ name: 'grupo_sisben' })
  sisben: GrupoSisben;

  /** Promedio ponderado de los puntajes de las opciones elegidas, en [0,1]. */
  @Column({ name: 'puntaje_total', type: 'decimal', precision: 7, scale: 5, transformer: decimalTransformer })
  puntajeTotal: number;

  @CreateDateColumn({ name: 'completada_en', type: 'datetime2' })
  completadaEn: Date;

  @Column({ name: 'actualizada_en', type: 'datetime2', nullable: true })
  actualizadaEn: Date | null;

  @OneToMany(() => RespuestaCaracterizacion, (r) => r.caracterizacion, { cascade: true })
  respuestas: RespuestaCaracterizacion[];
}
