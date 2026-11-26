import { TareasService } from './tareas.service';

/** D-55: aviso al personal del LIS cuando alguien entra en alerta de incumplimiento. */
describe('TareasService.avisarAlertas', () => {
  function servicio(analitica: any) {
    const notificaciones: any = { aPersonalLis: jest.fn(async () => 2), aUsuarios: jest.fn(async () => 1) };
    const vacio: any = {};
    const s = new TareasService(
      vacio, vacio, vacio, vacio, vacio, vacio, notificaciones, vacio, vacio, { get: () => undefined } as any,
      analitica,
    );
    return { s, notificaciones };
  }

  const alertas = {
    regla: { umbralFallos: 2, umbralReputacion: 0.4 },
    estudiantes: [{ usuarioId: 8, nombre: 'Ana Demo', incumplimientos: 2, reputacion: 0.31, motivos: ['FALLOS_REPETIDOS', 'REPUTACION_BAJA'] }],
    donadores: [{ usuarioId: 7, nombre: 'Luis Demo', fallidas: 1, tasaCumplimiento: 0, motivos: ['TASA_BAJA'] }],
  };

  it('avisa al personal LIS (auxiliares y administradores) por cada persona en alerta, solo por bandeja', async () => {
    const { s, notificaciones } = servicio({ alertas: jest.fn(async () => alertas) });
    expect(await s.avisarAlertas()).toBe(2);
    expect(notificaciones.aPersonalLis).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'ALERTA_INCUMPLIMIENTO',
        entidad: 'USUARIO',
        entidadId: 8,
        clave: 'ALERTA:ESTUDIANTE:8:2',
        soloBandeja: true,
      }),
    );
    expect(notificaciones.aPersonalLis).toHaveBeenCalledWith(
      expect.objectContaining({ entidadId: 7, clave: 'ALERTA:DONADOR:7:1' }),
    );
    // Nunca se notifica a la persona en alerta: es informacion interna del LIS.
    expect(notificaciones.aUsuarios).not.toHaveBeenCalled();
  });

  it('la clave cambia con cada fallo nuevo (vuelve a avisar) y no con el resto de datos', async () => {
    const { s, notificaciones } = servicio({
      alertas: jest.fn(async () => ({ ...alertas, donadores: [], estudiantes: [{ ...alertas.estudiantes[0], incumplimientos: 3, reputacion: 0.2 }] })),
    });
    await s.avisarAlertas();
    expect(notificaciones.aPersonalLis).toHaveBeenCalledWith(expect.objectContaining({ clave: 'ALERTA:ESTUDIANTE:8:3' }));
  });

  it('si ya se habia avisado (clave repetida) no cuenta como alerta nueva', async () => {
    const { s, notificaciones } = servicio({ alertas: jest.fn(async () => alertas) });
    notificaciones.aPersonalLis.mockResolvedValue(0);
    expect(await s.avisarAlertas()).toBe(0);
  });

  it('un fallo de la analítica no tumba la revisión de plazos', async () => {
    const { s } = servicio({ alertas: jest.fn(async () => { throw new Error('BD caida'); }) });
    await expect(s.avisarAlertas()).resolves.toBe(0);
  });
});
