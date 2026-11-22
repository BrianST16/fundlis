import { diasHabilesEntre, esHabil, fechaEnBogota, sumarDiasHabiles } from './dias-habiles';
import { aCivil, domingoDePascua, festivosDe } from './festivos-colombia';

describe('Festivos de Colombia (calculados)', () => {
  it('domingo de Pascua de varios anios', () => {
    expect(aCivil(domingoDePascua(2024))).toBe('2024-03-31');
    expect(aCivil(domingoDePascua(2025))).toBe('2025-04-20');
    expect(aCivil(domingoDePascua(2026))).toBe('2026-04-05');
    expect(aCivil(domingoDePascua(2027))).toBe('2027-03-28');
  });

  it('2026: los 18 festivos oficiales, exactos', () => {
    expect(festivosDe(2026).map((f) => f.fecha)).toEqual([
      '2026-01-01', // Anio Nuevo
      '2026-01-12', // Reyes (6 ene, martes -> lunes)
      '2026-03-23', // San Jose (19 mar, jueves -> lunes)
      '2026-04-02', // Jueves Santo
      '2026-04-03', // Viernes Santo
      '2026-05-01', // Trabajo
      '2026-05-18', // Ascension
      '2026-06-08', // Corpus Christi
      '2026-06-15', // Sagrado Corazon
      '2026-06-29', // San Pedro (ya es lunes)
      '2026-07-20', // Independencia
      '2026-08-07', // Boyaca
      '2026-08-17', // Asuncion (15 ago, sabado -> lunes)
      '2026-10-12', // Dia de la Raza (ya es lunes)
      '2026-11-02', // Todos los Santos (1 nov, domingo -> lunes)
      '2026-11-16', // Cartagena (11 nov, miercoles -> lunes)
      '2026-12-08', // Inmaculada
      '2026-12-25', // Navidad
    ]);
  });

  it('2025: coincidencia de San Pedro y Sagrado Corazon el 30 de junio (17 fechas)', () => {
    const f = festivosDe(2025);
    expect(f).toHaveLength(17);
    const junio30 = f.find((x) => x.fecha === '2025-06-30');
    expect(junio30.nombre).toContain('San Pedro');
    expect(junio30.nombre).toContain('Sagrado Corazon');
    expect(f.map((x) => x.fecha)).toEqual(
      expect.arrayContaining(['2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18', '2025-06-02', '2025-06-23', '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17']),
    );
  });
});

describe('Dias habiles del LIS', () => {
  it('sabado, domingo y festivo no son habiles; un martes normal si', () => {
    expect(esHabil('2026-11-21')).toBe(false); // sabado
    expect(esHabil('2026-11-22')).toBe(false); // domingo
    expect(esHabil('2026-12-08')).toBe(false); // festivo (martes)
    expect(esHabil('2026-11-24')).toBe(true);
  });

  it('10 dias habiles desde el viernes 20-nov-2026 vencen el viernes 4-dic', () => {
    expect(sumarDiasHabiles('2026-11-20', 10)).toBe('2026-12-04');
  });

  it('3 dias habiles desde el viernes 4-dic-2026 saltan el festivo del 8-dic', () => {
    expect(sumarDiasHabiles('2026-12-04', 3)).toBe('2026-12-10');
  });

  it('cruce de anio: el 1 de enero es festivo', () => {
    expect(sumarDiasHabiles('2026-12-31', 1)).toBe('2027-01-04');
  });

  it('un cierre configurado del LIS no cuenta como dia habil', () => {
    const cierres = [{ desde: '2026-11-30', hasta: '2026-12-02' }];
    expect(esHabil('2026-12-01', cierres)).toBe(false);
    expect(sumarDiasHabiles('2026-11-20', 10, cierres)).toBe('2026-12-10');
  });

  it('dias habiles entre fechas, positivo y negativo', () => {
    expect(diasHabilesEntre('2026-11-25', '2026-12-04')).toBe(7);
    expect(diasHabilesEntre('2026-12-04', '2026-12-04')).toBe(0);
    expect(diasHabilesEntre('2026-12-07', '2026-12-04')).toBe(-1);
  });

  it('la fecha civil se toma en hora de Bogota, no en UTC', () => {
    // 03:00 UTC del 5-dic = 22:00 del 4-dic en Bogota.
    expect(fechaEnBogota(new Date('2026-12-05T03:00:00Z'))).toBe('2026-12-04');
    expect(fechaEnBogota(new Date('2026-12-05T05:00:00Z'))).toBe('2026-12-05');
  });

  it('rechaza n negativo y se protege de cierres absurdos', () => {
    expect(() => sumarDiasHabiles('2026-11-20', -1)).toThrow();
    expect(() => sumarDiasHabiles('2026-11-20', 1, [{ desde: '2026-01-01', hasta: '2099-12-31' }])).toThrow();
  });
});
