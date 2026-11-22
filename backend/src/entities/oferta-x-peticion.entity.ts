import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoAsignacion } from '../common/enums';
import { decimalTransformer } from '../common/transformers';
import { Movimiento } from './movimiento.entity';
import { Oferta } from './oferta.entity';
import { Peticion } from './peticion.entity';
import { Usuario } from './usuario.entity';

/** Intento de asignacion entre una oferta y una peticion.
 *  Una peticion solo puede tener un intento vigente (ASIGNADO o
 *  EN_CUSTODIA). Lo garantiza la base de datos mediante la vista indexada
 *  VW_OXP_VIGENTE con indice unico agrupado sobre peticion_id, de modo que
 *  los intentos anteriores se conservan como historial. */
@Entity('OFERTA_X_PETICION')
export class OfertaXPeticion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'oferta_id', type: 'int' })
  ofertaId: number;

  @ManyToOne(() => Oferta, (o) => o.asignaciones)
  @JoinColumn({ name: 'oferta_id' })
  oferta: Oferta;

  @Column({ name: 'peticion_id', type: 'int' })
  peticionId: number;

  @ManyToOne(() => Peticion, (p) => p.asignaciones)
  @JoinColumn({ name: 'peticion_id' })
  peticion: Peticion;

  @Column({ name: 'cantidad_asignada', type: 'int' })
  cantidadAsignada: number;

  @Column({ name: 'estado', type: 'varchar', length: 20 })
  estado: EstadoAsignacion;

  /** Puntaje de prioridad del candidato en el momento de asignar.
   *  Se guarda como evidencia de por que se eligio a ese estudiante. */
  @Column({ name: 'puntaje_prioridad', type: 'decimal', precision: 8, scale: 6, nullable: true, transformer: decimalTransformer })
  puntajePrioridad: number | null;

  @Column({ name: 'asignada_por', type: 'int' })
  asignadaPor: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'asignada_por' })
  asignador: Usuario;

  @CreateDateColumn({ name: 'asignada_en', type: 'datetime2' })
  asignadaEn: Date;

  @Column({ name: 'recibida_en', type: 'datetime2', nullable: true })
  recibidaEn: Date | null;

  @Column({ name: 'entregada_en', type: 'datetime2', nullable: true })
  entregadaEn: Date | null;

  @Column({ name: 'cerrada_en', type: 'datetime2', nullable: true })
  cerradaEn: Date | null;

  @Column({ name: 'motivo_cierre', type: 'nvarchar', length: 400, nullable: true })
  motivoCierre: string | null;

  // --- Componentes de prioridad conservados al asignar (D-38) ---
  @Column({ name: 'puntaje_sisben', type: 'decimal', precision: 8, scale: 6, nullable: true, transformer: decimalTransformer })
  puntajeSisben: number | null;

  @Column({ name: 'puntaje_caracterizacion', type: 'decimal', precision: 8, scale: 6, nullable: true, transformer: decimalTransformer })
  puntajeCaracterizacion: number | null;

  @Column({ name: 'puntaje_antiguedad', type: 'decimal', precision: 8, scale: 6, nullable: true, transformer: decimalTransformer })
  puntajeAntiguedad: number | null;

  @Column({ name: 'coeficientes_prioridad', type: 'varchar', length: 120, nullable: true })
  coeficientesPrioridad: string | null;

  // --- Ubicacion fisica y origen (D-43) ---
  /** Lote fisico que custodia este intento (desde la recepcion o la reasignacion). */
  @Column({ name: 'lote_id', type: 'int', nullable: true })
  loteId: number | null;

  /** DONADOR: unidades que el donador debe traer. REASIGNACION: lote que
   *  ya estaba en el LIS; nace EN_CUSTODIA sin recepcion ficticia. */
  @Column({ name: 'origen', type: 'varchar', length: 15, default: 'DONADOR' })
  origen: 'DONADOR' | 'REASIGNACION';

  /** Inicio del plazo de recogida del estudiante. */
  @Column({ name: 'custodia_desde', type: 'datetime2', nullable: true })
  custodiaDesde: Date | null;

  // --- Prorrogas (aplazamiento del donador / extension del estudiante) ---
  @Column({ name: 'dias_extra', type: 'int', default: 0 })
  diasExtra: number;

  @Column({ name: 'aplazamientos', type: 'int', default: 0 })
  aplazamientos: number;

  @OneToMany(() => Movimiento, (m) => m.asignacion)
  movimientos: Movimiento[];
}
