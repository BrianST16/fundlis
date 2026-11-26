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
    // D-56: toda accion cierra las tareas DEFINIR_ESTADO abiertas de su objeto.
    getRepository: jest.fn(
      (entidad: any) =>
        repos[entidad.name] ??
        (entidad.name === 'Tarea'
          ? (repos.Tarea = repoTareas())
          : entidad.name === 'Usuario' // D-64: cuentas activas por defecto
            ? (repos.Usuario = { findOne: jest.fn(async () => ({ activo: true })) })
            : undefined),
    ),
  };
}

/** Repositorio de TAREA por defecto: registra los cierres (D-56). */
function repoTareas() {
  return { update: jest.fn(async () => ({ affected: 0 })) };
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

  it('T2.1 el catálogo oculta las peticiones con asignación vigente', async () => {
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

  it('T2.1 catálogo vacio no consulta asignaciones', async () => {
    const { s } = servicio({ aprobadas: [] });
    await expect(s.catalogo()).resolves.toEqual([]);
  });

  it('T2.3 con 5 peticiones abiertas rechaza la sexta DENTRO de la transacción', async () => {
    const { s, repoPeticion, mgr } = servicio({ usadas: 5 });
    await expect(
      s.crear(5, { categoriaId: 2, descripcion: 'Necesito una calculadora científica' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Se bloqueo la fila del estudiante antes de contar y no se inserto nada.
    expect(mgr.createQueryBuilder).toHaveBeenCalled();
    expect(repoPeticion.save).not.toHaveBeenCalled();
  });

  it('T2.3 con cupo crea la petición y su historial en la misma transacción', async () => {
    const { s, repoPeticion, historial, mgr } = servicio({ usadas: 4 });
    await s.crear(5, { categoriaId: 2, descripcion: 'Necesito una calculadora científica' });
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
    const repoTarea = repoTareas();
    const mgr = gestorTransaccional(
      {
        Oferta: { one: opc.oferta },
        Peticion: { one: opc.peticion },
        OfertaXPeticion: { one: opc.asignacion ?? null, many: opc.intentos ?? [], secuencia: opc.secuenciaAsignacion },
        LoteFisico: { one: opc.lote ?? null },
      },
      {
        Tarea: repoTarea,
        OfertaXPeticion: repoOxp,
        Movimiento: repoMov,
        LoteFisico: repoLote,
        DestinoLocal: repoLocal,
        Oferta: repoGenerico(opc.entidades?.Oferta ?? opc.oferta),
        ...(opc.entidades?.Usuario ? { Usuario: repoGenerico(opc.entidades.Usuario) } : {}),
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
      emparejamiento,
      evidencias,
      historial,
      dataSource,
      notificaciones,
      calendario,
      parametros,
    );
    return { s, repoOxp, repoMov, repoLote, repoLocal, repoTarea, evidencias, notificaciones, calendario, emparejamiento, dataSource, historial };
  }

  const oferta = { id: 1, estado: EstadoOferta.APROBADA, cantidad: 10, categoriaId: 2, donadorId: 7, nombreProducto: 'Chaqueta', estadoConservacion: 4, medida: 3 };
  const peticion = { id: 5, estado: EstadoPeticion.APROBADA, categoriaId: 2, estudianteId: 8, descripcion: 'Necesito una chaqueta' };
  // Intento previo: 5 asignadas y se recibio (completa o incompleta): esas unidades ya no vuelven a la oferta.
  const intentos = [{ id: 11, estado: EstadoAsignacion.CANCELADO, cantidadAsignada: 5, recibidaEn: new Date(), origen: 'DONADOR' }];

  it('T2.2 al asignar no ofrece unidades que ya pasaron por recepción', async () => {
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

  it('P-23: reasignar un lote crea un intento EN_CUSTODIA SIN nueva recepción', async () => {
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

  it('D-50: un lote en custodia temporal Local se empareja directo y el destino Local se cierra en la misma transacción', async () => {
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
    await expect(s.reasignarLote(70, 5, 1)).rejects.toThrow('asignación 40');
  });

  it('cancelar desde EN_CUSTODIA deja el lote SIN DESTINO y cierra la petición por incumplimiento', async () => {
    const { s, repoLote } = servicio({
      asignacion: { id: 40, estado: EstadoAsignacion.EN_CUSTODIA, loteId: 70, ofertaId: 1, peticionId: 5, cantidadAsignada: 2 },
      oferta,
      peticion,
    });
    await s.cancelar(40, 'No recogió en el plazo', 1);
    expect(repoLote.update).toHaveBeenCalledWith({ id: 70 }, expect.objectContaining({ sinDestinoDesde: expect.any(Date) }));
  });

  // -------------------------------------------------------------------------
  // D-64 (C2) — no se crean asignaciones nuevas con cuentas bloqueadas
  // -------------------------------------------------------------------------
  it('C2: no asigna a la petición de un estudiante bloqueado', async () => {
    const { s, repoOxp } = servicio({
      oferta, peticion: { ...peticion, estado: EstadoPeticion.APROBADA }, intentos: [],
      entidades: { Usuario: { id: 8, activo: false } },
    });
    await expect(s.asignar({ ofertaId: 1, peticionId: 5, cantidad: 1 }, 1)).rejects.toThrow('está bloqueada');
    expect(repoOxp.save).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // D-57 — cancelar un producto EN_CUSTODIA: causa y aviso al donador
  // -------------------------------------------------------------------------
  const custodia40 = () => ({ id: 40, estado: EstadoAsignacion.EN_CUSTODIA, loteId: 70, ofertaId: 1, peticionId: 5, cantidadAsignada: 2 });
  const cierresPeticion = (historial: any) =>
    historial.registrar.mock.calls.map((c: any) => c[0]).filter((h: any) => h.entidad === 'PETICION').map((h: any) => h.estadoNuevo);

  it('D-57: por defecto (el estudiante no recogió) la petición se cierra por INCUMPLIMIENTO', async () => {
    const { s, historial } = servicio({ asignacion: custodia40(), oferta, peticion: { ...peticion, estado: EstadoPeticion.APROBADA } });
    await s.cancelar(40, 'No recogió en el plazo', 1);
    expect(cierresPeticion(historial)).toEqual([EstadoPeticion.CERRADA_INCUMPLIMIENTO]);
  });

  it('D-57: con causa OTRO la petición se cierra como CANCELADA, sin incumplimiento del estudiante', async () => {
    const { s, historial, notificaciones } = servicio({ asignacion: custodia40(), oferta, peticion: { ...peticion, estado: EstadoPeticion.APROBADA } });
    await s.cancelar(40, 'El producto llegó dañado', 1, undefined, { causa: 'OTRO' });
    expect(cierresPeticion(historial)).toEqual([EstadoPeticion.CANCELADA]);
    expect(notificaciones.aUsuarios).toHaveBeenCalledWith(
      [8],
      expect.objectContaining({ mensaje: expect.stringContaining('sin contar como incumplimiento') }),
    );
  });

  it('D-57: la causa solo aplica a un producto EN_CUSTODIA (no a uno que el donador no ha llevado)', async () => {
    const { s, repoOxp } = servicio({ asignacion: { ...custodia40(), estado: EstadoAsignacion.ASIGNADO, loteId: null }, oferta, peticion });
    await expect(s.cancelar(40, 'El estudiante no recogió el producto en el plazo.', 1, undefined, { causa: 'ESTUDIANTE_NO_RECOGIO' }))
      .rejects.toThrow('solo aplica a un producto EN_CUSTODIA');
    expect(repoOxp.save).not.toHaveBeenCalled();
  });

  it('D-57: avisa al DONADOR que su producto sigue en el LIS, sin datos del estudiante', async () => {
    const { s, notificaciones } = servicio({ asignacion: custodia40(), oferta, peticion: { ...peticion, estado: EstadoPeticion.APROBADA } });
    await s.cancelar(40, 'No recogió en el plazo', 1);
    const alDonador = notificaciones.aUsuarios.mock.calls.find((c: any) => c[0][0] === 7);
    expect(alDonador?.[1]).toMatchObject({ titulo: 'Tu donación sigue en el LIS' });
    expect(alDonador?.[1].mensaje).not.toContain(peticion.descripcion);
  });

  it('D-57: en una reasignación no se repite el aviso al donador (ya recibe DONACION_REASIGNADA)', async () => {
    const { s, notificaciones } = escenarioReasignacion();
    await s.reasignarDesdeCustodia(40, 5, 'El estudiante no recogió', 1);
    const titulos = notificaciones.aUsuarios.mock.calls.map((c: any) => c[1].titulo);
    expect(titulos).not.toContain('Tu donación sigue en el LIS');
  });

  // -------------------------------------------------------------------------
  // D-56 — una sola decision, varias entradas: la tarea se cierra con la
  // decision real, en la misma transaccion (no como SIN_ACCION "por otra via")
  // -------------------------------------------------------------------------
  it('D-56: cancelar desde Custodia resuelve la tarea DEFINIR_ESTADO como CANCELAR_INTENTO, con motivo y responsable', async () => {
    const { s, repoTarea } = servicio({
      asignacion: { id: 40, estado: EstadoAsignacion.EN_CUSTODIA, loteId: 70, ofertaId: 1, peticionId: 5, cantidadAsignada: 2 },
      oferta,
      peticion,
    });
    await s.cancelar(40, 'No recogió en el plazo', 3);
    expect(repoTarea.update).toHaveBeenCalledWith(
      { estado: 'ABIERTA', asignacionId: 40 },
      expect.objectContaining({ estado: 'RESUELTA', decision: 'CANCELAR_INTENTO', motivo: 'No recogió en el plazo', resueltaPor: 3 }),
    );
  });

  it('D-56: reasignar desde Custodia resuelve la tarea de la asignación como REASIGNAR y las del lote', async () => {
    const { s, repoTarea } = escenarioReasignacion();
    await s.reasignarDesdeCustodia(40, 5, 'El estudiante no recogió', 1);
    const cierres = repoTarea.update.mock.calls.map((c: any) => [c[0], c[1].decision]);
    expect(cierres).toContainEqual([{ estado: 'ABIERTA', asignacionId: 40 }, 'REASIGNAR']);
    expect(cierres).toContainEqual([{ estado: 'ABIERTA', loteId: 70 }, 'REASIGNAR']);
  });

  // -------------------------------------------------------------------------
  // Correccion 6 — reasignacion directa de un producto EN_CUSTODIA
  // -------------------------------------------------------------------------
  const enCustodia = () => ({
    id: 40, estado: EstadoAsignacion.EN_CUSTODIA, loteId: 70, ofertaId: 1, peticionId: 4, cantidadAsignada: 2,
  });
  // Peticion original (la que se cierra) y peticion destino: objetos distintos.
  const peticionOriginal = () => ({ id: 4, estado: EstadoPeticion.APROBADA, estudianteId: 9, descripcion: 'Petición original' });
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

  it('C6: reasigna EN_CUSTODIA -> nuevo intento EN_CUSTODIA en UNA transacción, sin nueva recepción', async () => {
    const { s, repoOxp, repoMov, evidencias, dataSource } = escenarioReasignacion();
    await s.reasignarDesdeCustodia(40, 5, 'El estudiante no recogió', 1);

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
    await s.reasignarDesdeCustodia(40, 5, 'El estudiante no recogió', 1);
    const estados = historial.registrar.mock.calls.map((c: any) => `${c[0].entidad}:${c[0].estadoNuevo}`);
    expect(estados).toEqual(
      expect.arrayContaining(['ASIGNACION:CANCELADO', 'ASIGNACION:EN_CUSTODIA', 'LOTE:REASIGNADO', 'ASIGNACION:REASIGNADA']),
    );
  });

  it('C6: avisa al estudiante original, al nuevo y al DONADOR; no alerta de un lote sin destino', async () => {
    const { s, notificaciones } = escenarioReasignacion();
    await s.reasignarDesdeCustodia(40, 5, 'El estudiante no recogió', 1);
    const llamadas = notificaciones.aUsuarios.mock.calls;
    expect(llamadas.map((c: any) => c[0][0])).toEqual(expect.arrayContaining([9, 8, 7]));
    const alDonador = llamadas.find((c: any) => c[0][0] === 7)[1];
    expect(alDonador.tipo).toBe('DONACION_REASIGNADA');
    // Sin identidades: el donador no ve la descripcion de ninguna peticion.
    expect(JSON.stringify(alDonador)).not.toContain('Necesito una chaqueta');
    expect(notificaciones.aPersonalLis).not.toHaveBeenCalled();
  });

  it('C6: solo aplica a productos EN_CUSTODIA (un ASIGNADO aún no está en el LIS)', async () => {
    const { s, repoOxp } = servicio({
      asignacion: { ...enCustodia(), estado: EstadoAsignacion.ASIGNADO, loteId: null },
      oferta,
      peticion,
    });
    await expect(s.reasignarDesdeCustodia(40, 5, 'motivo de prueba', 1)).rejects.toThrow('EN_CUSTODIA');
    expect(repoOxp.save).not.toHaveBeenCalled();
  });

  it('C6: si la petición destino no sirve, falla DENTRO de la misma transacción (se revierte la cancelación)', async () => {
    const { s, dataSource } = escenarioReasignacion({ ...destinoAprobado(), estado: EstadoPeticion.RECHAZADA });
    await expect(s.reasignarDesdeCustodia(40, 5, 'motivo de prueba', 1)).rejects.toThrow('petición aprobada');
    // Cancelar y reasignar van en la misma transaccion: el error la revierte entera.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('prórroga: aplazar el plazo del donador suma días y respeta el máximo', async () => {
    const { s, repoOxp } = servicio({
      asignacion: { id: 40, estado: EstadoAsignacion.ASIGNADO, diasExtra: 0, aplazamientos: 0, ofertaId: 1, peticionId: 5, asignadaEn: new Date() },
      oferta,
      peticion,
    });
    await s.prorrogar(40, 'APLAZAR', 'El donador pidio más tiempo', 1);
    expect(repoOxp.save).toHaveBeenCalledWith(expect.objectContaining({ diasExtra: 5, aplazamientos: 1 }));
    const { s: s2 } = servicio({
      asignacion: { id: 41, estado: EstadoAsignacion.ASIGNADO, diasExtra: 5, aplazamientos: 1, ofertaId: 1, peticionId: 5, asignadaEn: new Date() },
      oferta,
      peticion,
    });
    await expect(s2.prorrogar(41, 'APLAZAR', 'Otra vez más tiempo', 1)).rejects.toThrow('máximo');
  });

  const movimiento = {
    cantidad: 3,
    nombreContraparte: 'Persona ficticia',
    foto: { mime: 'image/png', contenidoBase64: 'x'.repeat(120) },
  };

  it('T2.4 rechaza una devolución parcial', async () => {
    const { s, evidencias, repoMov } = servicio({
      asignacion: { id: 40, estado: EstadoAsignacion.DEVOLUCION, cantidadAsignada: 5 },
    });
    await expect(s.registrarDevolucion(40, movimiento, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(evidencias.guardar).not.toHaveBeenCalled();
    expect(repoMov.save).not.toHaveBeenCalled();
  });

  it('T2.4 registra la devolución completa con su fotografía', async () => {
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

describe('AsignacionesService.mias (seguimiento en Mis donaciones / Mis peticiones)', () => {
  const fila = {
    id: 31, estado: EstadoAsignacion.EN_CUSTODIA, cantidadAsignada: 2, ofertaId: 4, peticionId: 9,
    asignadaEn: new Date(), recibidaEn: new Date(), entregadaEn: null, motivoCierre: null,
    oferta: { donadorId: 7, nombreProducto: 'Calculadora', categoria: { nombre: 'Utiles' } },
    peticion: { estudianteId: 8 },
  };
  function servicio() {
    const qb: any = {};
    for (const m of ['leftJoinAndSelect', 'where', 'orderBy']) qb[m] = jest.fn(() => qb);
    qb.getMany = jest.fn(async () => [fila]);
    const repo: any = { createQueryBuilder: jest.fn(() => qb) };
    const nulo: any = {};
    return new AsignacionesService(repo, nulo, nulo, nulo, nulo, nulo, nulo, nulo);
  }

  it('al donador le entrega el id de SU oferta y nunca el de la petición del estudiante', async () => {
    const [a] = await servicio().mias({ sub: 7 } as any);
    expect(a).toMatchObject({ miPapel: 'DONADOR', ofertaId: 4, peticionId: null });
  });

  it('al estudiante le entrega el id de SU petición y nunca el de la oferta del donador', async () => {
    const [a] = await servicio().mias({ sub: 8 } as any);
    expect(a).toMatchObject({ miPapel: 'ESTUDIANTE', ofertaId: null, peticionId: 9 });
  });
});

describe('D-64 (C3): una oferta sin nada por mover se cierra sola', () => {
  function mgrCon(intentos: any[], enEspera = 0) {
    const oferta = { id: 1, estado: EstadoOferta.APROBADA, cantidad: 4, donadorId: 7, origen: 'DONADOR' };
    const repoOferta = { findOne: jest.fn(async () => ({ ...oferta })), save: jest.fn(async (x: any) => x) };
    const repos: Record<string, any> = {
      Oferta: repoOferta,
      OfertaXPeticion: { find: jest.fn(async () => intentos) },
      DestinoLocal: { find: jest.fn(async () => []), count: jest.fn(async () => enEspera) },
      LoteFisico: { find: jest.fn(async () => []) },
    };
    const mgr: any = { getRepository: (e: any) => repos[e.name] };
    const historial: any = { registrar: jest.fn() };
    const nulo: any = {};
    const s = new AsignacionesService(nulo, nulo, nulo, historial, nulo, nulo, nulo, nulo);
    return { s, mgr, repoOferta, historial };
  }
  const recibido = (cantidadAsignada: number) => ({ estado: EstadoAsignacion.EN_CUSTODIA, cantidadAsignada, origen: 'DONADOR', recibidaEn: new Date() });

  it('todas las unidades recibidas: pasa a CERRADA y queda en el historial', async () => {
    const { s, mgr, repoOferta, historial } = mgrCon([recibido(4)]);
    expect(await s.cerrarOfertaSiAgotadaEn(mgr, 1, 3)).toBe(true);
    expect(repoOferta.save).toHaveBeenCalledWith(expect.objectContaining({ estado: EstadoOferta.CERRADA }));
    expect(historial.registrar).toHaveBeenCalledWith(expect.objectContaining({ estadoNuevo: EstadoOferta.CERRADA }), mgr);
  });

  it('con unidades disponibles o comprometidas, sigue aprobada', async () => {
    expect(await mgrCon([recibido(2)]).s.cerrarOfertaSiAgotadaEn(mgrCon([recibido(2)]).mgr, 1, 3)).toBe(false);
    const comprometida = mgrCon([{ estado: EstadoAsignacion.ASIGNADO, cantidadAsignada: 4, origen: 'DONADOR' }]);
    expect(await comprometida.s.cerrarOfertaSiAgotadaEn(comprometida.mgr, 1, 3)).toBe(false);
  });

  it('con un destino Local esperando recepción, sigue aprobada (si se cancela, las unidades vuelven)', async () => {
    const { s, mgr } = mgrCon([recibido(4)], 1);
    expect(await s.cerrarOfertaSiAgotadaEn(mgr, 1, 3)).toBe(false);
  });
});
