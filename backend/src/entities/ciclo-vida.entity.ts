import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Cierre del LIS (vacaciones, cierres administrativos). */
@Entity('CIERRE_LIS')
export class CierreLis {
  @PrimaryGeneratedColumn()
  id: number;

  /** Fecha civil AAAA-MM-DD. */
  @Column({ name: 'desde', type: 'date' })
  desde: string;

  @Column({ name: 'hasta', type: 'date' })
  hasta: string;

  @Column({ name: 'motivo', type: 'nvarchar', length: 200 })
  motivo: string;

  @Column({ name: 'creado_por', type: 'int', nullable: true })
  creadoPor: number | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime2' })
  creadoEn: Date;
}

export type DecisionTarea =
  | 'APLAZAR'
  | 'CANCELAR_INTENTO'
  | 'EXTENDER'
  | 'REASIGNAR'
  | 'DEVOLUCION'
  | 'CUSTODIA_LOCAL'
  /** D-50: propuesta LOCAL sin respuesta del donador. */
  | 'RETIRAR_PROPUESTA'
  /** D-60: esperar con fecha nueva (custodia Local, lote sin destino, devolucion pendiente). */
  | 'ESPERAR'
  /** D-62: devolucion no retirada; solo el administrador la recibe para el LIS. */
  | 'RECIBIR_LIS'
  | 'SIN_ACCION';

/** Tarea DEFINIR_ESTADO (D-23). Idempotente por clave. */
@Entity('TAREA')
export class Tarea {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tipo', type: 'varchar', length: 20 })
  tipo: 'DEFINIR_ESTADO';

  @Column({ name: 'clave', type: 'varchar', length: 120 })
  clave: string;

  @Column({ name: 'asignacion_id', type: 'int', nullable: true })
  asignacionId: number | null;

  @Column({ name: 'destino_local_id', type: 'int', nullable: true })
  destinoLocalId: number | null;

  @Column({ name: 'lote_id', type: 'int', nullable: true })
  loteId: number | null;

  @Column({ name: 'responsable', type: 'varchar', length: 12 })
  responsable: 'DONADOR' | 'ESTUDIANTE' | 'LIS';

  @Column({ name: 'fecha_limite', type: 'date' })
  fechaLimite: string;

  @Column({ name: 'estado', type: 'varchar', length: 10, default: 'ABIERTA' })
  estado: 'ABIERTA' | 'RESUELTA';

  @CreateDateColumn({ name: 'creada_en', type: 'datetime2' })
  creadaEn: Date;

  @Column({ name: 'resuelta_por', type: 'int', nullable: true })
  resueltaPor: number | null;

  @Column({ name: 'resuelta_en', type: 'datetime2', nullable: true })
  resueltaEn: Date | null;

  @Column({ name: 'decision', type: 'varchar', length: 30, nullable: true })
  decision: DecisionTarea | null;

  @Column({ name: 'motivo', type: 'nvarchar', length: 400, nullable: true })
  motivo: string | null;
}

/** Bandeja interna: una fila por destinatario (D-42). */
@Entity('NOTIFICACION')
export class Notificacion {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'usuario_id', type: 'int' })
  usuarioId: number;

  @Column({ name: 'tipo', type: 'varchar', length: 40 })
  tipo: string;

  @Column({ name: 'titulo', type: 'nvarchar', length: 200 })
  titulo: string;

  @Column({ name: 'mensaje', type: 'nvarchar', length: 1000 })
  mensaje: string;

  @Column({ name: 'entidad', type: 'varchar', length: 20, nullable: true })
  entidad: string | null;

  @Column({ name: 'entidad_id', type: 'int', nullable: true })
  entidadId: number | null;

  @Column({ name: 'clave', type: 'varchar', length: 160 })
  clave: string;

  /** D-51: foto adjunta (p. ej. entrega final). Solo la ve el destinatario. */
  @Column({ name: 'evidencia_id', type: 'int', nullable: true })
  evidenciaId: number | null;

  @CreateDateColumn({ name: 'creada_en', type: 'datetime2' })
  creadaEn: Date;

  @Column({ name: 'leida_en', type: 'datetime2', nullable: true })
  leidaEn: Date | null;
}

export type EstadoCorreo = 'PENDIENTE' | 'ENVIADO' | 'ERROR' | 'SIN_CONFIGURACION' | 'DESCARTADO';

/** Correo saliente (outbox) con reintentos. */
@Entity('CORREO_SALIDA')
export class CorreoSalida {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'notificacion_id', type: 'bigint' })
  notificacionId: string;

  @Column({ name: 'destinatario', type: 'varchar', length: 320 })
  destinatario: string;

  @Column({ name: 'asunto', type: 'nvarchar', length: 200 })
  asunto: string;

  @Column({ name: 'cuerpo', type: 'nvarchar', length: 'MAX' })
  cuerpo: string;

  @Column({ name: 'estado', type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: EstadoCorreo;

  @Column({ name: 'intentos', type: 'int', default: 0 })
  intentos: number;

  @Column({ name: 'ultimo_error', type: 'nvarchar', length: 500, nullable: true })
  ultimoError: string | null;

  @Column({ name: 'proximo_intento_en', type: 'datetime2', nullable: true })
  proximoIntentoEn: Date | null;

  @Column({ name: 'enviado_en', type: 'datetime2', nullable: true })
  enviadoEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime2' })
  creadoEn: Date;
}
