/**
 * Pruebas de los pilares B (plazos/DEFINIR_ESTADO) y C (analitica/ranking).
 * Lotes B3-B4, 2026-11-20. Datos ficticios; sin base de datos.
 */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AnaliticaController } from './analitica/analitica.controller';
import { AnaliticaService, clasificarCompromisoDonador } from './analitica/analitica.service';
import { alertasDe, cumplimientoSuavizado, rankear, REGLA_ALERTA_POR_DEFECTO } from './analitica/formulas';
import { RolesGuard } from './auth/roles.guard';
import {
  EstadoAsignacion,
  EstadoOferta,
  EstadoPeticion,
  Perfil,
  Rol,
} from './common/enums';
import { calcularPlazo } from './plazos/plazos';
import { PlazosController } from './plazos/plazos.controller';
import { PlazosService } from './plazos/plazos.service';

const CONFIG = { donador: 10, estudiante: 3, avisoPrevio: 1 };
const asignadaEn = new Date('2026-11-20T15:00:00Z'); // viernes 20-nov, 10:00 Bogota

// ---------------------------------------------------------------------------
// Pilar B
// ---------------------------------------------------------------------------
describe('Pilar B: calcularPlazo', () => {
  const asignado = { estado: EstadoAsignacion.ASIGNADO, asignadaEn };

  it('donador: 10 días hábiles, en plazo a mitad de camino', () => {
    const p = calcularPlazo(asignado, new Date('2026-11-25T15:00:00Z'), CONFIG);
    expect(p).toMatchObject({
      responsable: 'DONADOR',
      inicio: '2026-11-20',
      fechaLimite: '2026-12-04',
      diasHabilesRestantes: 7,
      estado: 'EN_PLAZO',
      tarea: null,
    });
  });

  it('donador: por vencer el dia anterior y el mismo dia límite', () => {
    expect(calcularPlazo(asignado, new Date('2026-12-03T15:00:00Z'), CONFIG).estado).toBe('POR_VENCER');
    const hoy = calcularPlazo(asignado, new Date('2026-12-04T22:00:00Z'), CONFIG);
    expect(hoy.estado).toBe('POR_VENCER');
    expect(hoy.diasHabilesRestantes).toBe(0);
  });

  it('donador vencido: genera DEFINIR_ESTADO con acciones disponibles', () => {
    const p = calcularPlazo(asignado, new Date('2026-12-07T15:00:00Z'), CONFIG);
    expect(p.estado).toBe('VENCIDO');
    expect(p.diasHabilesRestantes).toBe(-1);
    expect(p.tarea).toBe('DEFINIR_ESTADO');
    expect(p.acciones.map((a) => [a.codigo, a.disponible])).toEqual([
      ['CANCELAR_INTENTO', true],
      ['APLAZAR', true],
    ]);
  });

  it('una prórroga (diasExtra) mueve la fecha límite en días hábiles', () => {
    const p = calcularPlazo({ ...asignado, diasExtra: 5 }, new Date('2026-12-07T15:00:00Z'), CONFIG);
    // 10 dias habiles -> 4-dic; +5: 7, (8 festivo), 9, 10, 11, 14 -> 14-dic.
    expect(p.fechaLimite).toBe('2026-12-14');
    expect(p.estado).toBe('EN_PLAZO');
  });

  it('reasignación: el plazo del estudiante corre desde custodiaDesde, no desde la recepción original', () => {
    const p = calcularPlazo(
      { estado: EstadoAsignacion.EN_CUSTODIA, asignadaEn, recibidaEn: new Date('2026-11-01T15:00:00Z'), custodiaDesde: new Date('2026-12-04T20:00:00Z') },
      new Date('2026-12-07T15:00:00Z'),
      CONFIG,
    );
    expect(p.fechaLimite).toBe('2026-12-10');
  });

  it('estudiante: 3 días hábiles desde EN_CUSTODIA, salta el festivo del 8-dic', () => {
    const p = calcularPlazo(
      { estado: EstadoAsignacion.EN_CUSTODIA, asignadaEn, recibidaEn: new Date('2026-12-04T20:00:00Z') },
      new Date('2026-12-11T15:00:00Z'),
      CONFIG,
    );
    expect(p).toMatchObject({ responsable: 'ESTUDIANTE', fechaLimite: '2026-12-10', estado: 'VENCIDO' });
    expect(p.acciones.map((a) => a.codigo)).toEqual(['EXTENDER', 'CANCELAR_INTENTO', 'DEVOLUCION']);
    expect(p.acciones.every((a) => a.disponible)).toBe(true);
  });

  it('los cierres del LIS alargan el plazo', () => {
    const p = calcularPlazo(asignado, new Date('2026-11-25T15:00:00Z'), CONFIG, [
      { desde: '2026-11-30', hasta: '2026-12-02' },
    ]);
    expect(p.fechaLimite).toBe('2026-12-10');
  });

  it('intentos cerrados no tienen plazo', () => {
    for (const estado of [EstadoAsignacion.ENTREGADO, EstadoAsignacion.CANCELADO, EstadoAsignacion.DEVOLUCION]) {
      expect(calcularPlazo({ estado, asignadaEn }, new Date(), CONFIG)).toBeNull();
    }
  });
});

describe('Pilar B: PlazosService', () => {
  const intentos = [
    {
      id: 1,
      estado: EstadoAsignacion.ASIGNADO,
      cantidadAsignada: 2,
      asignadaEn,
      oferta: { donadorId: 7, nombreProducto: 'Calculadora', donador: { nombre: 'D', email: 'd@example.com' } },
      peticion: { estudianteId: 8, estudiante: { nombre: 'E', email: 'e@udea.edu.co' } },
    },
    {
      id: 2,
      estado: EstadoAsignacion.EN_CUSTODIA,
      cantidadAsignada: 1,
      asignadaEn,
      recibidaEn: new Date('2026-12-04T20:00:00Z'),
      oferta: { donadorId: 9, nombreProducto: 'Libro', donador: { nombre: 'D2', email: 'd2@example.com' } },
      peticion: { estudianteId: 8, estudiante: { nombre: 'E', email: 'e@udea.edu.co' } },
    },
  ];
  const servicio = () =>
    new PlazosService(
      { find: jest.fn(async () => intentos) } as any,
      { plazos: async () => CONFIG } as any,
      { cierres: async () => [], recepcionSuspendida: async () => null } as any,
    );
  const ahora = new Date('2026-12-07T15:00:00Z');

  it('la bandeja pone primero las tareas vencidas y filtra por estado', async () => {
    const s = servicio();
    const todo = await s.bandeja(undefined, ahora);
    expect(todo.map((x) => [x.asignacionId, x.plazo.estado])).toEqual([
      [1, 'VENCIDO'],
      [2, 'EN_PLAZO'],
    ]);
    expect(await s.bandeja('VENCIDO', ahora)).toHaveLength(1);
    expect(await s.resumen(ahora)).toEqual({ vencidos: 1, porVencer: 0, enPlazo: 1, tareasDefinirEstado: 1 });
  });

  it('"mios" muestra al estudiante solo su recogida y no revela al donador', async () => {
    const r = await servicio().mios({ sub: 8 } as any, ahora);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ asignacionId: 2, responsable: 'ESTUDIANTE' });
    expect(JSON.stringify(r)).not.toContain('d2@example.com');
  });

  it('"mios" muestra al donador su entrega pendiente', async () => {
    const r = await servicio().mios({ sub: 7 } as any, ahora);
    expect(r.map((x) => x.asignacionId)).toEqual([1]);
    expect(JSON.stringify(r)).not.toContain('e@udea.edu.co');
  });
});

// ---------------------------------------------------------------------------
// Pilar C
// ---------------------------------------------------------------------------
describe('Pilar C: formulas', () => {
  it('cumplimiento suavizado (Laplace), calculado a mano', () => {
    expect(cumplimientoSuavizado(0, 0)).toBe(0.5);
    expect(cumplimientoSuavizado(1, 0)).toBeCloseTo(2 / 3, 10);
    expect(cumplimientoSuavizado(20, 0)).toBeCloseTo(21 / 22, 10);
    expect(cumplimientoSuavizado(3, 0)).toBeCloseTo(0.8, 10);
  });

  it('ranking de estudiantes con pesos 0.85/0.15 y alertas', () => {
    const r = rankear(
      [
        { id: 4, participaciones: 3, exitos: 0, fallos: 2 },
        { id: 2, participaciones: 2, exitos: 1, fallos: 1 },
        { id: 1, participaciones: 4, exitos: 3, fallos: 0 },
        { id: 3, participaciones: 1, exitos: 0, fallos: 0 },
      ],
      { cumplimiento: 0.85, actividad: 0.15 },
    );
    // A mano: 1 -> 0.85*0.8 + 0.15*1 = 0.83 ; 2 -> 0.85*0.5 + 0.15*0.5 = 0.5 ;
    //         3 -> 0.85*0.5 + 0.15*0.25 = 0.4625 ; 4 -> 0.85*0.25 + 0.15*0.75 = 0.325
    expect(r.map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(r.map((x) => x.reputacion)).toEqual([0.83, 0.5, 0.4625, 0.325]);
    expect(r.map((x) => x.posicion)).toEqual([1, 2, 3, 4]);

    expect(alertasDe(r, REGLA_ALERTA_POR_DEFECTO)).toEqual([
      { id: 4, motivos: ['FALLOS_REPETIDOS', 'REPUTACION_BAJA'] },
    ]);
  });

  it('pesos invalidos o que no suman 1 se normalizan', () => {
    const a = rankear([{ id: 1, participaciones: 1, exitos: 1, fallos: 0 }], { cumplimiento: 17, actividad: 3 });
    const b = rankear([{ id: 1, participaciones: 1, exitos: 1, fallos: 0 }], { cumplimiento: 0.85, actividad: 0.15 });
    expect(a[0].reputacion).toBe(b[0].reputacion);
  });

  it('clasificacion de compromisos del donador', () => {
    const inc = new Set([3]);
    const c = (estado: EstadoAsignacion, id = 1, recibidaEn: Date | null = null) =>
      clasificarCompromisoDonador({ id, estado, recibidaEn }, inc);
    expect(c(EstadoAsignacion.ASIGNADO)).toBe('PENDIENTE');
    expect(c(EstadoAsignacion.ENTREGADO)).toBe('COMPLETADO');
    expect(c(EstadoAsignacion.CANCELADO)).toBe('FALLIDO'); // no llevo el producto
    expect(c(EstadoAsignacion.CANCELADO, 3, new Date())).toBe('FALLIDO'); // llevo menos
    expect(c(EstadoAsignacion.CANCELADO, 4, new Date())).toBe('COMPLETADO'); // fallo el estudiante
  });
});

describe('Pilar C: AnaliticaService con datos ficticios', () => {
  const R = new Date('2026-11-10T15:00:00Z');
  const ofertas = [
    { id: 1, donadorId: 7, estado: EstadoOferta.APROBADA, cantidad: 20, donador: { nombre: 'Donador 7', email: 'd7@example.com' } },
    { id: 2, donadorId: 8, estado: EstadoOferta.PENDIENTE_APROBACION, cantidad: 5, donador: { nombre: 'Donador 8', email: 'd8@example.com' } },
  ];
  const D = 'DONADOR';
  const intentos = [
    { id: 1, ofertaId: 1, origen: D, estado: EstadoAsignacion.ENTREGADO, cantidadAsignada: 3, asignadaEn: new Date('2026-11-01T15:00:00Z'), recibidaEn: R, entregadaEn: new Date('2026-11-12T15:00:00Z') },
    { id: 2, ofertaId: 1, origen: D, estado: EstadoAsignacion.CANCELADO, cantidadAsignada: 2, asignadaEn: R, recibidaEn: null },
    { id: 3, ofertaId: 1, origen: D, estado: EstadoAsignacion.CANCELADO, cantidadAsignada: 5, asignadaEn: R, recibidaEn: R },
    { id: 4, ofertaId: 1, origen: D, estado: EstadoAsignacion.CANCELADO, cantidadAsignada: 1, asignadaEn: R, recibidaEn: R },
    { id: 5, ofertaId: 1, origen: D, estado: EstadoAsignacion.ASIGNADO, cantidadAsignada: 1, asignadaEn: R, recibidaEn: null },
    // Una reasignacion NO es compromiso del donador: no cuenta en su ranking.
    { id: 6, ofertaId: 1, origen: 'REASIGNACION', estado: EstadoAsignacion.CANCELADO, cantidadAsignada: 1, asignadaEn: R, recibidaEn: R },
  ];
  // El intento 3 dejo un lote de recepcion INCOMPLETA (evento registrado).
  const lotes = [{ id: 9, intentoOrigenId: 3, origen: 'RECEPCION_INCOMPLETA', ubicacion: 'EN_LIS', cantidad: 2, sinDestinoDesde: R }];
  const destinos = [{ id: 1, ofertaId: 1, origen: 'OFERTA', estado: 'CANCELADO', cantidad: 1 }];
  const peticiones = [
    { id: 1, estudianteId: 30, estado: EstadoPeticion.CERRADA_ENTREGA, estudiante: { nombre: 'E30', email: 'e30@udea.edu.co' } },
    { id: 2, estudianteId: 30, estado: EstadoPeticion.APROBADA, estudiante: { nombre: 'E30', email: 'e30@udea.edu.co' } },
    { id: 3, estudianteId: 31, estado: EstadoPeticion.CERRADA_INCUMPLIMIENTO, estudiante: { nombre: 'E31', email: 'e31@udea.edu.co' } },
    { id: 4, estudianteId: 31, estado: EstadoPeticion.CERRADA_INCUMPLIMIENTO, estudiante: { nombre: 'E31', email: 'e31@udea.edu.co' } },
  ];
  const servicio = () =>
    new AnaliticaService(
      { find: jest.fn(async () => ofertas) } as any,
      { find: jest.fn(async () => peticiones) } as any,
      { find: jest.fn(async () => intentos) } as any,
      { find: jest.fn(async () => lotes) } as any,
      { find: jest.fn(async () => destinos) } as any,
      {
        pesosReputacion: async () => ({ cumplimiento: 0.85, actividad: 0.15 }),
        reglaAlerta: async () => ({ umbralFallos: 2, umbralReputacion: 0.4 }),
        minDonacionesRecurrente: async () => umbralRecurrente,
      } as any,
    );
  let umbralRecurrente = 3;
  afterEach(() => (umbralRecurrente = 3));

  it('D-49: donador recurrente = completadas >= umbral configurable (por defecto 3)', async () => {
    // Donador 7 tiene 2 completadas: con umbral 3 no es recurrente.
    let r: any[] = await servicio().rankingDonadores();
    expect(r.find((x) => x.usuarioId === 7)).toMatchObject({ completadas: 2, recurrente: false, umbralRecurrente: 3 });
    // Con umbral 2 si lo es; el donador 8 (sin historial) nunca.
    umbralRecurrente = 2;
    r = await servicio().rankingDonadores();
    expect(r.find((x) => x.usuarioId === 7).recurrente).toBe(true);
    expect(r.find((x) => x.usuarioId === 8).recurrente).toBe(false);
  });

  it('indicadores coinciden con el cálculo manual', async () => {
    const i = await servicio().indicadores();
    expect(i.asignacionesPorEstado).toMatchObject({ ENTREGADO: 1, CANCELADO: 4, ASIGNADO: 1 });
    expect(i.unidadesOfertadas).toBe(20); // solo la oferta aprobada
    expect(i.unidadesEntregadas).toBe(3);
    expect(i.tasaEntrega).toBe(0.2); // 1 entregado / 5 cerrados
    expect(i.unidadesEnLis).toBe(2);
    expect(i.lotesSinDestino).toBe(1);
    expect(i.tasaAtencionPeticiones).toBeCloseTo(1 / 4, 4); // 1 entregada / (1 aprobada + 1 entregada + 2 incumplidas)
    expect(i.diasPromedioRecepcionAEntrega).toBe(2);
  });

  it('ranking DIRECTO de donadores (D-40): completadas / (completadas + fallidas)', async () => {
    const r: any[] = await servicio().rankingDonadores();
    // Donador 7: intentos 1 y 4 completados; 2 (no llevo), 3 (incompleta) y el LOCAL cancelado fallidos; 5 pendiente.
    expect(r[0]).toMatchObject({ usuarioId: 7, compromisos: 6, completadas: 2, fallidas: 3, pendientes: 1, tasaCumplimiento: 0.4 });
    // Sin historial: tasa null, queda despues.
    expect(r[1]).toMatchObject({ usuarioId: 8, compromisos: 0, tasaCumplimiento: null, posicion: 2 });
  });

  it('ranking de estudiantes y alertas de incumplimiento', async () => {
    const s = servicio();
    const est: any[] = await s.rankingEstudiantes();
    expect(est.map((x) => [x.usuarioId, x.ayudasRecibidas, x.incumplimientos])).toEqual([
      [30, 1, 0],
      [31, 0, 2],
    ]);
    const al = await s.alertas();
    expect(al.estudiantes.map((x: any) => [x.usuarioId, x.motivos])).toEqual([
      [31, ['FALLOS_REPETIDOS', 'REPUTACION_BAJA']],
    ]);
    expect(al.estudiantes[0].explicacion).toContain('2 incumplimiento');
    expect(al.donadores.map((x: any) => [x.usuarioId, x.motivos])).toEqual([[7, ['FALLOS_REPETIDOS']]]);
  });
});

// ---------------------------------------------------------------------------
// RBAC de los endpoints nuevos (metadatos reales + RolesGuard real)
// ---------------------------------------------------------------------------
describe('RBAC de analítica y plazos', () => {
  const guard = new RolesGuard(new Reflector());
  const ctx = (clase: any, metodo: string, usuario: any) =>
    ({
      getHandler: () => clase.prototype[metodo],
      getClass: () => clase,
      switchToHttp: () => ({ getRequest: () => ({ usuario }) }),
    }) as any;
  const u = (perfil: Perfil, roles: Rol[] = []) => ({
    sub: 1,
    perfil,
    roles,
    esAdministrador: roles.includes(Rol.ADMINISTRADOR),
  });

  it.each(['indicadores', 'rankingEstudiantes', 'rankingDonadores', 'alertas'])(
    'analítica.%s: estudiante y donador 403; auxiliar y administrador 200',
    (metodo) => {
      expect(() => guard.canActivate(ctx(AnaliticaController, metodo, u(Perfil.ESTUDIANTE)))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx(AnaliticaController, metodo, u(Perfil.DONADOR)))).toThrow(ForbiddenException);
      expect(guard.canActivate(ctx(AnaliticaController, metodo, u(Perfil.DONADOR, [Rol.AUXILIAR_LIS])))).toBe(true);
      expect(guard.canActivate(ctx(AnaliticaController, metodo, u(Perfil.DONADOR, [Rol.ADMINISTRADOR])))).toBe(true);
    },
  );

  it('plazos.bandeja exige personal LIS; plazos.mios cualquier autenticado', () => {
    expect(() => guard.canActivate(ctx(PlazosController, 'bandeja', u(Perfil.ESTUDIANTE)))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(PlazosController, 'bandeja', u(Perfil.DONADOR, [Rol.AUXILIAR_LIS])))).toBe(true);
    expect(guard.canActivate(ctx(PlazosController, 'mios', u(Perfil.ESTUDIANTE)))).toBe(true);
  });
});
