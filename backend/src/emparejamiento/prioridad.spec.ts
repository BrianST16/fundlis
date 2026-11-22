import { calcularPrioridad, compararPrioridad, componenteAntiguedad, describirCoeficientes, normalizarCoeficientes } from './prioridad';

const COEF = { caracterizacion: 0.5, sisben: 0.3, antiguedad: 0.2, horizonteDias: 90 };
const AHORA = new Date('2026-11-20T15:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);

describe('Puntaje de prioridad (D-38)', () => {
  it('ejemplo calculado a mano: componentes separados y total en [0,1]', () => {
    // S=0.8 (grupo Sisben), C=0.6 (caracterizacion), A=45/90=0.5 (antiguedad)
    const p = calcularPrioridad({ puntajeSisben: 0.8, puntajeCaracterizacion: 0.6, creadaEn: hace(45) }, COEF, AHORA);
    expect(p).toEqual({ sisben: 0.8, caracterizacion: 0.6, antiguedad: 0.5, total: 0.64 }); // 0.5*0.6+0.3*0.8+0.2*0.5
  });

  it('Sisben y caracterizacion son componentes distintos: cambiar uno no altera el otro', () => {
    const a = calcularPrioridad({ puntajeSisben: 1, puntajeCaracterizacion: 0, creadaEn: AHORA }, COEF, AHORA);
    const b = calcularPrioridad({ puntajeSisben: 0, puntajeCaracterizacion: 1, creadaEn: AHORA }, COEF, AHORA);
    expect([a.sisben, a.caracterizacion, a.total]).toEqual([1, 0, 0.3]);
    expect([b.sisben, b.caracterizacion, b.total]).toEqual([0, 1, 0.5]);
  });

  it('antiguedad ESTABLE: depende solo de la fecha original y del horizonte, no de otras peticiones', () => {
    expect(componenteAntiguedad(hace(30), AHORA, 90)).toBeCloseTo(1 / 3, 6);
    expect(componenteAntiguedad(hace(200), AHORA, 90)).toBe(1); // satura en 1
    expect(componenteAntiguedad(hace(0), AHORA, 90)).toBe(0);
    // Misma peticion, mismo momento: mismo puntaje sin importar con quien compita.
    const x = calcularPrioridad({ puntajeSisben: 0.5, puntajeCaracterizacion: 0.5, creadaEn: hace(10) }, COEF, AHORA);
    const y = calcularPrioridad({ puntajeSisben: 0.5, puntajeCaracterizacion: 0.5, creadaEn: hace(10) }, COEF, AHORA);
    expect(x).toEqual(y);
  });

  it('la reactivacion conserva la fecha original: la antiguedad sigue creciendo (D-15)', () => {
    const creada = hace(60);
    const antes = calcularPrioridad({ puntajeSisben: 0.5, puntajeCaracterizacion: 0.5, creadaEn: creada }, COEF, hace(20));
    const despues = calcularPrioridad({ puntajeSisben: 0.5, puntajeCaracterizacion: 0.5, creadaEn: creada }, COEF, AHORA);
    expect(despues.antiguedad).toBeGreaterThan(antes.antiguedad);
  });

  it('coeficientes son factores numericos normalizados (no porcentajes)', () => {
    const k = normalizarCoeficientes({ caracterizacion: 5, sisben: 3, antiguedad: 2, horizonteDias: 90 });
    expect(k.caracterizacion + k.sisben + k.antiguedad).toBeCloseTo(1, 10);
    expect(describirCoeficientes(COEF)).toBe('kC=0.5000;kS=0.3000;kA=0.2000;H=90');
    expect(describirCoeficientes(COEF)).not.toContain('%');
  });

  it('orden total reproducible: total desc, luego la mas antigua, luego id', () => {
    const f = (id: number, total: number, dias: number) => ({
      peticionId: id,
      creadaEn: hace(dias),
      prioridad: { total, sisben: 0, caracterizacion: 0, antiguedad: 0 },
    });
    const lista = [f(3, 0.5, 1), f(1, 0.7, 1), f(2, 0.5, 9), f(4, 0.5, 9)].sort(compararPrioridad);
    expect(lista.map((x) => x.peticionId)).toEqual([1, 2, 4, 3]);
  });
});
