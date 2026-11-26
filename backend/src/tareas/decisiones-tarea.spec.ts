import { BadRequestException } from '@nestjs/common';
import { EstadoAsignacion } from '../common/enums';
import { TareasService } from './tareas.service';

/** D-58: decisiones de una tarea DEFINIR_ESTADO de una asignacion vencida. */
describe('TareasService: decisiones sin redundancia (D-58)', () => {
  function servicio(asignacion: any, tareas: any[] = []) {
    const repoTareas: any = {
      findOne: jest.fn(async () => ({ id: 1, estado: 'ABIERTA', asignacionId: asignacion.id })),
      find: jest.fn(async () => tareas),
      update: jest.fn(),
    };
    const intentos: any = { findOne: jest.fn(async () => asignacion), find: jest.fn(async () => [asignacion]) };
    const asignaciones: any = { cancelar: jest.fn(), prorrogar: jest.fn(), marcarParaDevolucion: jest.fn() };
    const parametros: any = { numero: jest.fn(async (_c: string, d: number) => d) };
    const vacio: any = {};
    const s = new TareasService(
      repoTareas, intentos, vacio, vacio, asignaciones, vacio, vacio, vacio, parametros, { get: () => undefined } as any,
    );
    return { s, repoTareas, asignaciones };
  }
  const actual: any = { sub: 3, esAdministrador: false };

  it('una asignación vencida no se cierra con SIN_ACCION (quedaria vencida sin tarea ni aviso)', async () => {
    const { s, repoTareas } = servicio({ id: 40, estado: EstadoAsignacion.ASIGNADO });
    await expect(s.resolver(1, { decision: 'SIN_ACCION', motivo: 'Contactado' }, actual)).rejects.toBeInstanceOf(BadRequestException);
    expect(repoTareas.update).not.toHaveBeenCalled();
  });

  it('con el producto EN_CUSTODIA no se cancela sin destino desde la tarea', async () => {
    const { s, asignaciones } = servicio({ id: 40, estado: EstadoAsignacion.EN_CUSTODIA, loteId: 70 });
    await expect(s.resolver(1, { decision: 'CANCELAR_INTENTO', motivo: 'No recogió' }, actual)).rejects.toThrow('elige su destino');
    expect(asignaciones.cancelar).not.toHaveBeenCalled();
  });

  it('si el donador no llevo el producto, cancelar el intento sigue permitido', async () => {
    const { s, asignaciones } = servicio({ id: 40, estado: EstadoAsignacion.ASIGNADO });
    await s.resolver(1, { decision: 'CANCELAR_INTENTO', motivo: 'No llevo el producto' }, actual);
    expect(asignaciones.cancelar).toHaveBeenCalledWith(40, 'No llevo el producto', 3);
  });

  it('el listado dice cuanto tiempo extra queda: +5 al donador, 0 si ya se usó la prórroga del estudiante', async () => {
    const donador = servicio({ id: 40, estado: EstadoAsignacion.ASIGNADO, aplazamientos: 0 }, [{ id: 1, estado: 'ABIERTA', asignacionId: 40 }]);
    expect((await donador.s.listar('ABIERTA'))[0]).toMatchObject({ prorroga: { dias: 5, restantes: 1 } });
    const estudiante = servicio({ id: 41, estado: EstadoAsignacion.EN_CUSTODIA, aplazamientos: 1 }, [{ id: 2, estado: 'ABIERTA', asignacionId: 41 }]);
    expect((await estudiante.s.listar('ABIERTA'))[0]).toMatchObject({ prorroga: { dias: 3, restantes: 0 } });
  });
});
