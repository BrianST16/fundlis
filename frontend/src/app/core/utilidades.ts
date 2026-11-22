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

/** Mensaje legible a partir de un error HTTP de Nest. */
export function mensajeError(e: any, porDefecto = 'Ocurrio un error.'): string {
  const m = e?.error?.message;
  if (Array.isArray(m)) return m.join(' ');
  return m ?? e?.message ?? porDefecto;
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

export function porcentaje(valor: number): string {
  return `${(valor * 100).toFixed(1)}%`;
}
