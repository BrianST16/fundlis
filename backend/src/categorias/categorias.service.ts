import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from '../entities';

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria) private readonly repo: Repository<Categoria>,
  ) {}

  listar(incluirInactivas = false) {
    return this.repo.find({
      where: incluirInactivas ? {} : { activa: true },
      order: { nombre: 'ASC' },
    });
  }

  async obtenerActiva(id: number): Promise<Categoria> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('La categoria no existe.');
    if (!c.activa) throw new BadRequestException('La categoria esta inactiva.');
    return c;
  }

  /**
   * Reglas de la medida de compatibilidad (D-41):
   *  - si la categoria define medida, la OFERTA debe declararla dentro de [min, max];
   *  - si no la define, la oferta no puede traer medida.
   */
  validarMedidaOferta(c: Categoria, medida: number | null | undefined): number | null {
    if (c.medidaNombre === null || c.medidaNombre === undefined) {
      if (medida !== null && medida !== undefined) {
        throw new BadRequestException(`La categoria "${c.nombre}" no usa medida.`);
      }
      return null;
    }
    if (medida === null || medida === undefined) {
      throw new BadRequestException(`Indica ${c.medidaNombre} (${c.medidaUnidad ?? ''}) del producto.`);
    }
    if (medida < Number(c.medidaMin) || medida > Number(c.medidaMax)) {
      throw new BadRequestException(`${c.medidaNombre} debe estar entre ${c.medidaMin} y ${c.medidaMax}.`);
    }
    return medida;
  }

  /** La PETICION puede restringir la medida con un rango opcional (null = cualquiera). */
  validarRangoPeticion(c: Categoria, min?: number | null, max?: number | null): { min: number | null; max: number | null } {
    const a = min ?? null;
    const b = max ?? null;
    if (c.medidaNombre === null || c.medidaNombre === undefined) {
      if (a !== null || b !== null) throw new BadRequestException(`La categoria "${c.nombre}" no usa medida.`);
      return { min: null, max: null };
    }
    for (const v of [a, b]) {
      if (v !== null && (v < Number(c.medidaMin) || v > Number(c.medidaMax))) {
        throw new BadRequestException(`${c.medidaNombre} debe estar entre ${c.medidaMin} y ${c.medidaMax}.`);
      }
    }
    if (a !== null && b !== null && a > b) throw new BadRequestException('El minimo de la medida no puede superar el maximo.');
    return { min: a, max: b };
  }

  async crear(datos: { nombre: string; descripcion?: string }) {
    const repetida = await this.repo.findOne({ where: { nombre: datos.nombre } });
    if (repetida) throw new BadRequestException('Ya existe una categoria con ese nombre.');
    return this.repo.save(
      this.repo.create({
        nombre: datos.nombre,
        descripcion: datos.descripcion ?? null,
        activa: true,
      }),
    );
  }

  /** El administrador define o quita la medida de compatibilidad de una categoria. */
  async configurarMedida(
    id: number,
    datos: { medidaNombre: string | null; medidaUnidad?: string | null; medidaMin?: number | null; medidaMax?: number | null },
  ) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('La categoria no existe.');
    if (!datos.medidaNombre) {
      c.medidaNombre = null;
      c.medidaUnidad = null;
      c.medidaMin = null;
      c.medidaMax = null;
    } else {
      if (datos.medidaMin === null || datos.medidaMin === undefined || datos.medidaMax === null || datos.medidaMax === undefined || datos.medidaMin >= datos.medidaMax) {
        throw new BadRequestException('La medida necesita un minimo menor que el maximo.');
      }
      c.medidaNombre = datos.medidaNombre;
      c.medidaUnidad = datos.medidaUnidad ?? null;
      c.medidaMin = datos.medidaMin;
      c.medidaMax = datos.medidaMax;
    }
    return this.repo.save(c);
  }

  async actualizar(id: number, datos: { nombre?: string; descripcion?: string; activa?: boolean }) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('La categoria no existe.');
    if (datos.nombre && datos.nombre !== c.nombre) {
      const repetida = await this.repo.findOne({ where: { nombre: datos.nombre } });
      if (repetida) throw new BadRequestException('Ya existe una categoria con ese nombre.');
      c.nombre = datos.nombre;
    }
    if (datos.descripcion !== undefined) c.descripcion = datos.descripcion;
    if (datos.activa !== undefined) c.activa = datos.activa;
    return this.repo.save(c);
  }
}
