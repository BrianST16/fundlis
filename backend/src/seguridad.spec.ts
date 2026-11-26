/**
 * Pruebas de seguridad y privacidad del modulo M1 (lote B1, 2026-11-20).
 * Usan repositorios dobles y datos ficticios: no tocan ninguna base de datos.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsuarioActual } from './auth/auth.types';
import { EstadoOferta, EstadoPeticion, Perfil, Rol } from './common/enums';
import { EvidenciasService } from './evidencias/evidencias.service';
import { HealthController } from './health/health.controller';
import { OfertasService } from './ofertas/ofertas.service';
import { UsuariosService } from './usuarios/usuarios.service';

const donador = (sub: number): UsuarioActual => ({
  sub,
  email: `donador${sub}@example.com`,
  nombre: 'Donador ficticio',
  perfil: Perfil.DONADOR,
  roles: [],
  esSuperusuario: false,
  esAuxiliar: false,
  esAdministrador: false,
  esPersonalLis: false,
});
const estudiante = (sub: number): UsuarioActual => ({
  ...donador(sub),
  email: `est${sub}@udea.edu.co`,
  perfil: Perfil.ESTUDIANTE,
});
const auxiliar: UsuarioActual = {
  ...donador(1),
  roles: [Rol.AUXILIAR_LIS],
  esAuxiliar: true,
  esPersonalLis: true,
};

// ---------------------------------------------------------------------------
// T1.2 — foto de la oferta
// ---------------------------------------------------------------------------
describe('T1.2 OfertasService: validacion del fotoId', () => {
  function servicio(opc: { evidencia?: any; enMovimiento?: number; enOtraOferta?: number }) {
    const ofertas: any = {
      count: jest.fn(async () => opc.enOtraOferta ?? 0),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 50 })),
      findOne: jest.fn(async () => ({
        id: 50,
        donadorId: 7,
        categoriaId: 1,
        nombreProducto: 'Cuadernos',
        descripcion: 'Cuadernos nuevos de 100 hojas',
        cantidad: 4,
        estado: EstadoOferta.PENDIENTE_APROBACION,
        fotoId: 9,
      })),
    };
    const asignaciones: any = { find: jest.fn(async () => []), count: jest.fn(async () => 0) };
    const evidencias: any = { findOne: jest.fn(async () => opc.evidencia ?? null) };
    const movimientos: any = {
      count: jest.fn(async () => opc.enMovimiento ?? 0),
      find: jest.fn(async () => []),
    };
    const vacio: any = { find: jest.fn(async () => []) };
    const categorias: any = {
      obtenerActiva: jest.fn(async () => ({ id: 1, medidaNombre: null })),
      validarMedidaOferta: jest.fn(() => null),
    };
    const historial: any = { registrar: jest.fn(async () => undefined) };
    const notificaciones: any = { aUsuarios: jest.fn(async () => 1) };
    const calendario: any = { recepcionSuspendida: jest.fn(async () => null) };
    const s = new OfertasService(
      ofertas,
      asignaciones,
      evidencias,
      movimientos,
      vacio,
      vacio,
      categorias,
      historial,
      notificaciones,
      calendario,
    );
    return { s, ofertas };
  }
  const datos = {
    categoriaId: 1,
    nombreProducto: 'Cuadernos',
    descripcion: 'Cuadernos nuevos de 100 hojas',
    cantidad: 4,
    fotoId: 9,
    estadoConservacion: 4,
  };

  it('rechaza una foto que subio otra persona (antes: IDOR)', async () => {
    const { s, ofertas } = servicio({ evidencia: { id: 9, subidaPor: 99 } });
    await expect(s.crear(7, datos)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ofertas.save).not.toHaveBeenCalled();
  });

  it('rechaza una foto que ya es evidencia de un movimiento físico', async () => {
    const { s } = servicio({ evidencia: { id: 9, subidaPor: 7 }, enMovimiento: 1 });
    await expect(s.crear(7, datos)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una foto usada por otra oferta', async () => {
    const { s } = servicio({ evidencia: { id: 9, subidaPor: 7 }, enOtraOferta: 1 });
    await expect(s.crear(7, datos)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una foto inexistente', async () => {
    const { s } = servicio({});
    await expect(s.crear(7, datos)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta una foto propia y libre', async () => {
    const { s, ofertas } = servicio({ evidencia: { id: 9, subidaPor: 7 } });
    const r = await s.crear(7, datos);
    expect(ofertas.save).toHaveBeenCalled();
    expect(r.id).toBe(50);
    expect((r as any).donador).toBeUndefined(); // el donador no recibe su propia identidad en el DTO
  });
});

// ---------------------------------------------------------------------------
// T1.3 — acceso a evidencias
// ---------------------------------------------------------------------------
describe('T1.3 EvidenciasService.puedeVer', () => {
  function servicio(opc: { enMovimiento?: number; oferta?: any; subidaPor?: number }) {
    const repo: any = { findOne: jest.fn(async () => ({ id: 1, subidaPor: opc.subidaPor ?? 0 })) };
    const ofertas: any = { findOne: jest.fn(async () => opc.oferta ?? null) };
    const movimientos: any = { count: jest.fn(async () => opc.enMovimiento ?? 0) };
    const parametros: any = {};
    return new EvidenciasService(repo, ofertas, movimientos, parametros);
  }

  it('foto de movimiento: el personal del LIS si la ve', async () => {
    await expect(servicio({ enMovimiento: 1 }).puedeVer(1, auxiliar)).resolves.toBe(true);
  });

  it('foto de movimiento: ni el donador ni el estudiante implicados la ven (H-7d)', async () => {
    const s = servicio({ enMovimiento: 1, subidaPor: 7 });
    await expect(s.puedeVer(1, donador(7))).resolves.toBe(false);
    await expect(s.puedeVer(1, estudiante(8))).resolves.toBe(false);
  });

  it('foto de movimiento: un invitado no la ve', async () => {
    await expect(servicio({ enMovimiento: 1 }).puedeVer(1, null)).resolves.toBe(false);
  });

  it('foto de oferta APROBADA: publica (catálogo)', async () => {
    const s = servicio({ oferta: { estado: EstadoOferta.APROBADA, donadorId: 7 } });
    await expect(s.puedeVer(1, null)).resolves.toBe(true);
  });

  it('foto de oferta pendiente: solo su donador', async () => {
    const s = servicio({ oferta: { estado: EstadoOferta.PENDIENTE_APROBACION, donadorId: 7 } });
    await expect(s.puedeVer(1, donador(7))).resolves.toBe(true);
    await expect(s.puedeVer(1, donador(8))).resolves.toBe(false);
    await expect(s.puedeVer(1, null)).resolves.toBe(false);
  });

  it('foto suelta: solo quien la subio', async () => {
    const s = servicio({ subidaPor: 7 });
    await expect(s.puedeVer(1, donador(7))).resolves.toBe(true);
    await expect(s.puedeVer(1, donador(8))).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D-47 — revision de la propia donacion
// ---------------------------------------------------------------------------
describe('D-47 OfertasService: el auxiliar no revisa sus propias donaciones; el administrador si', () => {
  function servicio(donadorId: number) {
    const ofertas: any = {
      findOne: jest.fn(async () => ({
        id: 60,
        donadorId,
        nombreProducto: 'Calculadora',
        estado: EstadoOferta.PENDIENTE_APROBACION,
      })),
      save: jest.fn(async (x: any) => x),
    };
    const vacio: any = { find: jest.fn(async () => []) };
    const historial: any = { registrar: jest.fn(async () => undefined) };
    const notificaciones: any = { aUsuarios: jest.fn(async () => 1) };
    const s = new OfertasService(
      ofertas, vacio, vacio, vacio, vacio, vacio, {} as any, historial, notificaciones, {} as any,
    );
    // detalle() arma la respuesta con saldos; no es lo que se prueba aqui.
    jest.spyOn(s, 'detalle').mockResolvedValue({} as any);
    return { s, ofertas, historial };
  }

  it('auxiliar: 403 al aprobar su propia donación y no cambia nada', async () => {
    const { s, ofertas } = servicio(1);
    await expect(s.aprobar(60, 1, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ofertas.save).not.toHaveBeenCalled();
  });

  it('auxiliar: 403 al rechazar su propia donación (antes no se validaba)', async () => {
    const { s, ofertas } = servicio(1);
    await expect(s.rechazar(60, 1, 'motivo de prueba', false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ofertas.save).not.toHaveBeenCalled();
  });

  it('auxiliar: si puede aprobar la donación de otra persona', async () => {
    const { s, ofertas } = servicio(7);
    await s.aprobar(60, 1, false);
    expect(ofertas.save).toHaveBeenCalledWith(expect.objectContaining({ estado: EstadoOferta.APROBADA }));
  });

  it('administrador: si puede aprobar su propia donación y queda marcado en el historial', async () => {
    const { s, ofertas, historial } = servicio(1);
    await s.aprobar(60, 1, true);
    expect(ofertas.save).toHaveBeenCalledWith(expect.objectContaining({ estado: EstadoOferta.APROBADA, revisadaPor: 1 }));
    expect(historial.registrar.mock.calls[0][0].motivo).toContain('Autoaprobada por un administrador');
  });
});

// ---------------------------------------------------------------------------
// T1.4 — rol de auxiliar
// ---------------------------------------------------------------------------
describe('T1.4 UsuariosService.otorgarRol', () => {
  function servicio(perfil: Perfil) {
    const usuarios: any = { findOne: jest.fn(async () => ({ id: 3, perfil })) };
    const roles: any = {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => [{ rol: Rol.AUXILIAR_LIS }]),
    };
    const historial: any = { registrar: jest.fn() };
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) =>
        cb({ getRepository: () => ({ create: (x: any) => x, save: jest.fn() }) }),
      ),
    };
    return { s: new UsuariosService(usuarios, roles, historial, dataSource), dataSource };
  }

  it('no otorga AUXILIAR_LIS a una cuenta institucional de estudiante (D-04)', async () => {
    const { s, dataSource } = servicio(Perfil.ESTUDIANTE);
    await expect(s.otorgarRol(3, Rol.AUXILIAR_LIS, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('otorga AUXILIAR_LIS a una cuenta no institucional', async () => {
    const { s, dataSource } = servicio(Perfil.DONADOR);
    await s.otorgarRol(3, Rol.AUXILIAR_LIS, 1);
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('ADMINISTRADOR no se restringe por perfil mientras P-03 este pendiente (lo otorga un superusuario)', async () => {
    const { s, dataSource } = servicio(Perfil.ESTUDIANTE);
    await s.otorgarRol(3, Rol.ADMINISTRADOR, 1, true);
    expect(dataSource.transaction).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D-45 — SUPERUSUARIO y gestion del rol ADMINISTRADOR
// ---------------------------------------------------------------------------
describe('D-45 UsuariosService: solo el superusuario gestiona ADMINISTRADOR', () => {
  function servicio(rolesObjetivo: Rol[] = []) {
    const usuarios: any = {
      findOne: jest.fn(async () => ({ id: 3, perfil: Perfil.DONADOR, activo: true })),
      save: jest.fn(),
    };
    const roles: any = {
      findOne: jest.fn(async ({ where }: any) =>
        rolesObjetivo.includes(where.rol) ? { usuarioId: 3, rol: where.rol } : null,
      ),
      find: jest.fn(async () => rolesObjetivo.map((rol) => ({ rol }))),
      count: jest.fn(async () => 2),
    };
    const historial: any = { registrar: jest.fn() };
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) =>
        cb({ getRepository: () => ({ create: (x: any) => x, save: jest.fn(), delete: jest.fn(), find: jest.fn(async () => []) }) }),
      ),
      // D-64 (C2): sin mediaciones en curso por defecto.
      getRepository: () => ({ createQueryBuilder: () => consultaQueCuenta(0) }),
    };
    return { s: new UsuariosService(usuarios, roles, historial, dataSource), dataSource, usuarios };
  }

  it('un administrador NO puede otorgar ADMINISTRADOR', async () => {
    const { s, dataSource } = servicio();
    await expect(s.otorgarRol(3, Rol.ADMINISTRADOR, 1, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('un administrador NO puede revocar ADMINISTRADOR', async () => {
    const { s, dataSource } = servicio([Rol.ADMINISTRADOR]);
    await expect(s.revocarRol(3, Rol.ADMINISTRADOR, 1, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('un superusuario SI puede revocar ADMINISTRADOR', async () => {
    const { s, dataSource } = servicio([Rol.ADMINISTRADOR]);
    await s.revocarRol(3, Rol.ADMINISTRADOR, 1, true);
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('nadie otorga ni revoca SUPERUSUARIO por la API, ni siquiera otro superusuario', async () => {
    const { s, dataSource } = servicio([Rol.SUPERUSUARIO]);
    await expect(s.otorgarRol(3, Rol.SUPERUSUARIO, 1, true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.revocarRol(3, Rol.SUPERUSUARIO, 1, true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('un administrador sigue pudiendo otorgar AUXILIAR_LIS', async () => {
    const { s, dataSource } = servicio();
    await s.otorgarRol(3, Rol.AUXILIAR_LIS, 1, false);
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('un administrador NO puede bloquear a otro administrador; un superusuario si', async () => {
    const admin = servicio([Rol.ADMINISTRADOR]);
    await expect(admin.s.bloquear(3, 'motivo de prueba', 1, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(admin.usuarios.save).not.toHaveBeenCalled();

    const sup = servicio([Rol.ADMINISTRADOR]);
    await sup.s.bloquear(3, 'motivo de prueba', 1, true);
    // D-64: el bloqueo se guarda dentro de una transaccion (con el cierre de publicaciones).
    expect(sup.dataSource.transaction).toHaveBeenCalled();
  });

  it('un superusuario no se bloquea desde la API', async () => {
    const { s, usuarios } = servicio([Rol.SUPERUSUARIO]);
    await expect(s.bloquear(3, 'motivo de prueba', 1, true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(usuarios.save).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T1.5 — endpoint de salud
// ---------------------------------------------------------------------------
describe('T1.5 HealthController', () => {
  it('con BD caida responde degradado y NO expone el mensaje del motor', async () => {
    const ds: any = {
      query: jest.fn(async () => {
        throw new Error("Login failed for user 'usuario_secreto' on SERVIDOR\\INSTANCIA");
      }),
    };
    const r: any = await new HealthController(ds).estado();
    expect(r.estado).toBe('degradado');
    expect(r.baseDatos).toBe('desconectada');
    expect(r.detalle).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('usuario_secreto');
  });

  it('con BD disponible responde ok', async () => {
    const ds: any = { query: jest.fn(async () => [{ '': 1 }]) };
    const r: any = await new HealthController(ds).estado();
    expect(r).toMatchObject({ estado: 'ok', baseDatos: 'conectada' });
  });
});

/** QueryBuilder doble que devuelve un conteo fijo. */
function consultaQueCuenta(n: number) {
  const qb: any = {};
  for (const m of ['leftJoin', 'innerJoin', 'where', 'andWhere']) qb[m] = () => qb;
  qb.getCount = async () => n;
  return qb;
}

// ---------------------------------------------------------------------------
// D-64 (C2) — bloquear solo sin mediaciones en proceso; se cierran sus publicaciones
// ---------------------------------------------------------------------------
describe('D-64 UsuariosService.bloquear', () => {
  function servicio(enCurso: number, abiertas: { ofertas?: any[]; peticiones?: any[] } = {}) {
    const usuarios: any = {
      findOne: jest.fn(async () => ({ id: 3, nombre: 'Ana Demo', perfil: Perfil.DONADOR, activo: true })),
      save: jest.fn(),
    };
    const roles: any = { find: jest.fn(async () => []), findOne: jest.fn(async () => null), count: jest.fn(async () => 2) };
    const historial: any = { registrar: jest.fn() };
    const guardados: any[] = [];
    const repos: Record<string, any> = {
      Usuario: { save: jest.fn(async (x: any) => guardados.push(x)) },
      Oferta: { find: jest.fn(async () => abiertas.ofertas ?? []), save: jest.fn(async (x: any) => guardados.push(x)) },
      Peticion: { find: jest.fn(async () => abiertas.peticiones ?? []), save: jest.fn(async (x: any) => guardados.push(x)) },
    };
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => cb({ getRepository: (e: any) => repos[e.name] })),
      getRepository: () => ({ createQueryBuilder: () => consultaQueCuenta(enCurso) }),
    };
    return { s: new UsuariosService(usuarios, roles, historial, dataSource), dataSource, guardados, historial };
  }

  it('con una mediacion en proceso no bloquea y pide resolverla', async () => {
    const { s, dataSource } = servicio(1);
    await expect(s.bloquear(3, 'Uso indebido', 1)).rejects.toThrow('Resuélvelas antes de bloquear');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('sin mediaciones: bloquea y cierra sus publicaciones (pendiente -> CANCELADA, aprobada -> CERRADA, petición -> CANCELADA)', async () => {
    const { s, guardados, historial } = servicio(0, {
      ofertas: [
        { id: 10, estado: EstadoOferta.PENDIENTE_APROBACION },
        { id: 11, estado: EstadoOferta.APROBADA },
      ],
      peticiones: [{ id: 20, estado: EstadoPeticion.APROBADA }],
    });
    (s as any).detalle = jest.fn(async () => ({ id: 3 }));
    const r = await s.bloquear(3, 'Uso indebido', 1);
    expect(r).toMatchObject({ cerradas: { ofertas: 2, peticiones: 1 } });
    expect(guardados).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 3, activo: false }),
        expect.objectContaining({ id: 10, estado: EstadoOferta.CANCELADA }),
        expect.objectContaining({ id: 11, estado: EstadoOferta.CERRADA }),
        expect.objectContaining({ id: 20, estado: EstadoPeticion.CANCELADA }),
      ]),
    );
    expect(historial.registrar).toHaveBeenCalledWith(expect.objectContaining({ estadoNuevo: 'BLOQUEADO' }), expect.anything());
  });
});
