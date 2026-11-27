import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Oferta } from './oferta.entity';

export type UbicacionLote = 'EN_LIS' | 'ENTREGADO' | 'DEVUELTO' | 'PATRIMONIO_LIS';
export type OrigenLote = 'RECEPCION_ASIGNACION' | 'RECEPCION_INCOMPLETA' | 'RECEPCION_LOCAL';

/**
 * Unidades que el LIS tiene (o tuvo) fisicamente. Separado del intento de
 * asignacion y del historial (directriz §4). Toda recepcion crea un lote.
 * Un lote EN_LIS sin intento vigente ni custodia LOCAL esta "sin destino".
 */
@Entity('lote_fisico')
export class LoteFisico {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'oferta_id', type: 'int' })
  ofertaId: number;

  @ManyToOne(() => Oferta)
  @JoinColumn({ name: 'oferta_id' })
  oferta: Oferta;

  @Column({ name: 'cantidad', type: 'int' })
  cantidad: number;

  @Column({ name: 'ubicacion', type: 'varchar', length: 20 })
  ubicacion: UbicacionLote;

  @Column({ name: 'origen', type: 'varchar', length: 25 })
  origen: OrigenLote;

  @Column({ name: 'intento_origen_id', type: 'int', nullable: true })
  intentoOrigenId: number | null;

  @Column({ name: 'recepcion_movimiento_id', type: 'int', nullable: true })
  recepcionMovimientoId: number | null;

  /** Desde cuando el lote no tiene destino (inicio de la espera, P-08). */
  @Column({ name: 'sin_destino_desde', type: 'timestamptz', nullable: true })
  sinDestinoDesde: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @Column({ name: 'actualizado_en', type: 'timestamptz', nullable: true })
  actualizadoEn: Date | null;
}
