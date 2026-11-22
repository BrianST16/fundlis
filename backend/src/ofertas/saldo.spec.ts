import { EstadoAsignacion } from '../common/enums';
import { calcularSaldo } from './saldo';

const { ASIGNADO, EN_CUSTODIA, ENTREGADO, DEVOLUCION, CANCELADO } = EstadoAsignacion;
const R = new Date('2026-11-10T15:00:00Z');

describe('Saldo de oferta (fuente unica, modelo con lote fisico)', () => {
  it('sin intentos todo esta disponible', () => {
    expect(calcularSaldo({ cantidad: 10 }, []).disponible).toBe(10);
  });

  it('ASIGNADO compromete; lo recibido (custodia, entregado, devolucion) se consume', () => {
    const s = calcularSaldo({ cantidad: 20 }, [
      { estado: ASIGNADO, cantidadAsignada: 3 },
      { estado: EN_CUSTODIA, cantidadAsignada: 2, recibidaEn: R },
      { estado: ENTREGADO, cantidadAsignada: 4, recibidaEn: R },
      { estado: DEVOLUCION, cantidadAsignada: 1, recibidaEn: R },
    ]);
    expect(s).toMatchObject({ comprometida: 3, recibida: 7, entregada: 4, enDevolucion: 1, disponible: 10 });
  });

  it('cancelado SIN recepcion (el donador no lo llevo) libera las unidades (D-15)', () => {
    expect(calcularSaldo({ cantidad: 6 }, [{ estado: CANCELADO, cantidadAsignada: 6, recibidaEn: null }]).disponible).toBe(6);
  });

  it('cancelado DESPUES de recibir (el estudiante no recogio) NO vuelve a la oferta: esta en un lote fisico', () => {
    // Antes del modelo de lote se liberaban y habia que inventar una "recepcion ficticia".
    expect(calcularSaldo({ cantidad: 4 }, [{ estado: CANCELADO, cantidadAsignada: 4, recibidaEn: R }]).disponible).toBe(0);
  });

  it('recepcion incompleta: 10 ofertadas, 5 asignadas, llegan 3 -> no se duplica inventario', () => {
    const original = calcularSaldo({ cantidad: 10 }, [{ estado: CANCELADO, cantidadAsignada: 5, recibidaEn: R }]);
    const generada = calcularSaldo({ cantidad: 3, origen: 'FALTANTE' }, [], [], [{ cantidad: 3 }]);
    expect(original.disponible).toBe(5);
    expect(generada.disponible).toBe(0); // sus 3 unidades ya estan en un lote del LIS
    expect(original.disponible + generada.enLoteFaltante).toBeLessThanOrEqual(10);
  });

  it('los intentos de REASIGNACION consumen un lote, no la oferta', () => {
    const s = calcularSaldo({ cantidad: 4 }, [
      { estado: CANCELADO, cantidadAsignada: 4, recibidaEn: R, origen: 'DONADOR' },
      { estado: EN_CUSTODIA, cantidadAsignada: 4, recibidaEn: R, origen: 'REASIGNACION' },
    ]);
    expect(s.disponible).toBe(0);
    expect(s.recibida).toBe(4);
  });

  it('LOCAL elegido desde la oferta compromete unidades salvo si se cancela', () => {
    const s = calcularSaldo({ cantidad: 10 }, [], [
      { origen: 'OFERTA', estado: 'ESPERA_RECEPCION', cantidad: 2 },
      { origen: 'OFERTA', estado: 'CUSTODIA_TEMPORAL', cantidad: 3 },
      { origen: 'OFERTA', estado: 'CANCELADO', cantidad: 4 },
      { origen: 'LOTE', estado: 'CUSTODIA_TEMPORAL', cantidad: 9 }, // viene de un lote: no cuenta
    ]);
    expect(s.destinoLocal).toBe(5);
    expect(s.disponible).toBe(5);
  });
});
