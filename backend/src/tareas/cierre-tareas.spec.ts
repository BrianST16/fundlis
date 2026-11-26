import { IsNull } from 'typeorm';
import { decisionPorCambio } from '../local/local.service';
import { cerrarTareasDe } from './cierre-tareas';

/** D-56: una sola decision, varias entradas. */
describe('cerrarTareasDe', () => {
  const mgr = () => {
    const repo = { update: jest.fn(async () => ({ affected: 1 })) };
    return { repo, m: { getRepository: jest.fn(() => repo) } as any };
  };

  it('cierra solo las tareas ABIERTAS del objeto, con decisión, motivo, responsable y fecha', async () => {
    const { repo, m } = mgr();
    expect(await cerrarTareasDe(m, { asignacionId: 40 }, 'DEVOLUCION', 'No recogió', 3)).toBe(1);
    expect(repo.update).toHaveBeenCalledWith(
      { estado: 'ABIERTA', asignacionId: 40 },
      { estado: 'RESUELTA', decision: 'DEVOLUCION', motivo: 'No recogió', resueltaPor: 3, resueltaEn: expect.any(Date) },
    );
  });

  it('para un lote sin destino no toca las tareas de un destino Local de ese lote', async () => {
    const { repo, m } = mgr();
    await cerrarTareasDe(m, { loteId: 70, soloSinDestino: true }, 'CUSTODIA_LOCAL', 'A custodia', 1);
    expect(repo.update).toHaveBeenCalledWith({ estado: 'ABIERTA', loteId: 70, destinoLocalId: IsNull() }, expect.anything());
  });

  it('recorta el motivo al tamaño de la columna (400)', async () => {
    const { repo, m } = mgr();
    await cerrarTareasDe(m, { destinoLocalId: 9 }, 'SIN_ACCION', 'x'.repeat(500), 1);
    expect((repo.update.mock.calls[0] as any)[1].motivo).toHaveLength(400);
  });
});

describe('decisionPorCambio (destino Local)', () => {
  it.each([
    ['ESPERA_RECEPCION', 'CANCELADO', 'CANCELAR_INTENTO'],
    ['CUSTODIA_TEMPORAL', 'REASIGNADO', 'REASIGNAR'],
    ['PROPUESTO_DONADOR', 'POR_DEVOLVER', 'DEVOLUCION'],
    ['PROPUESTO_DONADOR', 'CUSTODIA_TEMPORAL', 'RETIRAR_PROPUESTA'],
    ['ESPERA_RECEPCION', 'CUSTODIA_TEMPORAL', 'SIN_ACCION'],
    ['PROPUESTO_DONADOR', 'ACEPTADO', 'SIN_ACCION'],
    ['POR_DEVOLVER', 'CUSTODIA_TEMPORAL', 'CUSTODIA_LOCAL'],
    ['POR_DEVOLVER', 'ACEPTADO', 'RECIBIR_LIS'],
  ])('%s -> %s = %s', (anterior, nuevo, decision) => {
    expect(decisionPorCambio(anterior as any, nuevo as any)).toBe(decision);
  });
});
