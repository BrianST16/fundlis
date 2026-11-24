/** Perfil del usuario. Se deduce del dominio del correo verificado por
 *  Google y es excluyente por cuenta. */
export enum Perfil {
  ESTUDIANTE = 'ESTUDIANTE',
  DONADOR = 'DONADOR',
}

/** Roles administrativos adicionales.
 *  - AUXILIAR_LIS: lo otorga un administrador.
 *  - ADMINISTRADOR: solo lo otorga/quita un SUPERUSUARIO (salvo el
 *    bootstrap por ADMIN_EMAILS).
 *  - SUPERUSUARIO: mantenimiento con acceso total. Solo se asigna por
 *    script de BD (db/scripts/asignar_superusuario.sql), nunca por la API. */
export enum Rol {
  AUXILIAR_LIS = 'AUXILIAR_LIS',
  ADMINISTRADOR = 'ADMINISTRADOR',
  SUPERUSUARIO = 'SUPERUSUARIO',
}

export enum EstadoOferta {
  PENDIENTE_APROBACION = 'PENDIENTE_APROBACION',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  CANCELADA = 'CANCELADA',
  CERRADA = 'CERRADA',
}

export enum EstadoPeticion {
  PENDIENTE_APROBACION = 'PENDIENTE_APROBACION',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  CANCELADA = 'CANCELADA',
  CERRADA_ENTREGA = 'CERRADA_ENTREGA',
  CERRADA_INCUMPLIMIENTO = 'CERRADA_INCUMPLIMIENTO',
}

/** Estados del intento de asignacion (OFERTA_X_PETICION).
 *  No existe recepcion ni entrega parcial de una misma asignacion. */
export enum EstadoAsignacion {
  ASIGNADO = 'ASIGNADO',
  EN_CUSTODIA = 'EN_CUSTODIA',
  ENTREGADO = 'ENTREGADO',
  DEVOLUCION = 'DEVOLUCION',
  CANCELADO = 'CANCELADO',
}

export enum TipoMovimiento {
  RECEPCION = 'RECEPCION',
  ENTREGA = 'ENTREGA',
  DEVOLUCION = 'DEVOLUCION',
}

export enum EntidadHistorial {
  OFERTA = 'OFERTA',
  PETICION = 'PETICION',
  ASIGNACION = 'ASIGNACION',
  USUARIO = 'USUARIO',
  LOTE = 'LOTE',
  LOCAL = 'LOCAL',
  TAREA = 'TAREA',
}

/** Estados en los que un intento de asignacion sigue vigente y por tanto
 *  compromete unidades de la oferta. */
export const ASIGNACION_VIGENTE: EstadoAsignacion[] = [
  EstadoAsignacion.ASIGNADO,
  EstadoAsignacion.EN_CUSTODIA,
];

/** Estados de peticion que cuentan para el limite de 5 por estudiante. */
export const PETICION_CUENTA_LIMITE: EstadoPeticion[] = [
  EstadoPeticion.PENDIENTE_APROBACION,
  EstadoPeticion.APROBADA,
];

export const MIMES_EVIDENCIA = ['image/jpeg', 'image/png', 'image/webp'];

/** Formatos aceptados para el certificado de estudio (D-46). */
export const MIMES_CERTIFICADO = ['application/pdf', 'image/jpeg', 'image/png'];
