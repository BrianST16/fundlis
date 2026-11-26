import { BadRequestException } from '@nestjs/common';
import { fechaEnBogota, sumarDiasHabiles } from '../calendario/dias-habiles';
import { TareasService } from './tareas.service';

/**
 * D-60: en Local y lotes "esperar" siempre tiene fecha. La custodia Local, el
 * lote sin destino y la devolucion pendiente ya no pueden quedar indefinidos.
 */
describe('TareasService: esperas con fecha en Local y lotes (D-60)', () => {
  const custodiaDesde = new Date('2026-12-01T15:00:00Z');

  function servicio(opc: { esperas?: any[]; aplazamientos?: any[]; destinos?: Record<string, any[]>; tarea?: any; lote?: any; historial?: any; local?: any; intentos?: any[] }) {
    const creadas: any[] = [];
    const repoTareas: any = {
      findOne: jest.fn(async ({ where }: any) =>
        where?.clave ? creadas.find((t) => t.clave === where.clave) ?? null : opc.tarea ?? null,
      ),
      find: jest.fn(async ({ where }: any) =>
        where?.decision === 'ESPERAR' ? opc.esperas ?? [] : where?.decision === 'APLAZAR' ? opc.aplazamientos ?? [] : [],
      ),
      create: (x: any) => x,
      save: jest.fn(async (x: any) => creadas.push({ ...x, id: creadas.length + 1 })),
      update: jest.fn(),
    };
    const historial = { findOne: jest.fn(async () => opc.historial ?? null) };
    const destinos: any = {
      find: jest.fn(async ({ where }: any) => opc.destinos?.[where?.estado] ?? []),
      findOne: jest.fn(async () => Object.values(opc.destinos ?? {}).flat()[0] ?? null),
      manager: { getRepository: () => historial },
    };
    const lotes: any = { find: jest.fn(async () => []), findOne: jest.fn(async () => opc.lote ?? null) };
    const intentos: any = {
      find: jest.fn(async () => opc.intentos ?? []),
      findOne: jest.fn(async () => opc.intentos?.[0] ?? null),
    };
    const notificaciones: any = { aUsuarios: jest.fn(async () => 1), aPersonalLis: jest.fn(async () => 1) };
    const s = new TareasService(
      repoTareas, intentos, destinos, lotes, {} as any, opc.local ?? ({} as any), notificaciones,
      { cierres: async () => [] } as any,
      {
        plazos: async () => ({ donador: 10, estudiante: 3, avisoPrevio: 1 }),
        numero: async (_: string, d: number) => d,
        plazoRespuestaDonadorLocal: async () => 5,
      } as any,
      { get: () => undefined } as any,
    );
    return { s, creadas, repoTareas, notificaciones };
  }

  const enCustodia = { id: 33, estado: 'CUSTODIA_TEMPORAL', loteId: 70, custodiaDesde, oferta: { donadorId: 7, nombreProducto: 'Silla' } };
  const limiteInicial = sumarDiasHabiles(fechaEnBogota(custodiaDesde), 3, []);

  it('sin esperas: la custodia vence a los 3 días hábiles y crea la tarea', async () => {
    const { s, creadas } = servicio({ destinos: { CUSTODIA_TEMPORAL: [enCustodia] } });
    await s.revisar(new Date('2026-12-28T15:00:00Z'));
    expect(creadas.map((t) => t.clave)).toContain(`CUSTODIA:LOCAL:33:${limiteInicial}`);
  });

  it('tras "esperar", hay un plazo NUEVO de 5 días hábiles y al vencer se crea OTRA tarea', async () => {
    const espera = new Date('2026-12-14T15:00:00Z');
    const nuevoLimite = sumarDiasHabiles(fechaEnBogota(espera), 5, []);
    const antes = servicio({ destinos: { CUSTODIA_TEMPORAL: [enCustodia] }, esperas: [{ resueltaEn: espera }] });
    await antes.s.revisar(new Date('2026-12-15T15:00:00Z'));
    expect(antes.creadas).toHaveLength(0); // dentro del plazo nuevo

    const despues = servicio({ destinos: { CUSTODIA_TEMPORAL: [enCustodia] }, esperas: [{ resueltaEn: espera }] });
    await despues.s.revisar(new Date('2026-12-30T15:00:00Z'));
    expect(despues.creadas.map((t) => t.clave)).toEqual([`CUSTODIA:LOCAL:33:${nuevoLimite}`]);
    expect(nuevoLimite).not.toBe(limiteInicial);
  });

  it('"Por devolver" tiene plazo de 5 días hábiles: crea tarea y recuerda al donador coordinar el retiro', async () => {
    const rechazo = new Date('2026-12-14T15:00:00Z');
    const porDevolver = { ...enCustodia, estado: 'POR_DEVOLVER' };
    const { s, creadas, notificaciones } = servicio({ destinos: { POR_DEVOLVER: [porDevolver] }, historial: { ocurridoEn: rechazo } });
    await s.revisar(new Date('2026-12-30T15:00:00Z'));
    const limite = sumarDiasHabiles(fechaEnBogota(rechazo), 5, []);
    expect(creadas.map((t) => t.clave)).toEqual([`DEVOLVER:LOCAL:33:${limite}`]);
    expect(notificaciones.aUsuarios).toHaveBeenCalledWith([7], expect.objectContaining({ titulo: 'Coordina el retiro de tu donación' }));
  });

  const actual: any = { sub: 3, esAdministrador: false };

  it('no se puede esperar más de 2 veces: hay que decidir el destino', async () => {
    const tarea = { id: 9, estado: 'ABIERTA', destinoLocalId: 33, loteId: 70, clave: 'CUSTODIA:LOCAL:33:2026-12-30' };
    const { s, repoTareas } = servicio({
      destinos: { CUSTODIA_TEMPORAL: [enCustodia] },
      tarea,
      esperas: [{ resueltaEn: new Date('2026-12-07T15:00:00Z') }, { resueltaEn: new Date('2026-12-14T15:00:00Z') }],
    });
    await expect(s.resolver(9, { decision: 'ESPERAR', motivo: 'Sin petición aun' }, actual)).rejects.toThrow('decide el destino');
    expect(repoTareas.update).not.toHaveBeenCalled();
  });

  it('con esperas disponibles, ESPERAR resuelve la tarea', async () => {
    const tarea = { id: 9, estado: 'ABIERTA', destinoLocalId: 33, loteId: 70, clave: 'CUSTODIA:LOCAL:33:2026-12-30' };
    const { s, repoTareas } = servicio({ destinos: { CUSTODIA_TEMPORAL: [enCustodia] }, tarea });
    await s.resolver(9, { decision: 'ESPERAR', motivo: 'Sin petición aun' }, actual);
    expect(repoTareas.update).toHaveBeenCalledWith({ id: 9 }, expect.objectContaining({ estado: 'RESUELTA', decision: 'ESPERAR' }));
  });

  it('un lote sin destino no se cierra con SIN_ACCION (quedaria indefinido)', async () => {
    const tarea = { id: 10, estado: 'ABIERTA', destinoLocalId: null, loteId: 70, clave: 'SINDESTINO:LOTE:70:2026-12-04' };
    const { s } = servicio({ tarea, lote: { id: 70, sinDestinoDesde: custodiaDesde } });
    await expect(s.resolver(10, { decision: 'SIN_ACCION', motivo: 'Esperando' }, actual)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el listado informa cuantas esperas quedan', async () => {
    const tarea = { id: 9, estado: 'ABIERTA', destinoLocalId: 33, loteId: 70, clave: 'CUSTODIA:LOCAL:33:2026-12-30' };
    const { s, repoTareas } = servicio({
      destinos: { CUSTODIA_TEMPORAL: [enCustodia] },
      esperas: [{ resueltaEn: new Date('2026-12-07T15:00:00Z') }],
    });
    repoTareas.find.mockImplementation(async ({ where }: any) =>
      where?.decision === 'ESPERAR' ? [{ resueltaEn: new Date('2026-12-07T15:00:00Z') }] : [tarea],
    );
    expect((await s.listar('ABIERTA'))[0]).toMatchObject({ espera: { dias: 5, restantes: 1 } });
  });

  // -------------------------------------------------------------------------
  // D-61: el donador no lleva el producto a Local -> UNA prorroga; la
  // propuesta sin respuesta -> mas tiempo sin tope (decide el administrador).
  // -------------------------------------------------------------------------
  const seleccionadoEn = new Date('2026-11-02T15:00:00Z');
  const enEspera = { id: 34, estado: 'ESPERA_RECEPCION', seleccionadoEn, oferta: { donadorId: 7, nombreProducto: 'Mesa' } };
  const tareaRecepcion = { id: 11, estado: 'ABIERTA', destinoLocalId: 34, clave: 'VENCE:LOCAL:34:2026-11-16', responsable: 'DONADOR' };

  it('recepción Local vencida: se da más tiempo UNA vez (+5 días hábiles) y se avisa al donador', async () => {
    const local = { aplazarRecepcion: jest.fn() };
    const { s, repoTareas } = servicio({ destinos: { ESPERA_RECEPCION: [enEspera] }, tarea: tareaRecepcion, local });
    await s.resolver(11, { decision: 'APLAZAR', motivo: 'Lo trae la otra semana' }, actual);
    expect(local.aplazarRecepcion).toHaveBeenCalledWith(34, 'Lo trae la otra semana', 5, 3);
    expect(repoTareas.update).toHaveBeenCalledWith({ id: 11 }, expect.objectContaining({ decision: 'APLAZAR' }));
  });

  it('recepción Local: la segunda prórroga se rechaza (queda cancelar)', async () => {
    const local = { aplazarRecepcion: jest.fn() };
    const { s } = servicio({
      destinos: { ESPERA_RECEPCION: [enEspera] }, tarea: tareaRecepcion, local,
      aplazamientos: [{ resueltaEn: new Date('2026-11-17T15:00:00Z') }],
    });
    await expect(s.resolver(11, { decision: 'APLAZAR', motivo: 'Otra vez' }, actual)).rejects.toThrow('cancela el destino Local');
    expect(local.aplazarRecepcion).not.toHaveBeenCalled();
  });

  it('recepción Local: tras la prórroga, el revisor vigila el plazo nuevo y vuelve a crear la tarea', async () => {
    const aplazo = new Date('2026-11-17T15:00:00Z');
    const { s, creadas } = servicio({ destinos: { ESPERA_RECEPCION: [enEspera] }, aplazamientos: [{ resueltaEn: aplazo }] });
    await s.revisar(new Date('2026-12-28T15:00:00Z'));
    expect(creadas.map((t) => t.clave)).toEqual([`VENCE:LOCAL:34:${sumarDiasHabiles(fechaEnBogota(aplazo), 5, [])}`]);
  });

  const propuesta = { id: 35, estado: 'PROPUESTO_DONADOR', loteId: 71, propuestaLimite: '2026-12-04', oferta: { donadorId: 7, nombreProducto: 'Silla' } };
  const tareaPropuesta = { id: 12, estado: 'ABIERTA', destinoLocalId: 35, clave: 'PROPUESTA:LOCAL:35:2026-12-04', responsable: 'DONADOR' };

  it('propuesta sin respuesta: dar más tiempo amplia el plazo (sin tope) y no acepta "sin acción"', async () => {
    const local = { ampliarPropuesta: jest.fn() };
    const { s } = servicio({ destinos: { PROPUESTO_DONADOR: [propuesta] }, tarea: tareaPropuesta, local });
    await s.resolver(12, { decision: 'ESPERAR', motivo: 'Lo esta pensando' }, actual);
    expect(local.ampliarPropuesta).toHaveBeenCalledWith(35, 'Lo esta pensando', 3);
    await expect(s.resolver(12, { decision: 'SIN_ACCION', motivo: 'Contactado' }, actual)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el listado: propuesta con espera sin tope, recepción Local con su prórroga', async () => {
    const { s, repoTareas } = servicio({ destinos: { ESPERA_RECEPCION: [enEspera] } });
    repoTareas.find.mockImplementation(async ({ where }: any) => (where?.decision ? [] : [tareaPropuesta, tareaRecepcion]));
    const [p, r] = await s.listar('ABIERTA');
    expect(p).toMatchObject({ espera: { dias: 5, restantes: null } });
    expect(r).toMatchObject({ prorroga: { dias: 5, restantes: 1 } });
  });

  // -------------------------------------------------------------------------
  // D-62: devolucion pendiente de una asignacion (antes sin plazo: C1)
  // -------------------------------------------------------------------------
  const marcadaEn = new Date('2026-12-14T15:00:00Z');
  const enDevolucion = {
    id: 40, estado: 'DEVOLUCION', loteId: 70, cerradaEn: marcadaEn, oferta: { donadorId: 7, nombreProducto: 'Lampara' },
  };
  const tareaDevolucion = { id: 13, estado: 'ABIERTA', asignacionId: 40, clave: 'DEVOLVER:OXP:40:2026-12-21', responsable: 'LIS' };
  const admin: any = { sub: 1, esAdministrador: true };

  it('C1: una asignación en devolución con el producto en el LIS vence a los 5 días hábiles y avisa al donador', async () => {
    const { s, creadas, notificaciones } = servicio({ intentos: [enDevolucion], lote: { id: 70, ubicacion: 'EN_LIS' } });
    await s.revisar(new Date('2026-12-30T15:00:00Z'));
    expect(creadas.map((t) => t.clave)).toEqual([`DEVOLVER:OXP:40:${sumarDiasHabiles(fechaEnBogota(marcadaEn), 5, [])}`]);
    expect(notificaciones.aUsuarios).toHaveBeenCalledWith([7], expect.objectContaining({ titulo: 'Coordina el retiro de tu donación' }));
  });

  it('C1: si el producto ya se devolvio, no hay tarea', async () => {
    const { s, creadas } = servicio({ intentos: [enDevolucion], lote: { id: 70, ubicacion: 'DEVUELTO' } });
    await s.revisar(new Date('2026-12-30T15:00:00Z'));
    expect(creadas).toHaveLength(0);
  });

  it('devolución: una sola espera; el auxiliar no puede dar otra, el administrador si (caso anomalo)', async () => {
    const usada = [{ resueltaEn: new Date('2026-12-22T15:00:00Z') }];
    const aux = servicio({ intentos: [enDevolucion], tarea: tareaDevolucion, esperas: usada });
    await expect(aux.s.resolver(13, { decision: 'ESPERAR', motivo: 'Viene manana' }, actual)).rejects.toThrow('decide el destino');
    const adm = servicio({ intentos: [enDevolucion], tarea: tareaDevolucion, esperas: usada });
    await adm.s.resolver(13, { decision: 'ESPERAR', motivo: 'Caso anomalo' }, admin);
    expect(adm.repoTareas.update).toHaveBeenCalledWith({ id: 13 }, expect.objectContaining({ decision: 'ESPERAR' }));
  });

  it('devolución no retirada: custodia Local o recibir para el LIS se delegan en una sola operación', async () => {
    const local = { resolverDevolucionPendiente: jest.fn() };
    const { s } = servicio({ intentos: [enDevolucion], tarea: tareaDevolucion, local });
    await s.resolver(13, { decision: 'CUSTODIA_LOCAL', motivo: 'No vino' }, actual);
    expect(local.resolverDevolucionPendiente).toHaveBeenCalledWith({ asignacionId: 40 }, 'CUSTODIA', 'No vino', actual);
    await s.resolver(13, { decision: 'RECIBIR_LIS', motivo: 'No vino' }, admin);
    expect(local.resolverDevolucionPendiente).toHaveBeenCalledWith({ asignacionId: 40 }, 'LIS', 'No vino', admin);
  });

  it('solo el administrador recibe para el LIS una devolución no retirada', async () => {
    const { LocalService } = await import('../local/local.service');
    await expect(
      LocalService.prototype.resolverDevolucionPendiente.call({}, { asignacionId: 40 }, 'LIS', 'No vino', actual),
    ).rejects.toThrow('Solo el administrador');
  });

  it('el listado: la devolución muestra 1 espera de 5 días', async () => {
    const { s, repoTareas } = servicio({ intentos: [enDevolucion] });
    repoTareas.find.mockImplementation(async ({ where }: any) => (where?.decision ? [] : [tareaDevolucion]));
    expect((await s.listar('ABIERTA'))[0]).toMatchObject({ espera: { dias: 5, restantes: 1 } });
  });
});
