import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LoteFisico } from './lote-fisico.entity';
import { Oferta } from './oferta.entity';

export type EstadoLocal =
  | 'ESPERA_RECEPCION'
  | 'CUSTODIA_TEMPORAL'
  | 'ACEPTADO'
  | 'REASIGNADO'
  | 'DEVUELTO'
  | 'CANCELADO';

/**
 * LOCAL: el LIS como destinatario institucional (D-19, D-20, D-43).
 * No es usuario ni peticion. CUSTODIA_TEMPORAL la inicia el auxiliar;
 * ACEPTADO (donativo institucional permanente) solo con autorizacion del
 * administrador.
 */
@Entity('DESTINO_LOCAL')
export class DestinoLocal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'oferta_id', type: 'int' })
  ofertaId: number;

  @ManyToOne(() => Oferta)
  @JoinColumn({ name: 'oferta_id' })
  oferta: Oferta;

  @Column({ name: 'lote_id', type: 'int', nullable: true })
  loteId: number | null;

  @ManyToOne(() => LoteFisico)
  @JoinColumn({ name: 'lote_id' })
  lote: LoteFisico | null;

  /** OFERTA: unidades aun no recibidas. LOTE: unidades ya en el LIS. */
  @Column({ name: 'origen', type: 'varchar', length: 10 })
  origen: 'OFERTA' | 'LOTE';

  @Column({ name: 'cantidad', type: 'int' })
  cantidad: number;

  @Column({ name: 'estado', type: 'varchar', length: 20 })
  estado: EstadoLocal;

  @Column({ name: 'seleccionado_por', type: 'int' })
  seleccionadoPor: number;

  @Column({ name: 'seleccionado_en', type: 'datetime2' })
  seleccionadoEn: Date;

  @Column({ name: 'motivo', type: 'nvarchar', length: 400 })
  motivo: string;

  @Column({ name: 'custodia_desde', type: 'datetime2', nullable: true })
  custodiaDesde: Date | null;

  @Column({ name: 'aceptacion_solicitada_por', type: 'int', nullable: true })
  aceptacionSolicitadaPor: number | null;

  @Column({ name: 'aceptacion_solicitada_en', type: 'datetime2', nullable: true })
  aceptacionSolicitadaEn: Date | null;

  @Column({ name: 'aceptado_por', type: 'int', nullable: true })
  aceptadoPor: number | null;

  @Column({ name: 'aceptado_en', type: 'datetime2', nullable: true })
  aceptadoEn: Date | null;

  @Column({ name: 'cerrado_en', type: 'datetime2', nullable: true })
  cerradoEn: Date | null;

  @Column({ name: 'motivo_cierre', type: 'nvarchar', length: 400, nullable: true })
  motivoCierre: string | null;
}
