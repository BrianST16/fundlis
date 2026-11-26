import { FotoEnviable } from './modelos';

export const MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/** Convierte el archivo elegido en el input a lo que espera la API. */
export function leerComoFoto(archivo: File): Promise<FotoEnviable> {
  return new Promise((resolver, rechazar) => {
    if (!MIMES.includes(archivo.type)) {
      rechazar(new Error('La foto debe ser JPEG, PNG o WebP.'));
      return;
    }
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.onload = () => {
      const texto = String(lector.result);
      resolver({
        mime: archivo.type,
        contenidoBase64: texto.replace(/^data:[^;]+;base64,/, ''),
        nombreOriginal: archivo.name,
      });
    };
    lector.readAsDataURL(archivo);
  });
}

export const MIMES_CERTIFICADO = ['application/pdf', 'image/jpeg', 'image/png'];

/** Lee el certificado de estudio (PDF, JPEG o PNG) para enviarlo a la API. */
export function leerComoCertificado(archivo: File): Promise<FotoEnviable> {
  return new Promise((resolver, rechazar) => {
    if (!MIMES_CERTIFICADO.includes(archivo.type)) {
      rechazar(new Error('El certificado debe ser PDF, JPEG o PNG.'));
      return;
    }
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.onload = () =>
      resolver({
        mime: archivo.type,
        contenidoBase64: String(lector.result).replace(/^data:[^;]+;base64,/, ''),
        nombreOriginal: archivo.name,
      });
    lector.readAsDataURL(archivo);
  });
}

/** Abre un archivo protegido (descargado con el token) en una pestana nueva.
 *  Si el navegador bloquea la ventana emergente, lo descarga. */
export function abrirBlob(blob: Blob, nombre = 'archivo'): void {
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank');
  if (!ventana) {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Mensaje legible a partir de un error HTTP de Nest. */
/**
 * Codigos internos (estados, roles, decisiones) -> palabras para la pantalla.
 * Se usa en los mensajes del servidor y en la bandeja, para que nunca se vea
 * un codigo como EN_CUSTODIA o DEFINIR_ESTADO.
 */
const TERMINOS: Record<string, string> = {
  DEFINIR_ESTADO: 'decisión pendiente',
  ASIGNADO: 'asignada', EN_CUSTODIA: 'en custodia', ENTREGADO: 'entregada', DEVOLUCION: 'en devolución', CANCELADO: 'cancelada',
  PENDIENTE_APROBACION: 'pendiente de aprobación', APROBADA: 'aprobada', RECHAZADA: 'rechazada', CANCELADA: 'cancelada',
  CERRADA: 'cerrada', CERRADA_ENTREGA: 'cerrada por entrega', CERRADA_INCUMPLIMIENTO: 'cerrada por incumplimiento',
  ESPERA_RECEPCION: 'en espera de recepción', CUSTODIA_TEMPORAL: 'en custodia temporal', PROPUESTO_DONADOR: 'propuesta al donador',
  POR_DEVOLVER: 'por devolver', ACEPTADO: 'aceptado por el LIS', REASIGNADO: 'emparejado', DEVUELTO: 'devuelto',
  EN_LIS: 'en el LIS', PATRIMONIO_LIS: 'del LIS',
  AUXILIAR_LIS: 'auxiliar', ADMINISTRADOR: 'administrador', SUPERUSUARIO: 'superusuario', ESTUDIANTE: 'estudiante', DONADOR: 'donador',
  APLAZAR: 'dar más tiempo', EXTENDER: 'dar más tiempo', ESPERAR: 'esperar', REASIGNAR: 'reasignar', RECIBIR_LIS: 'recibir para el LIS',
  CUSTODIA_LOCAL: 'custodia Local', SIN_ACCION: 'sin acción', RETIRAR_PROPUESTA: 'retirar la propuesta', CANCELAR_INTENTO: 'cancelar',
  PENDIENTE: 'pendiente', VALIDADO: 'validado', RECHAZADO: 'rechazado', LOCAL: 'Local',
};

/** Reemplaza los codigos internos de un texto por palabras. */
export function textoLegible(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\b[A-Z][A-Z_]{3,}\b/g, (w) => TERMINOS[w] ?? w);
}

/** Un codigo suelto, con mayuscula inicial (para etiquetas). */
export function estadoLegible(codigo: string | null | undefined): string {
  const t = textoLegible(codigo);
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

export function mensajeError(e: any, porDefecto = 'Ocurrió un error.'): string {
  const m = e?.error?.message;
  if (Array.isArray(m)) return textoLegible(m.join(' '));
  return textoLegible(m ?? e?.message ?? porDefecto);
}

export function fecha(valor: string | null | undefined): string {
  if (!valor) return '-';
  return new Date(valor).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Puntaje real en [0,1] con tres decimales (D-38: nunca como porcentaje).
 *  Mismo formato que Emparejamiento (number: '1.3-3'). */
export function puntaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(Number(valor))) return '-';
  return Number(valor).toFixed(3);
}
