import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Caracterizacion,
  GrupoSisben,
  OpcionCaracterizacion,
  PreguntaCaracterizacion,
  RespuestaCaracterizacion,
} from '../entities';

export interface RespuestaEntrada {
  preguntaId: number;
  opcionId: number;
}

@Injectable()
export class CaracterizacionService {
  constructor(
    @InjectRepository(PreguntaCaracterizacion) private readonly preguntas: Repository<PreguntaCaracterizacion>,
    @InjectRepository(OpcionCaracterizacion) private readonly opciones: Repository<OpcionCaracterizacion>,
    @InjectRepository(Caracterizacion) private readonly caracterizaciones: Repository<Caracterizacion>,
    @InjectRepository(GrupoSisben) private readonly sisben: Repository<GrupoSisben>,
    private readonly dataSource: DataSource,
  ) {}

  /** Formulario que ve el estudiante: preguntas activas y grupos Sisben. */
  async formulario() {
    const preguntas = await this.preguntas.find({
      where: { activa: true },
      relations: { opciones: true },
      order: { orden: 'ASC' },
    });
    const grupos = await this.sisben.find({ order: { letra: 'ASC', subgrupo: 'ASC' } });
    return {
      preguntas: preguntas.map((p) => ({
        id: p.id,
        texto: p.texto,
        orden: p.orden,
        opciones: (p.opciones ?? [])
          .sort((a, b) => a.orden - b.orden)
          .map((o) => ({ id: o.id, texto: o.texto })),
      })),
      gruposSisben: grupos.map((g) => ({
        codigo: g.codigo,
        descripcion: g.descripcion,
      })),
    };
  }

  async miCaracterizacion(usuarioId: number) {
    const c = await this.caracterizaciones.findOne({
      where: { usuarioId },
      relations: { respuestas: true },
    });
    if (!c) return null;
    return {
      id: c.id,
      grupoSisben: c.grupoSisben,
      puntajeTotal: c.puntajeTotal,
      completadaEn: c.completadaEn,
      actualizadaEn: c.actualizadaEn,
      respuestas: (c.respuestas ?? []).map((r) => ({
        preguntaId: r.preguntaId,
        opcionId: r.opcionId,
      })),
    };
  }

  /**
   * Guarda o actualiza la caracterizacion del estudiante.
   * El puntaje es el promedio ponderado de los puntajes de las opciones
   * elegidas, en [0,1]: 1 = mayor necesidad declarada.
   */
  async guardar(
    usuarioId: number,
    datos: { grupoSisben: string; respuestas: RespuestaEntrada[] },
  ) {
    const grupo = await this.sisben.findOne({ where: { codigo: datos.grupoSisben } });
    if (!grupo) throw new BadRequestException('El grupo Sisbén indicado no existe.');

    const preguntasActivas = await this.preguntas.find({
      where: { activa: true },
      order: { orden: 'ASC' },
    });
    if (!preguntasActivas.length) {
      throw new BadRequestException('No hay preguntas de caracterización configuradas.');
    }

    const idsEsperados = new Set(preguntasActivas.map((p) => p.id));
    const idsRecibidos = new Set(datos.respuestas.map((r) => r.preguntaId));
    if (idsRecibidos.size !== datos.respuestas.length) {
      throw new BadRequestException('Hay preguntas respondidas más de una vez.');
    }
    for (const id of idsEsperados) {
      if (!idsRecibidos.has(id)) {
        throw new BadRequestException('Debes responder todas las preguntas.');
      }
    }
    for (const id of idsRecibidos) {
      if (!idsEsperados.has(id)) {
        throw new BadRequestException('Se envio una pregunta que no está activa.');
      }
    }

    // Las opciones deben pertenecer a su pregunta.
    const opciones = await this.opciones.find();
    const porId = new Map(opciones.map((o) => [o.id, o]));
    let acumulado = 0;
    let pesos = 0;
    for (const r of datos.respuestas) {
      const opcion = porId.get(r.opcionId);
      if (!opcion || opcion.preguntaId !== r.preguntaId) {
        throw new BadRequestException(
          `La opción ${r.opcionId} no corresponde a la pregunta ${r.preguntaId}.`,
        );
      }
      const pregunta = preguntasActivas.find((p) => p.id === r.preguntaId);
      acumulado += Number(opcion.puntaje) * Number(pregunta.peso);
      pesos += Number(pregunta.peso);
    }
    const puntajeTotal = pesos > 0 ? Number((acumulado / pesos).toFixed(5)) : 0;

    return this.dataSource.transaction(async (mgr) => {
      const repoC = mgr.getRepository(Caracterizacion);
      const repoR = mgr.getRepository(RespuestaCaracterizacion);

      let c = await repoC.findOne({ where: { usuarioId } });
      if (c) {
        c.grupoSisben = datos.grupoSisben;
        c.puntajeTotal = puntajeTotal;
        c.actualizadaEn = new Date();
        c = await repoC.save(c);
        await repoR.delete({ caracterizacionId: c.id });
      } else {
        c = await repoC.save(
          repoC.create({
            usuarioId,
            grupoSisben: datos.grupoSisben,
            puntajeTotal,
          }),
        );
      }

      await repoR.save(
        datos.respuestas.map((r) =>
          repoR.create({
            caracterizacionId: c.id,
            preguntaId: r.preguntaId,
            opcionId: r.opcionId,
          }),
        ),
      );

      return { id: c.id, puntajeTotal, grupoSisben: c.grupoSisben };
    });
  }

  /** Vista detallada para el ADMINISTRADOR (dato sensible). */
  async detalleSensible(usuarioId: number) {
    const c = await this.caracterizaciones.findOne({
      where: { usuarioId },
      relations: { respuestas: true, sisben: true, usuario: true },
    });
    if (!c) throw new NotFoundException('El estudiante no tiene caracterización registrada.');

    const preguntas = await this.preguntas.find({ relations: { opciones: true } });
    const textoPregunta = new Map(preguntas.map((p) => [p.id, p.texto]));
    const textoOpcion = new Map(
      preguntas.flatMap((p) => (p.opciones ?? []).map((o) => [o.id, o.texto] as [number, string])),
    );

    return {
      usuario: { id: c.usuario.id, nombre: c.usuario.nombre, email: c.usuario.email },
      grupoSisben: c.grupoSisben,
      descripcionSisben: c.sisben?.descripcion,
      puntajeTotal: c.puntajeTotal,
      completadaEn: c.completadaEn,
      actualizadaEn: c.actualizadaEn,
      respuestas: (c.respuestas ?? []).map((r) => ({
        pregunta: textoPregunta.get(r.preguntaId) ?? `Pregunta ${r.preguntaId}`,
        respuesta: textoOpcion.get(r.opcionId) ?? `Opción ${r.opcionId}`,
      })),
    };
  }
}
