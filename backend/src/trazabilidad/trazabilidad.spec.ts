import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { EntidadHistorial, Perfil, Rol } from '../common/enums';
import { EvidenciasService } from '../evidencias/evidencias.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TrazabilidadController } from './trazabilidad.controller';
import { TrazabilidadService } from './trazabilidad.service';

const t = (min: number) => new Date(Date.UTC(2026, 10, 20, 15, min));

// ---------------------------------------------------------------------------
// D-52 / correccion 10 — trazabilidad
// ---------------------------------------------------------------------------
describe('D-52 TrazabilidadService: una linea de tiempo por donacion', () => {
  function servicio(oferta: any = { id: 1, nombreProducto: 'Silla', cantidad: 2, estado: 'APROBADA', fotoId: 9, donador: { nombre: 'Don Ficticio', email: 'don@example.com' } }) {
    const historial = [
      { id: '1', entidad: EntidadHistorial.OFERTA, entidadId: 1, estadoAnterior: null, estadoNuevo: 'PENDIENTE_APROBACION', actorId: 7, motivo: 'Publicada', ocurridoEn: t(0) },
      { id: '2', entidad: EntidadHistorial.OFERTA, entidadId: 1, estadoAnterior: 'PENDIENTE_APROBACION', estadoNuevo: 'APROBADA', actorId: 2, motivo: 'Aprobada', ocurridoEn: t(5) },
      { id: '3', entidad: EntidadHistorial.ASIGNACION, entidadId: 40, estadoAnterior: 'ASIGNADO', estadoNuevo: 'EN_CUSTODIA', actorId: 2, motivo: 'Recibidas 2 u.', ocurridoEn: t(20) },
    ];
    const repos = {
      ofertas: { findOne: jest.fn(async () => oferta), find: jest.fn(async () => []) },
      intentos: { find: jest.fn(async () => [{ id: 40, ofertaId: 1, peticionId: 5, estado: 'EN_CUSTODIA', origen: 'DONADOR', cantidadAsignada: 2, peticion: { estudiante: { nombre: 'Est Ficticio' } } }]) },
      lotes: { find: jest.fn(async () => []) },
      destinos: { find: jest.fn(async () => []) },
      movimientos: { find: jest.fn(async () => [{ id: 3, ofertaXPeticionId: 40, destinoLocalId: null, tipo: 'RECEPCION', cantidad: 2, nombreContraparte: 'Persona ficticia', evidenciaId: 300, observaciones: 'Buen estado', registradoPor: 2, registradoEn: t(20) }]) },
      historial: { find: jest.fn(async ({ where }: any) => historial.filter((h) => h.entidad === where.entidad)) },
      usuarios: { find: jest.fn(async () => [{ id: 2, nombre: 'Auxiliar Ficticio' }, { id: 7, nombre: 'Don Ficticio' }]) },
    };
    const s = new TrazabilidadService(
      repos.ofertas as any, repos.intentos as any, repos.lotes as any, repos.destinos as any,
      repos.movimientos as any, repos.historial as any, repos.usuarios as any,
    );
    return { s, repos };
  }

  it('une estados y movimientos en orden cronologico, con actor, explicacion y foto', async () => {
    const { s } = servicio();
    const r = await s.deOferta(1);
    expect(r.eventos.map((e) => e.id)).toEqual(['H1', 'H2', 'M3', 'H3']); // mismo instante: movimiento antes del estado
    const recepcion = r.eventos.find((e) => e.id === 'M3')!;
    expect(recepcion).toMatchObject({
      clase: 'MOVIMIENTO', tipoMovimiento: 'RECEPCION', actor: 'Auxiliar Ficticio', contraparte: 'Persona ficticia',
      explicacion: 'Buen estado', evidenciaId: 300, referencia: 'Asignacion #40 (peticion #5)',
    });
    expect(r.eventos[1]).toMatchObject({ estadoNuevo: 'APROBADA', actor: 'Auxiliar Ficticio' });
    expect(r.resumen).toMatchObject({ movimientosFisicos: 1, fotos: 2 });
    expect(r.asignaciones[0]).toMatchObject({ id: 40, estudiante: 'Est Ficticio' });
  });

  it('donacion inexistente: 404', async () => {
    const { s } = servicio(null);
    await expect(s.deOferta(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('SOLO administrador (guard real): el auxiliar, donador y estudiante reciben 403', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx = (usuario: any) =>
      ({ getHandler: () => TrazabilidadController.prototype.deOferta, getClass: () => TrazabilidadController, switchToHttp: () => ({ getRequest: () => ({ usuario }) }) }) as any;
    expect(() => guard.canActivate(ctx({ perfil: Perfil.DONADOR, roles: [Rol.AUXILIAR_LIS], esAdministrador: false }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ perfil: Perfil.ESTUDIANTE, roles: [], esAdministrador: false }))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx({ perfil: Perfil.DONADOR, roles: [Rol.ADMINISTRADOR], esAdministrador: true }))).toBe(true);
    expect(guard.canActivate(ctx({ perfil: Perfil.DONADOR, roles: [Rol.SUPERUSUARIO], esAdministrador: true }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D-51 / correccion 9 — foto de la entrega al donador, solo por bandeja
// ---------------------------------------------------------------------------
describe('D-51 foto de la entrega en la bandeja del donador', () => {
  function evidencias(adjuntaA: number | null) {
    const repo: any = { findOne: jest.fn(async () => ({ id: 300, subidaPor: 2 })) };
    const ofertas: any = { findOne: jest.fn(async () => null) };
    const movimientos: any = { count: jest.fn(async () => 1) }; // es foto de un movimiento fisico
    const notificaciones: any = {
      count: jest.fn(async ({ where }: any) => (adjuntaA !== null && where.usuarioId === adjuntaA ? 1 : 0)),
    };
    return new EvidenciasService(repo, ofertas, movimientos, {} as any, notificaciones);
  }
  const usuario = (sub: number): any => ({ sub, esPersonalLis: false });

  it('el donador destinatario de la notificacion SI ve la foto de la entrega', async () => {
    await expect(evidencias(7).puedeVer(300, usuario(7))).resolves.toBe(true);
  });

  it('cualquier otro usuario (p. ej. el estudiante) NO la ve: sigue la regla H-7d', async () => {
    await expect(evidencias(7).puedeVer(300, usuario(8))).resolves.toBe(false);
    await expect(evidencias(7).puedeVer(300, null)).resolves.toBe(false);
  });

  it('soloBandeja: la notificacion guarda la foto y NO encola correo', async () => {
    const guardadas: any[] = [];
    const correos = { save: jest.fn(), create: jest.fn((x) => x) };
    const s = new NotificacionesService(
      { findOne: jest.fn(async () => null), save: jest.fn(async (x: any) => { guardadas.push(x); return { ...x, id: '1' }; }), create: (x: any) => x } as any,
      correos as any,
      { findOne: jest.fn(async () => ({ id: 7, activo: true, email: 'don@example.com' })) } as any,
      {} as any,
      { estadoInicial: () => 'SIN_CONFIGURACION' } as any,
    );
    await s.aUsuarios([7], { tipo: 'ENTREGA_REGISTRADA', titulo: 't', mensaje: 'm', clave: 'k', evidenciaId: 300, soloBandeja: true });
    expect(guardadas[0]).toMatchObject({ usuarioId: 7, evidenciaId: 300 });
    expect(correos.save).not.toHaveBeenCalled();
  });
});
