import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EntidadHistorial } from './enums';
import { HistorialEstado } from '../entities';

/** Registro de toda transicion de estado, para trazabilidad y auditoria. */
@Injectable()
export class HistorialService {
  constructor(
    @InjectRepository(HistorialEstado) private readonly repo: Repository<HistorialEstado>,
  ) {}

  async registrar(
    datos: {
      entidad: EntidadHistorial;
      entidadId: number;
      estadoAnterior: string | null;
      estadoNuevo: string;
      actorId: number | null;
      motivo?: string | null;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(HistorialEstado) : this.repo;
    await repo.save(
      repo.create({
        entidad: datos.entidad,
        entidadId: datos.entidadId,
        estadoAnterior: datos.estadoAnterior,
        estadoNuevo: datos.estadoNuevo,
        actorId: datos.actorId,
        motivo: datos.motivo ?? null,
      }),
    );
  }

  async de(entidad: EntidadHistorial, entidadId: number): Promise<HistorialEstado[]> {
    return this.repo.find({
      where: { entidad, entidadId },
      order: { ocurridoEn: 'ASC', id: 'ASC' },
    });
  }
}
