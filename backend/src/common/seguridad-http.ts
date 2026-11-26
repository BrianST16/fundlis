import type { NextFunction, Request, Response } from 'express';

/**
 * Endurecimiento HTTP sin dependencias externas (D-65).
 *
 * S1 - Cabeceras de seguridad. La API solo devuelve JSON e imagenes/PDF que
 * el frontend descarga por HttpClient (blob), asi que la politica es la mas
 * cerrada posible: nada se ejecuta ni se incrusta desde sus respuestas.
 */
export function cabecerasSeguridad(produccion: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // HSTS solo tiene sentido detras de HTTPS (produccion).
    if (produccion) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/** Una regla de limite: peticiones maximas por IP en una ventana. */
export interface ReglaLimite {
  nombre: string;
  /** Coincide si la ruta empieza asi (con el prefijo /api). Sin ruta = regla general. */
  ruta?: string;
  metodo?: string;
  max: number;
  ventanaMs: number;
}

/**
 * S2 - Limite de peticiones por IP (ventana fija, en memoria).
 * Suficiente para una sola instancia del backend; con varias instancias se
 * reemplaza por un almacen compartido (p. ej. Redis) sin cambiar las reglas.
 * Las reglas especificas (login, subidas) se cuentan aparte de la general.
 */
export class LimitadorPeticiones {
  private readonly contadores = new Map<string, { n: number; hasta: number }>();
  private readonly limpieza: ReturnType<typeof setInterval>;

  constructor(
    private readonly reglas: ReglaLimite[],
    private readonly ahora: () => number = () => Date.now(),
  ) {
    // Borra ventanas vencidas para no crecer sin limite. unref: no retiene el proceso.
    this.limpieza = setInterval(() => this.limpiar(), 60_000);
    this.limpieza.unref?.();
  }

  /** Reglas que aplican a una peticion: la especifica (si hay) y la general. */
  private aplicables(metodo: string, ruta: string): ReglaLimite[] {
    return this.reglas.filter(
      (r) => (!r.ruta || ruta.startsWith(r.ruta)) && (!r.metodo || r.metodo === metodo),
    );
  }

  /** Registra la peticion; devuelve los segundos de espera si se pasa del limite. */
  registrar(ip: string, metodo: string, ruta: string): number | null {
    const t = this.ahora();
    for (const regla of this.aplicables(metodo, ruta)) {
      const clave = `${regla.nombre}|${ip}`;
      const c = this.contadores.get(clave);
      if (!c || t >= c.hasta) {
        this.contadores.set(clave, { n: 1, hasta: t + regla.ventanaMs });
        continue;
      }
      c.n++;
      if (c.n > regla.max) return Math.max(1, Math.ceil((c.hasta - t) / 1000));
    }
    return null;
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Las verificaciones previas de CORS y la salud no cuentan.
      if (req.method === 'OPTIONS' || req.path.startsWith('/api/salud')) return next();
      const espera = this.registrar(req.ip ?? 'desconocida', req.method, req.path);
      if (espera === null) return next();
      res.setHeader('Retry-After', String(espera));
      res.status(429).json({ statusCode: 429, message: 'Demasiadas peticiones. Intenta de nuevo en unos segundos.' });
    };
  }

  private limpiar(): void {
    const t = this.ahora();
    for (const [clave, c] of this.contadores) if (t >= c.hasta) this.contadores.delete(clave);
  }

  detener(): void {
    clearInterval(this.limpieza);
  }
}

/** Reglas por defecto (por minuto y por IP). `general` se puede ajustar por entorno. */
export function reglasPorDefecto(general = 300): ReglaLimite[] {
  const minuto = 60_000;
  return [
    { nombre: 'login', ruta: '/api/auth/google', metodo: 'POST', max: 10, ventanaMs: minuto },
    { nombre: 'fotos', ruta: '/api/evidencias', metodo: 'POST', max: 30, ventanaMs: minuto },
    { nombre: 'certificado', ruta: '/api/caracterizacion/mia/certificado', metodo: 'PUT', max: 10, ventanaMs: minuto },
    { nombre: 'general', max: general, ventanaMs: minuto },
  ];
}

/**
 * S6 - Nombre de archivo seguro para Content-Disposition: sin comillas,
 * barras, caracteres de control ni saltos de linea; largo acotado.
 */
export function nombreArchivoSeguro(nombre: string | null | undefined, porDefecto = 'archivo'): string {
  const limpio = (nombre ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // tildes fuera (cabecera ASCII)
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return limpio && !/^[._ ]+$/.test(limpio) ? limpio : porDefecto;
}
