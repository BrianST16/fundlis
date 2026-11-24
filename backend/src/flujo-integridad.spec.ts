/**
 * Pruebas de integridad del flujo central, modulo M2 (lote B2, 2026-11-20).
 * Repositorios y transacciones dobles; datos ficticios; sin base de datos.
 */
import { BadRequestException } from '@nestjs/common';
import { AsignacionesService } from './asignaciones/asignaciones.service';
import {
  EstadoAsignacion,
  EstadoOferta,
  EstadoPeticion,
  TipoMovimiento,
} from './common/enums';
import { PeticionesService } from './peticiones/peticiones.service';

/** QueryBuilder doble: devuelve resultados segun la entidad consultada. */
/** `secuencia`: resultados sucesivos de getOne (cuando una misma entidad se
 *  consulta varias veces con filtros distintos); agotada, se usa `one`. */
function gestorTransaccional(
  resultados: Record<string, { one?: any; many?: any[]; secuencia?: any[] }>,
  repos: Record<string, any>,
) {
  return {
    createQueryBuilder: jest.fn((entidad: any) => {
      const r = resultados[entidad.name] ?? {};
      const qb: any = {
        setLock: () => qb,
        where: () => qb,
        andWhere: () => qb,
        getOne: jest.fn(async () => (r.secuencia?.length ? r.secuencia.shift() : (r.one ?? null))),
        getMany: jest.fn(async () => r.many ?? []),
      };
      return qb;
    }),
    getRepository: jest.fn((entidad: any) => repos[entidad.name]),
  };
}

// ---------------------------------------------------------------------------
// T2.1 y T2.3 — Peticiones
// ---------------------------------------------------------------------------
describe('PeticionesService', () => {
  function servicio(opc: { aprobadas?: any[]; vigentes?: any[]; usadas?: number }) {
    const peticiones: any = {
      find: jest.fn(async () => opc.aprobadas ?? []),
      findOne: jest.fn(async () => ({ id: 77, estudianteId: 5, estado: EstadoPeticion.PENDIENTE_APROBACION })),
    };
    const asignaciones: any = {
      find: jest.fn(async () => opc.vigentes ?? []),
      findOne: jest.fn(async () => null),
    };
    const caracterizaciones: any = { findOne: jest.fn(async () => ({ id: 1 })) };
    const categorias: any = {
      obtenerActiva: jest.fn(async () => ({ id: 2, medidaNombre: null })),
      validarRangoPeticion: jest.fn(() => ({ min: null, max: null })),
    };
    const parametros: any = { maxPeticionesActivas: jest.fn(async () => 5) };
    const historial: any = { registrar: jest.fn(async () => undefined) };
    const repoPeticion = {
      count: jest.fn(async () => opc.usadas ?? 0),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 77 })),
    };
    const mgr = gestorTransaccional({ Usuario: { one: { id: 5 } } }, { Peticion: repoPeticion });
    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(mgr)) };
    const s = new PeticionesService(
      peticiones,
      asignaciones,
      caracterizaciones,
      categorias,
      parametros,
      historial,
      dataSource,
    );
    return { s, repoPeticion, mgr, historial };
  }

  it('T2.1 el catalogo oculta las peticiones con asignacion vigente', async () => {
    const aprobadas = [
      { id: 1, descripcion: 'Necesito un portatil para clase', categoriaId: 2, creadaEn: new Date() },
      { id: 2, descripcion: 'Necesito cuadernos para el semestre', categoriaId: 2, creadaEn: new Date() },
    ];
    const { s } = servicio({ aprobadas, vigentes: [{ peticionId: 1, estado: EstadoAsignacion.ASIGNADO }] });
    const r = await s.catalogo();
    expect(r.map((p) => p.id)).toEqual([2]);
    // Sigue siendo anonimo: no hay estudiante en el DTO.
    expect((r[0] as any).estudiante).toBeUndefined();
    expect((r[0] as any).estudianteId).toBeUndefined();
  });

  it('T2.1 catalogo vacio no consulta asignaciones', async () => {
    const { s } = servicio({ aprobadas: [] });
    await expect(s.catalogo()).resolves.toEqual([]);
  });

  it('T2.3 con 5 peticiones abiertas rechaza la sexta DENTRO de la transaccion', async () => {
    const { s, repoPeticion, mgr } = servicio({ usadas: 5 });
    await expect(
      s.crear(5, { categoriaId: 2, descripcion: 'Necesito una calculadora cientifica' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Se bloqueo la fila del estudiante antes de contar y no se inserto nada.
    expect(mgr.createQueryBuilder).toHaveBeenCalled();
    expect(repoPeticion.save).not.toHaveBeenCalled();
  });

  it('T2.3 con cupo crea la peticion y su historial en la misma transaccion', async () => {
    const { s, repoPeticion, historial, mgr } = servicio({ usadas: 4 });
    await s.crear(5, { categoriaId: 2, descripcion: 'Necesito una calculadora cientifica' });
    expect(repoPeticion.save).toHaveBeenCalledWith(
      expect.objectContaining({ estudianteId: 5, estado: EstadoPeticion.PENDIENTE_APROBACION }),
    );
    expect(historial.registrar).toHaveBeenCalledWith(expect.anything(), mgr);
  });
});

// ---------------------------------------------------------------------------
// T2.2 y T2.4 — Asignaciones
// ---------------------------------------------------------------------------
describe('AsignacionesService', () => {
  function servicio(opc: {
    oferta?: any;
    peticion?: any;
    intentos?: any[];
    asignacion?: any;
    lote?: any;
    ocupado?: any;
    enLocal?: any;
    entidades?: Record<string, any>;
    /** getOne sucesivos sobre OFERTA_X_PETICION (bloqueo, peticion libre...). */
    secuenciaAsignacion?: any[];
  }) {
    const asignaciones: any = {
      findOne: jest.fn(async () => ({ id: 99, oferta: {}, peticion: {}, movimientos: [] })),
    };
    const emparejamiento: any = {
      prioridadDe: jest.fn(async () => ({
        prioridad: { total: 0.64, sisben: 0.8, caracterizacion: 0.6, antiguedad: 0.5 },
        coeficientes: 'kC=0.5000;kS=0.3000;kA=0.2000;H=90',
      })),
      verificarCompatibilidad: jest.fn(),
    };
    const historial: any = { registrar: jest.fn(async () => undefined), de: jest.fn(async () => []) };
    const evidencias: any = { guardar: jest.fn(async () => ({ id: 300 })) };
    const repoOxp = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 99 })),
      find: jest.fn(async () => opc.intentos ?? []),
      findOne: jest.fn(async () => opc.ocupado ?? null),
    };
    const repoMov = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 500 })),
      update: jest.fn(),
    };
    const repoLote = { update: jest.fn(), find: jest.fn(async () => []), create: jest.fn((x) => x), save: jest.fn(async (x) => ({ ...x, id: 70 })) };
    const repoLocal = { find: jest.fn(async () => []), findOne: jest.fn(async () => opc.enLocal ?? null), save: jest.fn(async (x: any) => x) };
    const repoGenerico = (valor: any) => ({ findOne: jest.fn(async () => valor), save: jest.fn(async (x) => x), create: jest.fn((x) => x) });
    const mgr = gestorTransaccional(
      {
        Oferta: { one: opc.oferta },
        Peticion: { one: opc.peticion },
        OfertaXPeticion: { one: opc.asignacion ?? null, many: opc.intentos ?? [], secuencia: opc.secuenciaAsignacion },
        LoteFisico: { one: opc.lote ?? null },
      },
      {
        OfertaXPeticion: repoOxp,
        Movimiento: repoMov,
        LoteFisico: repoLote,
        DestinoLocal: repoLocal,
        Oferta: repoGenerico(opc.entidades?.Oferta ?? opc.oferta),
        Peticion: repoGenerico(opc.entidades?.Peticion ?? opc.peticion),
      },
    );
    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(mgr)) };
    const notificaciones: any = { aUsuarios: jest.fn(async () => 1), aPersonalLis: jest.fn(async () => 1) };
    const calendario: any = { recepcionSuspendida: jest.fn(async () => null), cierres: jest.fn(async () => []) };
    const parametros: any = {
      plazos: jest.fn(async () => ({ donador: 10, estudiante: 3, avisoPrevio: 1 })),
      numero: jest.fn(async (_c: string, d: number) => d),
    };
    const s = new AsignacionesService(
      asignaciones,
      {} as any,
      {} as any,
      {} as any,
      emparejamiento,
      evidencias,
      historial,
      dataSource,
      notificaciones,
      calendario,
      parametros,
    );
    return { s, repoOxp, repoMov, repoLote, repoLocal, evidencias, notificaciones, calendario, emparejamiento, dataSource, historial };
  }

  const oferta = { id: 1, estado: EstadoOferta.APROBADA, cantidad: 10, categoriaId: 2, donadorId: 7, nombreProducto: 'Chaqueta', estadoConservacion: 4, medida: 3 };
  const peticion = { id: 5, estado: EstadoPeticion.APROBADA, categoriaId: 2, estudianteId: 8, descripcion: 'Necesito una chaqueta' };
  // Intento previo: 5 asignadas y se recibio (completa o incompleta): esas unidades ya no vuelven a la oferta.
  const intentos = [{ id: 11, estado: EstadoAsignacion.CANCELADO, cantidadAsignada: 5, recibidaEn: new Date(), origen: 'DONADOR' }];

  it('T2.2 al asignar no ofrece unidades que ya pasaron por recepcion', async () => {
    const { s, repoOxp } = servicio({ oferta, peticion, intentos });
    await expect(s.asignar({ ofertaId: 1, peticionId: 5, cantidad: 6 }, 1)).rejects.toThrow(
      'Solo quedan 5 unidades',
    );
    expect(repoOxp.save).not.toHaveBeenCalled();
  });

  it('T2.2 asigna hasta el saldo real y CONSERVA los componentes de prioridad (D-38)', async () => {
    const { s, repoOxp, emparejamiento, notificaciones } = servicio({ oferta, peticion, intentos });
    await s.asignar({ ofertaId: 1, peticionId: 5, cantidad: 5 }, 1);
    expect(emparejamiento.verificarCompatibilidad).toHaveBeenCalled();
    expect(repoOxp.save).toHaveBeenCalledWith(
      expect.objectContaining({
        cantidadAsignada: 5,
        estado: EstadoAsignacion.ASIGNADO,
        origen: 'DONADOR',
        puntajePrioridad: 0.64,
        puntajeSisben: 0.8,
        puntajeCaracterizacion: 0.6,
        puntajeAntiguedad: 0.5,
        coeficientesPrioridad: 'kC=0.5000;kS=0.3000;kA=0.2000;H=90',
      }),
    );
    // Notificacion al donador y al estudiante, sin cruzar identidades.
    const llamadas = notificaciones.aUsuarios.mock.calls;
    expect(llamadas.map((c: any) => c[0])).toEqual([[7], [8]]);
    const textoDonador = JSON.stringify(llamadas[0][1]);
    expect(textoDonador).not.toContain('Necesito una chaqueta');
  });

  it('suspension por cierre del LIS bloquea nuevas asignaciones de origen donador (D-24)', async () => {
    const { s, calendario, repoOxp } = servicio({ oferta, peticion });
    calendario.recepcionSuspendida.mockResolvedValueOnce({ desde: '2026-12-14', hasta: '2027-01-12' });
    await expect(s.asignar({ ofertaId: 1, peticionId: 5, cantidad: 1 }, 1)).rejects.toThrow('suspendida');
    expect(repoOxp.save).not.toHaveBeenCalled();
  });

  it('P-23: reasignar un lote crea un intento EN_CUSTODIA SIN nueva recepcion', async () => {
    const { s, repoOxp, repoMov, evidencias } = servicio({
      peticion,
      lote: { id: 70, ubicacion: 'EN_LIS', ofertaId: 1, cantidad: 2 },
      entidades: { Oferta: oferta },
    });
    await s.reasignarLote(70, 5, 1);
    expect(repoOxp.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: EstadoAsignacion.EN_CUSTODIA, origen: 'REASIGNACION', loteId: 70, cantidadAsignada: 2 }),
    );
    expect(repoMov.save).not.toHaveBeenCalled(); // no hay "recepcion ficticia"
    expect(evidencias.guardar).not.toHaveBeenCalled();
  });

  it('D-50: un lote en custodia temporal LOCAL se empareja directo y el destino LOCAL se cierra en la misma transaccion', async () => {
    const { s, repoOxp, repoMov, repoLocal } = servicio({
      peticion: { ...peticion, estado: EstadoPeticion.APROBADA },
      lote: { id: 70, ubicacion: 'EN_LIS', ofertaId: 1, cantidad: 2 },
      enLocal: { id: 33, estado: 'CUSTODIA_TEMPORAL', loteId: 70 },
      entidades: { Oferta: oferta },
    });
    await s.reasignarLote(70, 5, 1);
    expect(repoLocal.save).toHaveBeenCalledWith(expect.objectContaining({ id: 33, estado: 'REASIGNADO' }));
    expect(repoOxp.save).toHaveBeenCalledWith(expect.objectContaining({ estado: EstadoAsignacion.EN_CUSTODIA, loteId: 70 }));
    expect(repoMov.save).not.toHaveBeenCalled(); // sin esperar recepcion
  });

  it('D-50: un lote con propuesta al donador NO se puede emparejar', async () => {
    const { s, repoOxp } = servicio({
      peticion: { ...peticion, estado: EstadoPeticion.APROBADA },
      lote: { id: 70, ubicacion: 'EN_LIS', ofertaId: 1, cantidad: 2 },
      enLocal: { id: 33, estado: 'PROPUESTO_DONADOR', loteId: 70 },
      entidades: { Oferta: oferta },
    });
    await expect(s.reasignarLote(70, 5, 1)).rejects.toThrow('propuesta al donador');
    expect(repoOxp.save).not.toHaveBeenCalled();
  });

  it('no reasigna un lote que ya tiene titular', async () => {
    const { s } = servicio({
      peticion,
      lote: { id: 70, ubicacion: 'EN_LIS', ofertaId: 1, cantidad: 2 },
      ocupado: { id: 40 },
      entidades: { Oferta: oferta },
    });
    await expect(s.reasignarLote(70, 5, 1)).rejects.toThrow('asignacion 40');
  });

  it('cancelar desde EN_CUSTODIA deja el lote SIN DESTINO y cierra la peticion por incumplimiento', async () => {
    const { s, repoLote } = servicio({
      asignacion: { id: 40, estado: EstadoAsignacion.EN_CUSTODIA, loteId: 70, ofertaId: 1, peticionId: 5, cantidadAsignada: 2 },
      oferta,
      peticion,
    });
    await s.cancelar(40, 'No recogio en el plazo', 1);
    expect(repoLote.update).toHaveBeenCalledWith({ id: 70 }, expect.objectContaining({ sinDestinoDesde: expect.any(Date) }));
  });

  // -------------------------------------------------------------------------
  // Correccion 6 — reasignacion directa de un producto EN_CUSTODIA
  // -------------------------------------------------------------------------
  const enCustodia = () => ({
    id: 40, estado: EstadoAsignacion.EN_CUSTODIA, loteId: 70, ofertaId: 1, peticionId: 4, cantidadAsignada: 2,
  });
  // Peticion original (la que se cierra) y peticion destino: objetos distintos.
  const peticionOriginal = () => ({ id: 4, estado: EstadoPeticion.APROBADA, estudianteId: 9, descripcion: 'Peticion original' });
  // Destino siempre nuevo: otras pruebas mutan la constante `peticion`.
  const destinoAprobado = () => ({ ...peticion, estado: EstadoPeticion.APROBADA });
  const escenarioReasignacion = (destino: any = destinoAprobado()) => {
    const a = enCustodia();
    return servicio({
      asignacion: a,
      // 1) bloqueo en reasignarDesdeCustodia, 2) bloqueo en cancelar,
      // 3) "la peticion destino ya tiene intento vigente?" -> no.
      secuenciaAsignacion: [a, a, null],
      lote: { id: 70, ubicacion: 'EN_LIS', ofertaId: 1, cantidad: 2 },
      peticion: destino,
      entidades: { Oferta: oferta, Peticion: peticionOriginal() },
    });
  };

  it('C6: reasigna EN_CUSTODIA -> nuevo intento EN_CUSTODIA en UNA transaccion, sin nueva recepcion', async () => {
    const { s, repoOxp, repoMov, evidencias, dataSource } = escenarioReasignacion();
    await s.reasignarDesdeCustodia(40, 5, 'El estudiante no recogio', 1);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    const guardados = repoOxp.save.mock.calls.map((c: any) => c[0]);
    expect(guardados[0]).toMatchObject({ id: 40, estado: EstadoAsignacion.CANCELADO });
    expect(guardados[1]).toMatchObject({
      estado: EstadoAsignacion.EN_CUSTODIA, origen: 'REASIGNACION', loteId: 70, peticionId: 5, cantidadAsignada: 2,
    });
    expect(repoMov.save).not.toHaveBeenCalled(); // sin recepcion repetida
    expect(evidencias.guardar).not.toHaveBeenCalled(); // sin foto nueva
  });

  it('C6: queda en el historial (intento viejo REASIGNADA, intento nuevo EN_CUSTODIA, lote)', async () => {
    const { s, historial } = escenarioReasignacion();
    await s.reasignarDesdeCustodia(40, 5, 'El estudiante no recogio', 1);
    const estados = historial.registrar.mock.calls.map((c: any) => `${c[0].entidad}:${c[0].estadoNuevo}`);
    expect(estados).toEqual(
      expect.arrayContaining(['ASIGNACION:CANCELADO', 'ASIGNACION:EN_CUSTODIA', 'LOTE:REASIGNADO', 'ASIGNACION:REASIGNADA']),
    );
  });

  it('C6: avisa al estudiante original, al nuevo y al DONADOR; no alerta de un lote sin destino', async () => {
    const { s, notificaciones } = escenarioReasignacion();
    await s.reasignarDesdeCustodia(40, 5, 'El estudiante no recogio', 1);
    const llamadas = notificaciones.aUsuarios.mock.calls;
    expect(llamadas.map((c: any) => c[0][0])).toEqual(expect.arrayContaining([9, 8, 7]));
    const alDonador = llamadas.find((c: any) => c[0][0] === 7)[1];
    expect(alDonador.tipo).toBe('DONACION_REASIGNADA');
    // Sin identidades: el donador no ve la descripcion de ninguna peticion.
    expect(JSON.stringify(alDonador)).not.toContain('Necesito una chaqueta');
    expect(notificaciones.aPersonalLis).not.toHaveBeenCalled();
  });

  it('C6: solo aplica a productos EN_CUSTODIA (un ASIGNADO aun no esta en el LIS)', async () => {
    const { s, repoOxp } = servicio({
      asignacion: { ...enCustodia(), estado: EstadoAsignacion.ASIGNADO, loteId: null },
      oferta,
      peticion,
    });
    await expect(s.reasignarDesdeCustodia(40, 5, 'motivo de prueba', 1)).rejects.toThrow('EN_CUSTODIA');
    expect(repoOxp.save).not.toHaveBeenCalled();
  });

  it('C6: si la peticion destino no sirve, falla DENTRO de la misma transaccion (se revierte la cancelacion)', async () => {
    const { s, dataSource } = escenarioReasignacion({ ...destinoAprobado(), estado: EstadoPeticion.RECHAZADA });
    await expect(s.reasignarDesdeCustodia(40, 5, 'motivo de prueba', 1)).rejects.toThrow('peticion aprobada');
    // Cancelar y reasignar van en la misma transaccion: el error la revierte entera.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('prorroga: aplazar el plazo del donador suma dias y respeta el maximo', async () => {
    const { s, repoOxp } = servicio({
      asignacion: { id: 40, estado: EstadoAsignacion.ASIGNADO, diasExtra: 0, aplazamientos: 0, ofertaId: 1, peticionId: 5, asignadaEn: new Date() },
      oferta,
      peticion,
    });
    await s.prorrogar(40, 'APLAZAR', 'El donador pidio mas tiempo', 1);
    expect(repoOxp.save).toHaveBeenCalledWith(expect.objectContaining({ diasExtra: 5, aplazamientos: 1 }));
    const { s: s2 } = servicio({
      asignacion: { id: 41, estado: EstadoAsignacion.ASIGNADO, diasExtra: 5, aplazamientos: 1, ofertaId: 1, peticionId: 5, asignadaEn: new Date() },
      oferta,
      peticion,
    });
    await expect(s2.prorrogar(41, 'APLAZAR', 'Otra vez mas tiempo', 1)).rejects.toThrow('maximo');
  });

  const movimiento = {
    cantidad: 3,
    nombreContraparte: 'Persona ficticia',
    foto: { mime: 'image/png', contenidoBase64: 'x'.repeat(120) },
  };

  it('T2.4 rechaza una devolucion parcial', async () => {
    const { s, evidencias, repoMov } = servicio({
      asignacion: { id: 40, estado: EstadoAsignacion.DEVOLUCION, cantidadAsignada: 5 },
    });
    await expect(s.registrarDevolucion(40, movimiento, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(evidencias.guardar).not.toHaveBeenCalled();
    expect(repoMov.save).not.toHaveBeenCalled();
  });

  it('T2.4 registra la devolucion completa con su fotografia', async () => {
    const { s, evidencias, repoMov } = servicio({
      asignacion: { id: 40, estado: EstadoAsignacion.DEVOLUCION, cantidadAsignada: 3 },
    });
    await s.registrarDevolucion(40, movimiento, 1);
    expect(evidencias.guardar).toHaveBeenCalled();
    expect(repoMov.save).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: TipoMovimiento.DEVOLUCION, cantidad: 3, evidenciaId: 300 }),
    );
  });

  it('el detalle no expone la evidencia de movimientos a las partes (T1.3)', async () => {
    const { s } = servicio({});
    const asignaciones: any = (s as any).asignaciones;
    asignaciones.findOne.mockResolvedValueOnce({
      id: 99,
      estado: EstadoAsignacion.ENTREGADO,
      oferta: { donadorId: 7 },
      peticion: { estudianteId: 8 },
      movimientos: [
        { id: 1, tipo: TipoMovimiento.ENTREGA, cantidad: 1, evidenciaId: 555, nombreContraparte: 'X', registradoEn: new Date() },
      ],
    });
    const r: any = await s.detalle(99, { sub: 7, esPersonalLis: false } as any);
    expect(r.movimientos[0].evidenciaId).toBeUndefined();
    expect(r.movimientos[0].nombreContraparte).toBeUndefined();
  });
});
