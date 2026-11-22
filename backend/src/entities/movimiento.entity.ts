import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoMovimiento } from '../common/enums';
import { Evidencia } from './evidencia.entity';
import { OfertaXPeticion } from './oferta-x-peticion.entity';
import { Usuario } from './usuario.entity';

/** Libro de movimientos fisicos. Inmutable: una correccion se registra
 *  como un movimiento nuevo, nunca editando el anterior. */
@Entity('MOVIMIENTO')
export class Movimiento {
  @PrimaryGeneratedColumn()
  id: number;

  /** Titular del movimiento: un intento O un destino LOCAL (arco
   *  exclusivo, CK_MOVIMIENTO_titular). */
  @Column({ name: 'oferta_x_peticion_id', type: 'int', nullable: true })
  ofertaXPeticionId: number | null;

  @ManyToOne(() => OfertaXPeticion, (x) => x.movimientos)
  @JoinColumn({ name: 'oferta_x_peticion_id' })
  asignacion: OfertaXPeticion;

  @Column({ name: 'destino_local_id', type: 'int', nullable: true })
  destinoLocalId: number | null;

  /** Lote fisico afectado. */
  @Column({ name: 'lote_id', type: 'int', nullable: true })
  loteId: number | null;

  @Column({ name: 'tipo', type: 'varchar', length: 15 })
  tipo: TipoMovimiento;

  @Column({ name: 'cantidad', type: 'int' })
  cantidad: number;

  /** Nombre de quien entrega o recibe fisicamente. Obligatorio. */
  @Column({ name: 'nombre_contraparte', type: 'nvarchar', length: 200 })
  nombreContraparte: string;

  @Column({ name: 'evidencia_id', type: 'int' })
  evidenciaId: number;

  @ManyToOne(() => Evidencia)
  @JoinColumn({ name: 'evidencia_id' })
  evidencia: Evidencia;

  @Column({ name: 'observaciones', type: 'nvarchar', length: 600, nullable: true })
  observaciones: string | null;

  @Column({ name: 'registrado_por', type: 'int' })
  registradoPor: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'registrado_por' })
  responsable: Usuario;

  @CreateDateColumn({ name: 'registrado_en', type: 'datetime2' })
  registradoEn: Date;
}
