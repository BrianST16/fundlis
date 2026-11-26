import { LimitadorPeticiones, cabecerasSeguridad, nombreArchivoSeguro, reglasPorDefecto } from './seguridad-http';

/** D-65: endurecimiento HTTP (S1 cabeceras, S2 limite de peticiones, S6 nombres de archivo). */
describe('Seguridad HTTP (D-65)', () => {
  describe('S1: cabeceras', () => {
    function cabeceras(produccion: boolean) {
      const puestas: Record<string, string> = {};
      const res: any = { setHeader: (k: string, v: string) => (puestas[k] = v) };
      const next = jest.fn();
      cabecerasSeguridad(produccion)({} as any, res, next);
      return { puestas, next };
    }

    it('pone nosniff, anti-iframe, sin referrer y una CSP cerrada', () => {
      const { puestas, next } = cabeceras(false);
      expect(puestas['X-Content-Type-Options']).toBe('nosniff');
      expect(puestas['X-Frame-Options']).toBe('DENY');
      expect(puestas['Referrer-Policy']).toBe('no-referrer');
      expect(puestas['Content-Security-Policy']).toContain("default-src 'none'");
      expect(puestas['Strict-Transport-Security']).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('en produccion agrega HSTS', () => {
      expect(cabeceras(true).puestas['Strict-Transport-Security']).toContain('max-age=');
    });
  });

  describe('S2: límite de peticiones', () => {
    let t = 0;
    const reloj = () => t;
    afterEach(() => (t = 0));

    it('el login admite 10 por minuto por IP; la 11 espera', () => {
      const l = new LimitadorPeticiones(reglasPorDefecto(), reloj);
      for (let i = 0; i < 10; i++) expect(l.registrar('1.1.1.1', 'POST', '/api/auth/google')).toBeNull();
      expect(l.registrar('1.1.1.1', 'POST', '/api/auth/google')).toBeGreaterThan(0);
      // Otra IP no se ve afectada.
      expect(l.registrar('2.2.2.2', 'POST', '/api/auth/google')).toBeNull();
      l.detener();
    });

    it('al pasar la ventana se vuelve a permitir', () => {
      const l = new LimitadorPeticiones(reglasPorDefecto(), reloj);
      for (let i = 0; i < 11; i++) l.registrar('1.1.1.1', 'POST', '/api/auth/google');
      t = 61_000;
      expect(l.registrar('1.1.1.1', 'POST', '/api/auth/google')).toBeNull();
      l.detener();
    });

    it('la regla general cuenta todas las rutas', () => {
      const l = new LimitadorPeticiones(reglasPorDefecto(3), reloj);
      expect(l.registrar('1.1.1.1', 'GET', '/api/ofertas/catalogo')).toBeNull();
      expect(l.registrar('1.1.1.1', 'GET', '/api/peticiones/catalogo')).toBeNull();
      expect(l.registrar('1.1.1.1', 'GET', '/api/categorias')).toBeNull();
      expect(l.registrar('1.1.1.1', 'GET', '/api/categorias')).toBeGreaterThan(0);
      l.detener();
    });

    it('el middleware responde 429 con Retry-After, y no cuenta la salud ni las verificaciones CORS', () => {
      const l = new LimitadorPeticiones([{ nombre: 'general', max: 1, ventanaMs: 60_000 }], reloj);
      const mw = l.middleware();
      const res: any = { setHeader: jest.fn(), status: jest.fn(() => res), json: jest.fn() };
      const next = jest.fn();
      mw({ method: 'GET', path: '/api/categorias', ip: '1.1.1.1' } as any, res, next);
      mw({ method: 'OPTIONS', path: '/api/categorias', ip: '1.1.1.1' } as any, res, next);
      mw({ method: 'GET', path: '/api/salud', ip: '1.1.1.1' } as any, res, next);
      expect(next).toHaveBeenCalledTimes(3);
      mw({ method: 'GET', path: '/api/categorias', ip: '1.1.1.1' } as any, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
      l.detener();
    });
  });

  describe('S6: nombre de archivo seguro', () => {
    it('quita comillas, saltos de línea, barras y tildes', () => {
      expect(nombreArchivoSeguro('foto "rara".jpg')).toBe('foto _rara_.jpg');
      expect(nombreArchivoSeguro('a\r\nSet-Cookie: x=1.png')).toBe('a_Set-Cookie_ x_1.png');
      expect(nombreArchivoSeguro('../../etc/passwd')).toBe('.._.._etc_passwd');
      expect(nombreArchivoSeguro('Cédula año.pdf')).toBe('Cedula ano.pdf');
    });

    it('usa un nombre por defecto si no queda nada útil', () => {
      expect(nombreArchivoSeguro('')).toBe('archivo');
      expect(nombreArchivoSeguro(null, 'foto')).toBe('foto');
      expect(nombreArchivoSeguro('"""', 'foto')).toBe('foto');
    });

    it('acota el largo', () => {
      expect(nombreArchivoSeguro('a'.repeat(300)).length).toBe(100);
    });
  });
});
