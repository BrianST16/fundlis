import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EntidadHistorial } from '../common/enums';

@Entity('HISTORIAL_ESTADO')
export class HistorialEstado {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'entidad', type: 'varchar', length: 20 })
  entidad: EntidadHistorial;

  @Column({ name: 'entidad_id', type: 'int' })
  entidadId: number;

  @Column({ name: 'estado_anterior', type: 'varchar', length: 25, nullable: true })
  estadoAnterior: string | null;

  @Column({ name: 'estado_nuevo', type: 'varchar', length: 25 })
  estadoNuevo: string;

  @Column({ name: 'actor_id', type: 'int', nullable: true })
  actorId: number | null;

  @Column({ name: 'motivo', type: 'nvarchar', length: 400, nullable: true })
  motivo: string | null;

  @CreateDateColumn({ name: 'ocurrido_en', type: 'datetime2' })
  ocurridoEn: Date;
}
