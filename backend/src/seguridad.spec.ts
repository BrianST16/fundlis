/**
 * Pruebas de seguridad y privacidad del modulo M1 (lote B1, 2026-11-20).
 * Usan repositorios dobles y datos ficticios: no tocan ninguna base de datos.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsuarioActual } from './auth/auth.types';
import { EstadoOferta, Perfil, Rol } from './common/enums';
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

  it('rechaza una foto que ya es evidencia de un movimiento fisico', async () => {
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

  it('foto de oferta APROBADA: publica (catalogo)', async () => {
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

  it('ADMINISTRADOR no se restringe por perfil mientras P-03 este pendiente', async () => {
    const { s, dataSource } = servicio(Perfil.ESTUDIANTE);
    await s.otorgarRol(3, Rol.ADMINISTRADOR, 1);
    expect(dataSource.transaction).toHaveBeenCalled();
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
