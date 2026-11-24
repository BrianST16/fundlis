import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { Perfil, Rol } from '../common/enums';
import { CaracterizacionController } from './caracterizacion.controller';
import { CertificadoService, firmaCertificadoValida } from './certificado.service';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

function servicio(existente: any = null, maxBytes = 2 * 1024 * 1024) {
  const repoTx = { findOne: jest.fn(async () => existente), insert: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const repo: any = {
    findOne: jest.fn(async () =>
      existente ?? { nombreOriginal: 'c.pdf', mime: 'application/pdf', tamanoBytes: 1, estadoRevision: 'PENDIENTE' },
    ),
  };
  const parametros: any = { maxBytesEvidencia: jest.fn(async () => maxBytes) };
  const historial: any = { registrar: jest.fn() };
  const dataSource: any = { transaction: jest.fn(async (cb: any) => cb({ getRepository: () => repoTx })) };
  return { s: new CertificadoService(repo, parametros, historial, dataSource), repoTx, historial, dataSource };
}

describe('D-46 Certificado de estudio: validacion del archivo', () => {
  it('reconoce la firma real de PDF y PNG', () => {
    expect(firmaCertificadoValida(PDF, 'application/pdf')).toBe(true);
    expect(firmaCertificadoValida(PNG, 'image/png')).toBe(true);
  });

  it('rechaza un archivo disfrazado (PNG declarado como PDF)', () => {
    expect(firmaCertificadoValida(PNG, 'application/pdf')).toBe(false);
  });

  it('no acepta formatos fuera de PDF/JPEG/PNG', async () => {
    const { s, dataSource } = servicio();
    await expect(
      s.subir(5, { mime: 'image/webp', contenidoBase64: PNG.toString('base64') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('respeta el tamano maximo configurado', async () => {
    const { s, dataSource } = servicio(null, 10);
    await expect(
      s.subir(5, { mime: 'application/pdf', contenidoBase64: PDF.toString('base64') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('primera carga: inserta y registra CERTIFICADO_SUBIDO en el historial', async () => {
    const { s, repoTx, historial } = servicio(null);
    await s.subir(5, { mime: 'application/pdf', contenidoBase64: PDF.toString('base64'), nombreOriginal: 'c.pdf' });
    expect(repoTx.insert).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 5, estadoRevision: 'PENDIENTE' }));
    expect(historial.registrar.mock.calls[0][0].estadoNuevo).toBe('CERTIFICADO_SUBIDO');
  });

  it('reemplazo: actualiza, vuelve a PENDIENTE y registra CERTIFICADO_REEMPLAZADO', async () => {
    const { s, repoTx, historial } = servicio({ id: 9, usuarioId: 5, estadoRevision: 'VALIDADO' });
    await s.subir(5, { mime: 'image/png', contenidoBase64: PNG.toString('base64') });
    expect(repoTx.update).toHaveBeenCalledWith(
      { id: 9 },
      expect.objectContaining({ estadoRevision: 'PENDIENTE', revisadoPor: null }),
    );
    expect(historial.registrar.mock.calls[0][0]).toMatchObject({
      estadoAnterior: 'CERTIFICADO_VALIDADO',
      estadoNuevo: 'CERTIFICADO_REEMPLAZADO',
    });
  });

  it('rechazar exige una observacion', async () => {
    const { s, dataSource } = servicio({ id: 9, usuarioId: 5, estadoRevision: 'PENDIENTE' });
    await expect(s.revisar(5, 'RECHAZADO', undefined, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});

describe('D-46 Certificado de estudio: privacidad de las rutas (RolesGuard real)', () => {
  const guard = new RolesGuard(new Reflector());
  const ctx = (metodo: string, usuario: any) =>
    ({
      getHandler: () => (CaracterizacionController.prototype as any)[metodo],
      getClass: () => CaracterizacionController,
      switchToHttp: () => ({ getRequest: () => ({ usuario }) }),
    }) as any;
  const u = (perfil: Perfil, roles: Rol[] = []) => ({
    sub: 1,
    perfil,
    roles,
    esAdministrador: roles.includes(Rol.ADMINISTRADOR) || roles.includes(Rol.SUPERUSUARIO),
  });

  it.each(['certificadoDe', 'certificadoArchivoDe', 'revisarCertificado'])(
    '%s: el AUXILIAR no ve el certificado; el administrador y el superusuario si',
    (metodo) => {
      expect(() => guard.canActivate(ctx(metodo, u(Perfil.DONADOR, [Rol.AUXILIAR_LIS])))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx(metodo, u(Perfil.ESTUDIANTE)))).toThrow(ForbiddenException);
      expect(guard.canActivate(ctx(metodo, u(Perfil.DONADOR, [Rol.ADMINISTRADOR])))).toBe(true);
      expect(guard.canActivate(ctx(metodo, u(Perfil.DONADOR, [Rol.SUPERUSUARIO])))).toBe(true);
    },
  );

  it.each(['miCertificado', 'miCertificadoArchivo', 'subirCertificado', 'eliminarCertificado'])(
    '%s: solo el perfil ESTUDIANTE (sobre su propio certificado)',
    (metodo) => {
      expect(guard.canActivate(ctx(metodo, u(Perfil.ESTUDIANTE)))).toBe(true);
      expect(() => guard.canActivate(ctx(metodo, u(Perfil.DONADOR)))).toThrow(ForbiddenException);
    },
  );
});
