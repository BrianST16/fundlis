import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CategoriasService } from '../categorias/categorias.service';
import {
  ASIGNACION_VIGENTE,
  EntidadHistorial,
  EstadoPeticion,
  PETICION_CUENTA_LIMITE,
} from '../common/enums';
import { HistorialService } from '../common/historial.service';
import { ParametrosService } from '../common/parametros.service';
import { Caracterizacion, OfertaXPeticion, Peticion, Usuario } from '../entities';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class PeticionesService {
  constructor(
    @InjectRepository(Peticion) private readonly peticiones: Repository<Peticion>,
    @InjectRepository(OfertaXPeticion) private readonly asignaciones: Repository<OfertaXPeticion>,
    @InjectRepository(Caracterizacion) private readonly caracterizaciones: Repository<Caracterizacion>,
    private readonly categorias: CategoriasService,
    private readonly parametros: ParametrosService,
    private readonly historial: HistorialService,
    private readonly dataSource: DataSource,
    private readonly notificaciones?: NotificacionesService,
  ) {}

  /** Vista anonima: nunca revela al estudiante. */
  private aCatalogo(p: Peticion) {
    return {
      id: p.id,
      descripcion: p.descripcion,
      categoria: p.categoria
        ? { id: p.categoria.id, nombre: p.categoria.nombre }
        : { id: p.categoriaId, nombre: null },
      publicadaEn: p.creadaEn,
      // Requisitos de compatibilidad del producto (no identifican a nadie).
      estadoMinimo: p.estadoMinimo,
      medidaMin: p.medidaMin,
      medidaMax: p.medidaMax,
    };
  }

  private async aDetalle(p: Peticion, incluirEstudiante: boolean) {
    const vigente = await this.asignaciones.findOne({
      where: { peticionId: p.id, estado: In(ASIGNACION_VIGENTE) },
    });
    return {
      ...this.aCatalogo(p),
      estado: p.estado,
      motivoRechazo: p.motivoRechazo,
      motivoCierre: p.motivoCierre,
      revisadaEn: p.revisadaEn,
      cerradaEn: p.cerradaEn,
      asignacionVigente: vigente
        ? {
            id: vigente.id,
            ofertaId: vigente.ofertaId,
            cantidadAsignada: vigente.cantidadAsignada,
            estado: vigente.estado,
          }
        : null,
      estudiante: incluirEstudiante && p.estudiante
        ? { id: p.estudiante.id, nombre: p.estudiante.nombre, email: p.estudiante.email }
        : undefined,
    };
  }

  /**
   * Catalogo publico de necesidades, anonimo. Directriz §3: la peticion se
   * OCULTA mientras esta asignada o en proceso, es decir, mientras tiene un
   * intento vigente (ASIGNADO o EN_CUSTODIA). Si ese intento se cancela
   * antes de la recepcion, la peticion reaparece con su fecha original.
   */
  async catalogo(categoriaId?: number) {
    const lista = await this.peticiones.find({
      // D-64 (C2): las peticiones de cuentas bloqueadas quedan en pausa.
      where: categoriaId
        ? { estado: EstadoPeticion.APROBADA, categoriaId, estudiante: { activo: true } }
        : { estado: EstadoPeticion.APROBADA, estudiante: { activo: true } },
      relations: { categoria: true },
      order: { creadaEn: 'ASC' },
    });
    if (!lista.length) return [];

    const vigentes = await this.asignaciones.find({
      where: { peticionId: In(lista.map((p) => p.id)), estado: In(ASIGNACION_VIGENTE) },
    });
    const enProceso = new Set(vigentes.map((a) => a.peticionId));
    return lista.filter((p) => !enProceso.has(p.id)).map((p) => this.aCatalogo(p));
  }

  async mias(estudianteId: number) {
    const lista = await this.peticiones.find({
      where: { estudianteId },
      relations: { categoria: true },
      order: { creadaEn: 'DESC' },
    });
    return Promise.all(lista.map((p) => this.aDetalle(p, false)));
  }

  async colaAprobacion() {
    const lista = await this.peticiones.find({
      where: { estado: EstadoPeticion.PENDIENTE_APROBACION, estudiante: { activo: true } },
      relations: { categoria: true, estudiante: true },
      order: { creadaEn: 'ASC' },
    });
    return Promise.all(lista.map((p) => this.aDetalle(p, true)));
  }

  async detalle(id: number, solicitanteId: number, esPersonalLis: boolean) {
    const p = await this.peticiones.findOne({
      where: { id },
      relations: { categoria: true, estudiante: true },
    });
    if (!p) throw new NotFoundException('La petición no existe.');

    const esDueno = p.estudianteId === solicitanteId;
    if (!esPersonalLis && !esDueno) {
      if (p.estado !== EstadoPeticion.APROBADA) {
        throw new ForbiddenException('No puedes ver esta petición.');
      }
      return this.aCatalogo(p);
    }
    return this.aDetalle(p, esPersonalLis);
  }

  /** Cuantas peticiones cuentan hoy para el limite del estudiante. */
  async conteoVigente(estudianteId: number): Promise<{ usadas: number; maximo: number }> {
    const maximo = await this.parametros.maxPeticionesActivas();
    const usadas = await this.peticiones.count({
      where: { estudianteId, estado: In(PETICION_CUENTA_LIMITE) },
    });
    return { usadas, maximo };
  }

  async crear(
    estudianteId: number,
    datos: {
      categoriaId: number;
      descripcion: string;
      estadoMinimo?: number;
      medidaMin?: number | null;
      medidaMax?: number | null;
    },
  ) {
    const categoria = await this.categorias.obtenerActiva(datos.categoriaId);
    // Requisitos de compatibilidad (D-41). Sin cantidad solicitada (D-10).
    const rango = categoria
      ? this.categorias.validarRangoPeticion(categoria, datos.medidaMin, datos.medidaMax)
      : { min: null, max: null };
    const estadoMinimo = datos.estadoMinimo ?? 1;

    // Sin caracterizacion no hay forma de calcular prioridad.
    const caracterizacion = await this.caracterizaciones.findOne({
      where: { usuarioId: estudianteId },
    });
    if (!caracterizacion) {
      throw new BadRequestException(
        'Antes de crear una petición debes completar tu caracterización y tu grupo Sisbén.',
      );
    }

    const maximo = await this.parametros.maxPeticionesActivas();

    // Conteo e insercion en la MISMA transaccion, con bloqueo de la fila del
    // estudiante. Asi dos solicitudes simultaneas del mismo estudiante se
    // serializan y no pueden superar el limite (hallazgo R4-e).
    const id = await this.dataSource.transaction(async (mgr) => {
      await mgr
        .createQueryBuilder(Usuario, 'u')
        .setLock('pessimistic_write')
        .where('u.id = :id', { id: estudianteId })
        .getOne();

      const repo = mgr.getRepository(Peticion);
      const usadas = await repo.count({
        where: { estudianteId, estado: In(PETICION_CUENTA_LIMITE) },
      });
      if (usadas >= maximo) {
        throw new BadRequestException(
          `Ya tienes ${usadas} peticiones abiertas y el máximo es ${maximo}. Cierra o cancela una antes de crear otra.`,
        );
      }

      const p = await repo.save(
        repo.create({
          estudianteId,
          categoriaId: datos.categoriaId,
          descripcion: datos.descripcion,
          estado: EstadoPeticion.PENDIENTE_APROBACION,
          estadoMinimo,
          medidaMin: rango.min,
          medidaMax: rango.max,
        }),
      );

      await this.historial.registrar(
        {
          entidad: EntidadHistorial.PETICION,
          entidadId: p.id,
          estadoAnterior: null,
          estadoNuevo: EstadoPeticion.PENDIENTE_APROBACION,
          actorId: estudianteId,
          motivo: 'Petición creada por el estudiante',
        },
        mgr,
      );
      return p.id;
    });

    return this.detalle(id, estudianteId, false);
  }

  /** Solo se edita mientras nadie la ha revisado. */
  async editar(
    id: number,
    estudianteId: number,
    datos: {
      categoriaId?: number;
      descripcion?: string;
      estadoMinimo?: number;
      medidaMin?: number | null;
      medidaMax?: number | null;
    },
  ) {
    const p = await this.peticiones.findOne({ where: { id } });
    if (!p) throw new NotFoundException('La petición no existe.');
    if (p.estudianteId !== estudianteId) {
      throw new ForbiddenException('Solo puedes editar tus propias peticiones.');
    }
    if (p.estado !== EstadoPeticion.PENDIENTE_APROBACION) {
      throw new BadRequestException(
        'Solo se puede editar una petición que aun esta pendiente de aprobación.',
      );
    }

    if (datos.categoriaId && datos.categoriaId !== p.categoriaId) {
      await this.categorias.obtenerActiva(datos.categoriaId);
      p.categoriaId = datos.categoriaId;
    }
    if (datos.descripcion !== undefined) p.descripcion = datos.descripcion;
    if (datos.estadoMinimo !== undefined) p.estadoMinimo = datos.estadoMinimo;
    if (datos.medidaMin !== undefined || datos.medidaMax !== undefined || datos.categoriaId) {
      const categoria = await this.categorias.obtenerActiva(p.categoriaId);
      const rango = this.categorias.validarRangoPeticion(
        categoria,
        datos.medidaMin !== undefined ? datos.medidaMin : p.medidaMin,
        datos.medidaMax !== undefined ? datos.medidaMax : p.medidaMax,
      );
      p.medidaMin = rango.min;
      p.medidaMax = rango.max;
    }
    p.actualizadaEn = new Date();
    await this.peticiones.save(p);

    return this.detalle(id, estudianteId, false);
  }

  /** El estudiante puede cancelar antes y despues de la aprobacion,
   *  siempre que no tenga una asignacion vigente. */
  async cancelar(id: number, estudianteId: number, motivo: string) {
    const p = await this.peticiones.findOne({ where: { id } });
    if (!p) throw new NotFoundException('La petición no existe.');
    if (p.estudianteId !== estudianteId) {
      throw new ForbiddenException('Solo puedes cancelar tus propias peticiones.');
    }
    if (![EstadoPeticion.PENDIENTE_APROBACION, EstadoPeticion.APROBADA].includes(p.estado)) {
      throw new BadRequestException(`Una petición en estado ${p.estado} no se puede cancelar.`);
    }

    const vigente = await this.asignaciones.findOne({
      where: { peticionId: id, estado: In(ASIGNACION_VIGENTE) },
    });
    if (vigente) {
      throw new BadRequestException(
        'Tu petición ya tiene una asignación en curso. El personal del LIS debe resolverla antes de cancelar.',
      );
    }

    const anterior = p.estado;
    p.estado = EstadoPeticion.CANCELADA;
    p.cerradaEn = new Date();
    p.motivoCierre = motivo;
    await this.peticiones.save(p);

    await this.historial.registrar({
      entidad: EntidadHistorial.PETICION,
      entidadId: id,
      estadoAnterior: anterior,
      estadoNuevo: EstadoPeticion.CANCELADA,
      actorId: estudianteId,
      motivo,
    });

    return this.detalle(id, estudianteId, false);
  }

  async aprobar(id: number, revisorId: number) {
    const p = await this.peticiones.findOne({ where: { id } });
    if (!p) throw new NotFoundException('La petición no existe.');
    if (p.estado !== EstadoPeticion.PENDIENTE_APROBACION) {
      throw new BadRequestException(
        `Solo se aprueban peticiones pendientes. Esta está en ${p.estado}.`,
      );
    }
    if (p.estudianteId === revisorId) {
      throw new BadRequestException('No puedes aprobar tu propia petición.');
    }

    p.estado = EstadoPeticion.APROBADA;
    p.revisadaPor = revisorId;
    p.revisadaEn = new Date();
    p.motivoRechazo = null;
    await this.peticiones.save(p);

    await this.historial.registrar({
      entidad: EntidadHistorial.PETICION,
      entidadId: id,
      estadoAnterior: EstadoPeticion.PENDIENTE_APROBACION,
      estadoNuevo: EstadoPeticion.APROBADA,
      actorId: revisorId,
      motivo: 'Aprobada por el personal del LIS',
    });
    await this.notificaciones?.aUsuarios([p.estudianteId], {
      tipo: 'PETICION_APROBADA',
      titulo: 'Tu petición fue aprobada',
      mensaje: `Tu petición "${p.descripcion.slice(0, 60)}" fue aprobada y entra al emparejamiento.`,
      entidad: 'PETICION',
      entidadId: id,
      clave: `PETICION:${id}:APROBADA`,
    });

    return this.detalle(id, revisorId, true);
  }

  async rechazar(id: number, revisorId: number, motivo: string) {
    const p = await this.peticiones.findOne({ where: { id } });
    if (!p) throw new NotFoundException('La petición no existe.');
    if (p.estado !== EstadoPeticion.PENDIENTE_APROBACION) {
      throw new BadRequestException(
        `Solo se rechazan peticiones pendientes. Esta está en ${p.estado}.`,
      );
    }

    p.estado = EstadoPeticion.RECHAZADA;
    p.revisadaPor = revisorId;
    p.revisadaEn = new Date();
    p.motivoRechazo = motivo;
    p.cerradaEn = new Date();
    await this.peticiones.save(p);

    await this.historial.registrar({
      entidad: EntidadHistorial.PETICION,
      entidadId: id,
      estadoAnterior: EstadoPeticion.PENDIENTE_APROBACION,
      estadoNuevo: EstadoPeticion.RECHAZADA,
      actorId: revisorId,
      motivo,
    });
    await this.notificaciones?.aUsuarios([p.estudianteId], {
      tipo: 'PETICION_RECHAZADA',
      titulo: 'Tu petición no fue aprobada',
      mensaje: `Tu petición "${p.descripcion.slice(0, 60)}" no fue aprobada. Motivo: ${motivo}`,
      entidad: 'PETICION',
      entidadId: id,
      clave: `PETICION:${id}:RECHAZADA`,
    });

    return this.detalle(id, revisorId, true);
  }

  historialDe(id: number) {
    return this.historial.de(EntidadHistorial.PETICION, id);
  }
}
