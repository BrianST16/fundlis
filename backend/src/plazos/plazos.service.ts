import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UsuarioActual } from '../auth/auth.types';
import { festivosDe } from '../calendario/festivos-colombia';
import { ASIGNACION_VIGENTE } from '../common/enums';
import { ParametrosService } from '../common/parametros.service';
import { CalendarioService } from '../calendario/calendario.service';
import { OfertaXPeticion } from '../entities';
import { calcularPlazo, compararPlazos, EstadoPlazo } from './plazos';

@Injectable()
export class PlazosService {
  constructor(
    @InjectRepository(OfertaXPeticion) private readonly asignaciones: Repository<OfertaXPeticion>,
    private readonly parametros: ParametrosService,
    private readonly calendarioLis: CalendarioService,
  ) {}

  private async vigentesConPlazo(ahora: Date) {
    const [config, cierres, lista] = await Promise.all([
      this.parametros.plazos(),
      this.calendarioLis.cierres(),
      this.asignaciones.find({
        where: { estado: In(ASIGNACION_VIGENTE) },
        relations: { oferta: { donador: true, categoria: true }, peticion: { estudiante: true } },
      }),
    ]);
    return lista
      .map((a) => ({ a, plazo: calcularPlazo(a, ahora, config, cierres) }))
      .filter((x) => x.plazo !== null);
  }

  /**
   * Bandeja del personal del LIS: intentos vigentes con su plazo. Los
   * VENCIDOS son las tareas DEFINIR_ESTADO. Incluye identidades porque el
   * auxiliar debe contactar al responsable (D-06, D-23).
   */
  async bandeja(estado?: EstadoPlazo, ahora = new Date()) {
    const items = await this.vigentesConPlazo(ahora);
    return items
      .filter((x) => !estado || x.plazo.estado === estado)
      .sort((x, y) => compararPlazos(x.plazo, y.plazo))
      .map(({ a, plazo }) => ({
        asignacionId: a.id,
        estadoAsignacion: a.estado,
        cantidadAsignada: a.cantidadAsignada,
        producto: a.oferta?.nombreProducto,
        categoria: a.oferta?.categoria?.nombre,
        donador: { id: a.oferta?.donadorId, nombre: a.oferta?.donador?.nombre, email: a.oferta?.donador?.email },
        estudiante: {
          id: a.peticion?.estudianteId,
          nombre: a.peticion?.estudiante?.nombre,
          email: a.peticion?.estudiante?.email,
        },
        plazo,
      }));
  }

  /** Resumen para el encabezado de la bandeja. */
  async resumen(ahora = new Date()) {
    const items = await this.vigentesConPlazo(ahora);
    const contar = (e: EstadoPlazo) => items.filter((x) => x.plazo.estado === e).length;
    return {
      vencidos: contar('VENCIDO'),
      porVencer: contar('POR_VENCER'),
      enPlazo: contar('EN_PLAZO'),
      tareasDefinirEstado: contar('VENCIDO'),
    };
  }

  /**
   * Plazos propios del donador o del estudiante (alerta en la plataforma).
   * Nunca revela la identidad de la otra parte.
   */
  async mios(actual: UsuarioActual, ahora = new Date()) {
    const items = await this.vigentesConPlazo(ahora);
    return items
      .filter(
        ({ a, plazo }) =>
          (plazo.responsable === 'DONADOR' && a.oferta?.donadorId === actual.sub) ||
          (plazo.responsable === 'ESTUDIANTE' && a.peticion?.estudianteId === actual.sub),
      )
      .sort((x, y) => compararPlazos(x.plazo, y.plazo))
      .map(({ a, plazo }) => ({
        asignacionId: a.id,
        producto: a.oferta?.nombreProducto,
        cantidadAsignada: a.cantidadAsignada,
        responsable: plazo.responsable,
        evento: plazo.evento,
        fechaLimite: plazo.fechaLimite,
        diasHabilesRestantes: plazo.diasHabilesRestantes,
        estado: plazo.estado,
      }));
  }

  /** Calendario aplicado: festivos del anio y cierres configurados del LIS. */
  async calendario(anio: number) {
    return {
      anio,
      zona: 'America/Bogota',
      festivos: festivosDe(anio),
      cierresLis: await this.calendarioLis.cierres(),
      recepcionSuspendida: await this.calendarioLis.recepcionSuspendida(),
      plazos: await this.parametros.plazos(),
    };
  }
}
