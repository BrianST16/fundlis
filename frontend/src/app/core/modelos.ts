export type Perfil = 'ESTUDIANTE' | 'DONADOR';
export type Rol = 'AUXILIAR_LIS' | 'ADMINISTRADOR' | 'SUPERUSUARIO';

export interface Sesion {
  sub: number;
  email: string;
  nombre: string;
  perfil: Perfil;
  roles: Rol[];
}

export interface Categoria {
  id: number;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  /** Medida de compatibilidad (p. ej. Talla). null = la categoria no la usa. */
  medidaNombre?: string | null;
  medidaUnidad?: string | null;
  medidaMin?: number | null;
  medidaMax?: number | null;
}

/** Escala del proyecto para el estado de conservacion (compatibilidad, D-41). */
export const ESTADOS_CONSERVACION: { valor: number; texto: string }[] = [
  { valor: 1, texto: '1 - Deteriorado / para reparar' },
  { valor: 2, texto: '2 - Usado con desgaste visible' },
  { valor: 3, texto: '3 - Usado en buen estado' },
  { valor: 4, texto: '4 - Como nuevo' },
  { valor: 5, texto: '5 - Nuevo' },
];

export interface OfertaCatalogo {
  id: number;
  /** D-64 (C3): solo en "Mis donaciones"; el servidor dice si aun se puede cancelar. */
  puedeCancelar?: boolean;
  nombreProducto: string;
  descripcion: string;
  categoria: { id: number; nombre: string | null };
  cantidadDisponible: number;
  cantidadOfertada: number;
  fotoId: number | null;
  publicadaEn: string;
  estado?: string;
  motivoRechazo?: string | null;
  saldo?: {
    ofertada: number;
    comprometida: number;
    recibida: number;
    entregada: number;
    enDevolucion: number;
    destinoLocal: number;
    enLoteFaltante: number;
    disponible: number;
  };
  donador?: { id: number; nombre: string; email: string };
  estadoConservacion?: number;
  estadoConservacionTexto?: string | null;
  medida?: number | null;
  medidaNombre?: string | null;
}

export interface PeticionVista {
  id: number;
  descripcion: string;
  categoria: { id: number; nombre: string | null };
  publicadaEn: string;
  estado?: string;
  motivoRechazo?: string | null;
  motivoCierre?: string | null;
  asignacionVigente?: {
    id: number;
    ofertaId: number;
    cantidadAsignada: number;
    estado: string;
  } | null;
  estudiante?: { id: number; nombre: string; email: string };
  estadoMinimo?: number;
  medidaMin?: number | null;
  medidaMax?: number | null;
}

export interface FormularioCaracterizacion {
  preguntas: {
    id: number;
    texto: string;
    orden: number;
    opciones: { id: number; texto: string }[];
  }[];
  gruposSisben: { codigo: string; descripcion: string }[];
}

export interface MiCaracterizacion {
  id: number;
  grupoSisben: string;
  puntajeTotal: number;
  completadaEn: string;
  actualizadaEn: string | null;
  respuestas: { preguntaId: number; opcionId: number }[];
}

/** Certificado de estudio vigente (D-46): opcional, solo dueno y administrador. */
export type EstadoRevisionCertificado = 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO';
export interface CertificadoMeta {
  nombreOriginal: string | null;
  mime: string;
  tamanoBytes: number;
  subidoEn: string;
  estadoRevision: EstadoRevisionCertificado;
  revisadoEn: string | null;
  observacion: string | null;
}

/** Componentes del puntaje de prioridad (numeros reales en [0,1], no porcentajes). */
export interface Prioridad {
  sisben: number;
  caracterizacion: number;
  antiguedad: number;
  total: number;
}

export interface Candidato {
  posicion: number;
  peticionId: number;
  estudianteId: number;
  estudianteNombre: string;
  descripcionPeticion: string;
  creadaEn: string;
  atributos: { estadoMinimo: number; medidaMin: number | null; medidaMax: number | null };
  sinCaracterizacion: boolean;
  /** Solo para el administrador (D-39). */
  grupoSisben?: string;
  prioridad: Prioridad;
}

export interface ResultadoEmparejamiento {
  origen: 'OFERTA' | 'LOTE';
  loteId?: number;
  cantidadDisponible: number;
  oferta: {
    id: number;
    nombreProducto: string;
    descripcion: string | null;
    fotoId: number | null;
    categoriaId: number;
    categoria: string | null;
    estadoConservacion: number;
    estadoConservacionTexto: string | null;
    medida: number | null;
    medidaNombre: string | null;
  };
  busqueda: { dimensiones: string[]; cajaMin: number[]; cajaMax: number[] };
  coeficientes: { caracterizacion: number; sisben: number; antiguedad: number; horizonteDias: number };
  coeficientesTexto: string;
  escalaPrioridad: string;
  candidatos: Candidato[];
  destinoLocal: { tipo: 'LOCAL'; nombre: string; reglas: string[] };
  diagnostico: {
    totalEnCategoria: number;
    compatibles: number;
    incompatibles: number;
    nodosVisitados: number;
    alturaArbol: number;
    coincideConFiltroLineal: boolean;
    msConstruccion: number;
    msConsulta: number;
  };
}

export interface LoteFisico {
  id: number;
  ofertaId: number;
  producto: string;
  categoria: string;
  cantidad: number;
  ubicacion: 'EN_LIS' | 'ENTREGADO' | 'DEVUELTO' | 'PATRIMONIO_LIS';
  origen: string;
  titular: { tipo: 'ASIGNACION' | 'LOCAL'; id: number; estado: string } | null;
  sinDestino: boolean;
  /** D-50: en custodia temporal LOCAL; se puede emparejar directo. */
  enCustodiaLocal?: boolean;
  sinDestinoDesde: string | null;
  creadoEn: string;
}

export type EstadoLocal =
  | 'ESPERA_RECEPCION' | 'CUSTODIA_TEMPORAL' | 'PROPUESTO_DONADOR' | 'POR_DEVOLVER'
  | 'ACEPTADO' | 'REASIGNADO' | 'DEVUELTO' | 'CANCELADO';

export interface DestinoLocal {
  id: number;
  estado: EstadoLocal;
  origen: 'OFERTA' | 'LOTE';
  ofertaId: number;
  producto: string;
  categoria: string;
  cantidad: number;
  loteId: number | null;
  motivo: string;
  seleccionadoEn: string;
  custodiaDesde: string | null;
  aceptacionSolicitada: boolean;
  aceptadoPor: number | null;
  aceptadoEn: string | null;
  motivoCierre: string | null;
  /** D-50: propuesta al donador y su respuesta. */
  propuestaMotivo?: string | null;
  propuestaLimite?: string | null;
  respuestaDonador?: 'ACEPTA' | 'RECHAZA' | null;
  respuestaEn?: string | null;
  respuestaMotivo?: string | null;
  /** Contacto del donador (solo personal LIS). */
  donador?: { id: number; nombre: string; email: string };
}

/** D-50: propuesta del LIS vista por el donador en "Mis donaciones". */
export interface PropuestaLocal {
  id: number;
  estado: EstadoLocal;
  ofertaId: number;
  producto: string;
  categoria: string;
  fotoId: number | null;
  cantidad: number;
  motivo: string | null;
  limite: string | null;
  propuestaEn: string;
  respuesta: 'ACEPTA' | 'RECHAZA' | null;
  respuestaEn: string | null;
  respuestaMotivo: string | null;
}

export interface NotificacionBandeja {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  entidad: string | null;
  entidadId: number | null;
  /** D-51: foto adjunta (p. ej. entrega final al beneficiario). */
  evidenciaId?: number | null;
  creadaEn: string;
  leida: boolean;
}

/** D-52: trazabilidad completa de una donacion (solo administrador). */
export interface EventoTrazabilidad {
  id: string;
  fecha: string;
  clase: 'ESTADO' | 'MOVIMIENTO';
  grupo: 'OFERTA' | 'ASIGNACION' | 'LOTE' | 'LOCAL';
  referencia: string;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  tipoMovimiento: string | null;
  actor: string;
  explicacion: string | null;
  cantidad: number | null;
  contraparte: string | null;
  evidenciaId: number | null;
}

export interface Trazabilidad {
  oferta: {
    id: number;
    producto: string;
    categoria: string | null;
    cantidad: number;
    estado: string;
    origen: string;
    ofertaOrigenId: number | null;
    fotoId: number | null;
    creadaEn: string;
    donador: { nombre: string; email: string } | null;
  };
  asignaciones: { id: number; estado: string; origen: string; cantidad: number; peticionId: number; estudiante: string | null }[];
  derivadas: { id: number; cantidad: number }[];
  resumen: { eventos: number; cambiosDeEstado: number; movimientosFisicos: number; fotos: number };
  eventos: EventoTrazabilidad[];
}

export type DecisionTarea = 'APLAZAR' | 'CANCELAR_INTENTO' | 'EXTENDER' | 'REASIGNAR' | 'DEVOLUCION' | 'CUSTODIA_LOCAL' | 'RETIRAR_PROPUESTA' | 'ESPERAR' | 'RECIBIR_LIS' | 'SIN_ACCION';

export interface TareaDefinirEstado {
  id: number;
  tipo: 'DEFINIR_ESTADO';
  clave: string;
  asignacionId: number | null;
  destinoLocalId: number | null;
  loteId: number | null;
  responsable: 'DONADOR' | 'ESTUDIANTE' | 'LIS';
  fechaLimite: string;
  estado: 'ABIERTA' | 'RESUELTA';
  creadaEn: string;
  decision: DecisionTarea | null;
  motivo: string | null;
  /** D-58: solo en tareas de asignaciones abiertas. */
  prorroga?: { dias: number; restantes: number };
  /** D-60/D-61: custodia Local, lote sin destino, devolucion pendiente (con tope)
   *  y propuesta sin respuesta (restantes = null: sin tope). */
  espera?: { dias: number; restantes: number | null };
}

export interface AsignacionResumen {
  id: number;
  estado: string;
  /** Lote fisico (solo cuando el producto ya paso por el LIS). */
  loteId?: number | null;
  cantidadAsignada: number;
  asignadaEn: string;
  recibidaEn: string | null;
  puntajePrioridad: number | null;
  producto: string;
  categoria: string;
  donador: { id: number; nombre: string };
  estudiante: { id: number; nombre: string };
  ofertaId: number;
  peticionId: number;
}

export interface MiAsignacion {
  id: number;
  estado: string;
  cantidadAsignada: number;
  producto: string;
  categoria: string;
  asignadaEn: string;
  recibidaEn: string | null;
  entregadaEn: string | null;
  motivoCierre: string | null;
  miPapel: 'DONADOR' | 'ESTUDIANTE';
  /** Solo el del objeto propio: ofertaId si dono, peticionId si recibe. */
  ofertaId: number | null;
  peticionId: number | null;
}

export interface UsuarioAdmin {
  id: number;
  email: string;
  nombre: string;
  perfil: Perfil;
  activo: boolean;
  motivoBloqueo: string | null;
  creadoEn: string;
  ultimoIngresoEn: string | null;
  roles: Rol[];
}

export interface FotoEnviable {
  mime: string;
  contenidoBase64: string;
  nombreOriginal?: string;
}

// --- Pilar B: plazos y tarea DEFINIR_ESTADO ---
export type EstadoPlazo = 'EN_PLAZO' | 'POR_VENCER' | 'VENCIDO';

export interface Plazo {
  responsable: 'DONADOR' | 'ESTUDIANTE';
  evento: 'ENTREGA_EN_LIS' | 'RECOGIDA_EN_LIS';
  inicio: string;
  diasHabiles: number;
  fechaLimite: string;
  diasHabilesRestantes: number;
  estado: EstadoPlazo;
  tarea: 'DEFINIR_ESTADO' | null;
}

export interface ItemBandejaPlazos {
  asignacionId: number;
  estadoAsignacion: string;
  cantidadAsignada: number;
  producto: string;
  categoria: string;
  donador: { id: number; nombre: string; email: string };
  estudiante: { id: number; nombre: string; email: string };
  plazo: Plazo;
}

export interface MiPlazo {
  asignacionId: number;
  producto: string;
  cantidadAsignada: number;
  responsable: 'DONADOR' | 'ESTUDIANTE';
  evento: string;
  fechaLimite: string;
  diasHabilesRestantes: number;
  estado: EstadoPlazo;
}

// --- Pilar C: analitica y ranking ---
export interface Indicadores {
  generadoEn: string;
  ofertasPorEstado: Record<string, number>;
  peticionesPorEstado: Record<string, number>;
  asignacionesPorEstado: Record<string, number>;
  unidadesOfertadas: number;
  unidadesEntregadas: number;
  unidadesEnLis?: number;
  lotesSinDestino?: number;
  unidadesPatrimonioLis?: number;
  tasaEntrega: number | null;
  tasaAtencionPeticiones: number | null;
  diasPromedioAsignacionARecepcion: number | null;
  diasPromedioRecepcionAEntrega: number | null;
}

export interface FilaRankingEstudiante {
  posicion: number;
  usuarioId: number;
  nombre: string | null;
  email: string | null;
  peticiones: number;
  ayudasRecibidas: number;
  incumplimientos: number;
  cumplimiento: number;
  actividad: number;
  reputacion: number;
  explicacion: string;
}

/** Donadores: indicador directo (D-40). */
export interface FilaRankingDonador {
  /** D-49: completadas >= umbralRecurrente (parametro MIN_DONACIONES_RECURRENTE). */
  recurrente: boolean;
  umbralRecurrente: number;
  posicion: number;
  usuarioId: number;
  nombre: string | null;
  email: string | null;
  compromisos: number;
  completadas: number;
  fallidas: number;
  pendientes: number;
  tasaCumplimiento: number | null;
}

export interface AlertasComportamiento {
  regla: { umbralFallos: number; umbralReputacion: number };
  estudiantes: (FilaRankingEstudiante & { motivos: string[] })[];
  donadores: (FilaRankingDonador & { motivos: string[] })[];
}
