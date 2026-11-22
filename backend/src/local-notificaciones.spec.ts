/**
 * Pruebas de LOCAL (D-43), notificaciones en dos canales (D-42) y tareas
 * DEFINIR_ESTADO con reloj controlado. Dobles de repositorio; sin BD ni red.
 */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createTransport } from 'nodemailer';
import { RolesGuard } from './auth/roles.guard';
import { EstadoAsignacion, EstadoPeticion, Perfil, Rol } from './common/enums';
import { EmparejamientoService, FILA_LOCAL } from './emparejamiento/emparejamiento.service';
import { LocalController } from './local/local.controller';
import { LocalService } from './local/local.service';
import { CorreoService } from './notificaciones/correo.service';
import { NotificacionesService } from './notificaciones/notificaciones.service';
import { TareasService } from './tareas/tareas.service';

// ---------------------------------------------------------------------------
// LOCAL
// ---------------------------------------------------------------------------
function gestor(resultados: Record<string, any>, repos: Record<string, any>) {
  return {
    createQueryBuilder: jest.fn((e: any) => {
      const qb: any = { setLock: () => qb, where: () => qb, andWhere: () => qb, getOne: jest.fn(async () => resultados[e.name] ?? null) };
      return qb;
    }),
    getRepository: jest.fn((e: any) => repos[e.name]),
  };
}

describe('LOCAL: sujeto institucional (D-19, D-20, D-43)', () => {
  function servicio(destino: any, extras: { titular?: any } = {}) {
    const repoDestino = { save: jest.fn(async (x) => ({ ...x, id: x.id ?? 33 })), create: jest.fn((x) => x) };
    const repoLote = { update: jest.fn(), create: jest.fn((x) => x), save: jest.fn(async (x) => ({ ...x, id: 70 })) };
    const repoOxp = { findOne: jest.fn(async () => extras.titular ?? null) };
    const repoPeticion = { save: jest.fn(), create: jest.fn() };
    const mgr = gestor(
      { DestinoLocal: destino, LoteFisico: { id: 70, ubicacion: 'EN_LIS', ofertaId: 1, cantidad: 2 } },
      {
        DestinoLocal: repoDestino,
        LoteFisico: repoLote,
        OfertaXPeticion: repoOxp,
        Oferta: { findOne: jest.fn(async () => ({ id: 1, donadorId: 7, nombreProducto: 'Silla' })) },
        Peticion: repoPeticion,
      },
    );
    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(mgr)) };
    const historial: any = { registrar: jest.fn(), de: jest.fn(async () => []) };
    const notificaciones: any = { aUsuarios: jest.fn(async () => 1), aPersonalLis: jest.fn(async () => 1), aAdministradores: jest.fn(async () => 1) };
    const asignaciones: any = {
      bloquearLote: jest.fn(async () => ({ id: 70, ubicacion: 'EN_LIS', ofertaId: 1, cantidad: 2 })),
      reasignarLoteEn: jest.fn(async () => 501),
    };
    const destinosRepo: any = { findOne: jest.fn(async () => ({ ...destino, oferta: {} })) };
    const s = new LocalService(
      destinosRepo,
      {} as any,
      {} as any,
      dataSource,
      historial,
      { guardar: jest.fn(async () => ({ id: 300 })) } as any,
      notificaciones,
      asignaciones,
      { prioridadDe: jest.fn(async () => ({ prioridad: { total: 0.5 }, coeficientes: 'x' })) } as any,
      { recepcionSuspendida: jest.fn(async () => null) } as any,
    );
    return { s, repoDestino, repoLote, repoPeticion, notificaciones, asignaciones };
  }
  const admin: any = { sub: 1, esAdministrador: true, esPersonalLis: true };
  const auxiliar: any = { sub: 2, esAdministrador: false, esPersonalLis: true };

  it('LOCAL aparece como fila fija al final y no es una peticion', () => {
    expect(FILA_LOCAL.tipo).toBe('LOCAL');
    expect(FILA_LOCAL.reglas.join(' ')).toContain('ultima opcion');
  });

  it('el auxiliar puede iniciar custodia temporal de un lote sin destino, sin crear peticiones', async () => {
    const { s, repoDestino, repoLote, repoPeticion } = servicio({ id: 33, estado: 'CUSTODIA_TEMPORAL' });
    await s.custodiaDesdeLote(70, 'Esperando respuesta del donador', auxiliar.sub);
    expect(repoDestino.save).toHaveBeenCalledWith(
      expect.objectContaining({ origen: 'LOTE', loteId: 70, estado: 'CUSTODIA_TEMPORAL', seleccionadoPor: 2 }),
    );
    expect(repoLote.update).toHaveBeenCalledWith({ id: 70 }, expect.objectContaining({ sinDestinoDesde: null }));
    expect(repoPeticion.save).not.toHaveBeenCalled();
    expect(repoPeticion.create).not.toHaveBeenCalled();
  });

  it('no inicia custodia LOCAL de un lote que tiene un intento vigente', async () => {
    const { s } = servicio({ id: 33 }, { titular: { id: 40 } });
    await expect(s.custodiaDesdeLote(70, 'Esperando respuesta del donador', 2)).rejects.toThrow('asignacion 40');
  });

  it('SOLO el administrador acepta como donativo institucional (servicio)', async () => {
    const { s } = servicio({ id: 33, estado: 'CUSTODIA_TEMPORAL', loteId: 70, ofertaId: 1, cantidad: 2 });
    await expect(s.aceptar(33, 'Uso del laboratorio', auxiliar)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el administrador acepta: lote pasa a PATRIMONIO_LIS y queda registrado quien autorizo', async () => {
    const { s, repoDestino, repoLote } = servicio({ id: 33, estado: 'CUSTODIA_TEMPORAL', loteId: 70, ofertaId: 1, cantidad: 2 });
    await s.aceptar(33, 'Uso del laboratorio', admin);
    expect(repoDestino.save).toHaveBeenCalledWith(expect.objectContaining({ estado: 'ACEPTADO', aceptadoPor: 1 }));
    expect(repoLote.update).toHaveBeenCalledWith({ id: 70 }, expect.objectContaining({ ubicacion: 'PATRIMONIO_LIS' }));
  });

  it('SOLO el administrador acepta (guard real sobre los metadatos del controlador)', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx = (usuario: any) =>
      ({ getHandler: () => LocalController.prototype.aceptar, getClass: () => LocalController, switchToHttp: () => ({ getRequest: () => ({ usuario }) }) }) as any;
    expect(() => guard.canActivate(ctx({ perfil: Perfil.DONADOR, roles: [Rol.AUXILIAR_LIS], esAdministrador: false }))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx({ perfil: Perfil.DONADOR, roles: [Rol.ADMINISTRADOR], esAdministrador: true }))).toBe(true);
  });

  it('reasignar desde custodia LOCAL cierra el destino y crea el intento con el mismo lote', async () => {
    const { s, repoDestino, asignaciones } = servicio({ id: 33, estado: 'CUSTODIA_TEMPORAL', loteId: 70, ofertaId: 1, cantidad: 2 });
    const r = await s.reasignar(33, 5, auxiliar.sub);
    expect(repoDestino.save).toHaveBeenCalledWith(expect.objectContaining({ estado: 'REASIGNADO' }));
    expect(asignaciones.reasignarLoteEn).toHaveBeenCalledWith(expect.anything(), 70, 5, 2, expect.anything(), expect.anything());
    expect(r.asignacionId).toBe(501);
  });
});

describe('Emparejamiento en dos fases: compatibilidad (KD) y luego prioridad', () => {
  it('excluye incompatibles, ordena por prioridad, oculta el Sisben al auxiliar y pone LOCAL al final', async () => {
    const cat = { id: 4, nombre: 'Ropa y calzado', medidaNombre: 'Talla' };
    const oferta = { id: 1, estado: 'APROBADA', categoriaId: 4, categoria: cat, cantidad: 3, nombreProducto: 'Chaqueta', estadoConservacion: 4, medida: 3 };
    const creada = new Date('2026-10-01T15:00:00Z');
    const peticiones = [
      { id: 10, estudianteId: 100, estado: EstadoPeticion.APROBADA, categoriaId: 4, estadoMinimo: 3, medidaMin: 2, medidaMax: 4, creadaEn: creada, descripcion: 'A', estudiante: { nombre: 'Est A' } },
      { id: 11, estudianteId: 101, estado: EstadoPeticion.APROBADA, categoriaId: 4, estadoMinimo: 5, medidaMin: null, medidaMax: null, creadaEn: creada, descripcion: 'B (exige nuevo)', estudiante: { nombre: 'Est B' } },
      { id: 12, estudianteId: 102, estado: EstadoPeticion.APROBADA, categoriaId: 4, estadoMinimo: 1, medidaMin: 5, medidaMax: 7, creadaEn: creada, descripcion: 'C (talla grande)', estudiante: { nombre: 'Est C' } },
      { id: 13, estudianteId: 103, estado: EstadoPeticion.APROBADA, categoriaId: 4, estadoMinimo: 1, medidaMin: null, medidaMax: null, creadaEn: creada, descripcion: 'D', estudiante: { nombre: 'Est D' } },
    ];
    const caracterizaciones = [
      { usuarioId: 100, grupoSisben: 'C3', puntajeTotal: 0.4 },
      { usuarioId: 101, grupoSisben: 'A1', puntajeTotal: 1 },
      { usuarioId: 102, grupoSisben: 'A1', puntajeTotal: 1 },
      { usuarioId: 103, grupoSisben: 'A2', puntajeTotal: 0.9 },
    ];
    const s = new EmparejamientoService(
      { findOne: jest.fn(async () => oferta) } as any,
      { find: jest.fn(async () => peticiones) } as any,
      { find: jest.fn(async () => []) } as any,
      { find: jest.fn(async () => caracterizaciones) } as any,
      { find: jest.fn(async () => [{ codigo: 'A1', puntajeNecesidad: 1 }, { codigo: 'A2', puntajeNecesidad: 0.95 }, { codigo: 'C3', puntajeNecesidad: 0.47 }]) } as any,
      {} as any,
      { find: jest.fn(async () => []) } as any,
      { find: jest.fn(async () => []) } as any,
      { coeficientesPrioridad: async () => ({ caracterizacion: 0.5, sisben: 0.3, antiguedad: 0.2, horizonteDias: 90 }) } as any,
    );
    const auxiliar: any = { esAdministrador: false };
    const r: any = await s.candidatosParaOferta(1, auxiliar);

    // 11 (exige estado 5) y 12 (talla 5-7) son incompatibles con estado 4 / talla 3.
    expect(r.candidatos.map((c: any) => c.peticionId)).toEqual([13, 10]);
    expect(r.diagnostico).toMatchObject({ totalEnCategoria: 4, compatibles: 2, incompatibles: 2, coincideConFiltroLineal: true });
    expect(r.candidatos[0].prioridad.total).toBeGreaterThan(r.candidatos[1].prioridad.total);
    expect(r.candidatos[0].grupoSisben).toBeUndefined(); // D-39
    expect(r.destinoLocal.tipo).toBe('LOCAL');
    expect(r.escalaPrioridad).toContain('No es un porcentaje');
  });
});

// ---------------------------------------------------------------------------
// Notificaciones y correo
// ---------------------------------------------------------------------------
describe('Notificaciones: bandeja + correo (D-42)', () => {
  function servicio(opc: { existente?: boolean; correoConfigurado?: boolean } = {}) {
    const guardadas: any[] = [];
    const correosGuardados: any[] = [];
    const notificaciones: any = {
      findOne: jest.fn(async () => (opc.existente ? { id: '1' } : null)),
      create: (x: any) => x,
      save: jest.fn(async (x: any) => {
        guardadas.push(x);
        return { ...x, id: String(guardadas.length) };
      }),
    };
    const correos: any = { create: (x: any) => x, save: jest.fn(async (x: any) => correosGuardados.push(x)) };
    const usuarios: any = {
      findOne: jest.fn(async ({ where }: any) => ({ id: where.id, email: `u${where.id}@example.com`, activo: true })),
      find: jest.fn(async () => [{ id: 1 }, { id: 2 }]),
    };
    const roles: any = { find: jest.fn(async () => [{ usuarioId: 1 }, { usuarioId: 2 }]) };
    const correo: any = { estadoInicial: () => (opc.correoConfigurado ? 'PENDIENTE' : 'SIN_CONFIGURACION') };
    return { s: new NotificacionesService(notificaciones, correos, usuarios, roles, correo), guardadas, correosGuardados, notificaciones };
  }
  const aviso = { tipo: 'X', titulo: 'T', mensaje: 'M', clave: 'EVENTO:1' };

  it('crea una notificacion en bandeja y encola un correo por destinatario', async () => {
    const { s, guardadas, correosGuardados } = servicio({ correoConfigurado: true });
    expect(await s.aUsuarios([5, 6, 5, null], aviso)).toBe(2);
    expect(guardadas.map((g) => g.usuarioId)).toEqual([5, 6]);
    expect(correosGuardados.map((c) => [c.destinatario, c.estado])).toEqual([
      ['u5@example.com', 'PENDIENTE'],
      ['u6@example.com', 'PENDIENTE'],
    ]);
  });

  it('idempotencia: el mismo evento no se repite al mismo usuario', async () => {
    const { s, guardadas } = servicio({ existente: true });
    expect(await s.aUsuarios([5], aviso)).toBe(0);
    expect(guardadas).toHaveLength(0);
  });

  it('sin SMTP la bandeja funciona y el correo queda SIN_CONFIGURACION (no se declara enviado)', async () => {
    const { s, correosGuardados } = servicio({ correoConfigurado: false });
    await s.aUsuarios([5], aviso);
    expect(correosGuardados[0].estado).toBe('SIN_CONFIGURACION');
  });

  it('un fallo al notificar NO lanza (no revierte la operacion de negocio)', async () => {
    const { s, notificaciones } = servicio();
    notificaciones.save.mockRejectedValueOnce(new Error('BD caida'));
    await expect(s.aUsuarios([5], aviso)).resolves.toBe(0);
  });

  it('una violacion de unicidad concurrente se trata como ya notificado', async () => {
    const { s, notificaciones } = servicio();
    notificaciones.save.mockRejectedValueOnce(Object.assign(new Error('dup'), { number: 2627 }));
    await expect(s.aUsuarios([5], aviso)).resolves.toBe(0);
  });
});

describe('CorreoService: envio, reintentos y reclamo (D-42)', () => {
  const config: any = { get: () => undefined };
  const parametros: any = { numero: jest.fn(async () => 3) };
  function repo(filas: any[]) {
    return {
      find: jest.fn(async () => filas),
      update: jest.fn(async (where: any, cambios: any) => {
        const f = filas.find((x) => x.id === where.id);
        if (where.intentos !== undefined && f.intentos !== where.intentos) return { affected: 0 };
        Object.assign(f, cambios);
        return { affected: 1 };
      }),
    };
  }

  it('envia con un transporte real de nodemailer (jsonTransport, sin red) y marca ENVIADO', async () => {
    const filas = [{ id: '1', estado: 'PENDIENTE', intentos: 0, destinatario: 'a@example.com', asunto: 'S', cuerpo: 'C' }];
    const s = new CorreoService(repo(filas) as any, parametros, config);
    s.usarTransporte(createTransport({ jsonTransport: true }), 'LIS <lis@example.com>');
    expect(await s.procesarPendientes(new Date())).toEqual({ enviados: 1, fallidos: 0 });
    expect(filas[0].estado).toBe('ENVIADO');
  });

  it('si el SMTP falla: reintenta con espera creciente y tras el maximo queda en ERROR', async () => {
    const filas = [{ id: '1', estado: 'PENDIENTE', intentos: 0, destinatario: 'a@example.com', asunto: 'S', cuerpo: 'C' }];
    const s = new CorreoService(repo(filas) as any, parametros, config);
    s.usarTransporte({ sendMail: jest.fn(async () => { throw new Error('ECONNREFUSED'); }) } as any);
    const t0 = new Date('2026-11-20T15:00:00Z');
    await s.procesarPendientes(t0);
    expect(filas[0]).toMatchObject({ estado: 'PENDIENTE', intentos: 1, ultimoError: 'ECONNREFUSED' });
    expect((filas[0] as any).proximoIntentoEn.getTime()).toBe(t0.getTime() + 2 * 60_000);
    await s.procesarPendientes(t0);
    await s.procesarPendientes(t0);
    expect(filas[0]).toMatchObject({ estado: 'ERROR', intentos: 3 });
  });

  it('sin SMTP configurado no intenta enviar', async () => {
    const s = new CorreoService(repo([]) as any, parametros, config);
    expect(s.configurado()).toBe(false);
    expect(s.estadoInicial()).toBe('SIN_CONFIGURACION');
    expect(await s.procesarPendientes()).toEqual({ enviados: 0, fallidos: 0 });
  });
});

// ---------------------------------------------------------------------------
// Tareas DEFINIR_ESTADO con reloj controlado
// ---------------------------------------------------------------------------
describe('TareasService.revisar con fecha simulada (sin esperar dias reales)', () => {
  const asignadaEn = new Date('2026-11-20T15:00:00Z');
  function servicio() {
    const tareas: any[] = [];
    const repoTareas: any = {
      findOne: jest.fn(async ({ where }: any) => tareas.find((t) => t.clave === where.clave) ?? null),
      create: (x: any) => x,
      save: jest.fn(async (x: any) => tareas.push({ ...x, id: tareas.length + 1 })),
      find: jest.fn(async () => tareas.filter((t) => t.estado === 'ABIERTA')),
      update: jest.fn(),
    };
    const intento = {
      id: 40,
      estado: EstadoAsignacion.ASIGNADO,
      asignadaEn,
      diasExtra: 0,
      oferta: { donadorId: 7, nombreProducto: 'Silla' },
      peticion: { estudianteId: 8 },
    };
    const intentos: any = { find: jest.fn(async () => [intento]), findOne: jest.fn(async () => intento) };
    const vacio: any = { find: jest.fn(async () => []) };
    const notificaciones: any = { aUsuarios: jest.fn(async () => 1), aPersonalLis: jest.fn(async () => 2) };
    const s = new TareasService(
      repoTareas,
      intentos,
      vacio,
      vacio,
      {} as any,
      {} as any,
      notificaciones,
      { cierres: async () => [] } as any,
      { plazos: async () => ({ donador: 10, estudiante: 3, avisoPrevio: 1 }), numero: async (_: string, d: number) => d } as any,
      { get: () => undefined } as any,
    );
    return { s, tareas, notificaciones };
  }

  it('dia anterior al limite: aviso de proximidad al donador y al LIS, sin tarea', async () => {
    const { s, tareas, notificaciones } = servicio();
    const r = await s.revisar(new Date('2026-12-03T15:00:00Z'));
    expect(r.tareasCreadas).toBe(0);
    expect(tareas).toHaveLength(0);
    expect(notificaciones.aUsuarios).toHaveBeenCalledWith([7], expect.objectContaining({ tipo: 'PLAZO_PROXIMO' }));
    expect(notificaciones.aPersonalLis).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'PLAZO_PROXIMO' }));
  });

  it('vencido: crea UNA tarea DEFINIR_ESTADO aunque la revision corra varias veces (idempotente)', async () => {
    const { s, tareas, notificaciones } = servicio();
    const ahora = new Date('2026-12-07T15:00:00Z');
    await s.revisar(ahora);
    await s.revisar(ahora);
    expect(tareas).toHaveLength(1);
    expect(tareas[0]).toMatchObject({ tipo: 'DEFINIR_ESTADO', asignacionId: 40, responsable: 'DONADOR', fechaLimite: '2026-12-04', clave: 'VENCE:OXP:40:2026-12-04' });
    expect(notificaciones.aUsuarios).toHaveBeenCalledWith([7], expect.objectContaining({ tipo: 'PLAZO_VENCIDO', clave: 'PLAZO:OXP:40:2026-12-04:VENCIDO' }));
    expect(notificaciones.aPersonalLis).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'TAREA_DEFINIR_ESTADO' }));
  });

  it('el aviso al donador no revela al estudiante', async () => {
    const { s, notificaciones } = servicio();
    await s.revisar(new Date('2026-12-07T15:00:00Z'));
    const alDonador = notificaciones.aUsuarios.mock.calls.find((c: any) => c[0][0] === 7)[1];
    expect(JSON.stringify(alDonador)).not.toMatch(/estudiante 8|Est /);
  });
});
