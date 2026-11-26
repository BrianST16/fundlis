import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UsuarioActual } from '../auth/auth.types';
import { ASIGNACION_VIGENTE, EstadoOferta, EstadoPeticion } from '../common/enums';
import { ParametrosService } from '../common/parametros.service';
import {
  Caracterizacion,
  DestinoLocal,
  GrupoSisben,
  LoteFisico,
  Oferta,
  OfertaXPeticion,
  Peticion,
} from '../entities';
import { saldoDeOferta } from '../ofertas/saldo';
import {
  AtributosOferta,
  cajaParaOferta,
  cajaParaPeticion,
  esCompatible,
  ESTADOS_CONSERVACION,
  puntoOferta,
  puntoPeticion,
} from './compatibilidad';
import { KdTreeAdaptativo, PuntoKd, rangoLineal } from './kdtree';
import { calcularPrioridad, compararPrioridad, describirCoeficientes, Prioridad } from './prioridad';

export const DIMENSIONES_PETICION = ['estadoMinimo', 'medidaMin', 'medidaMax'] as const;
export const DIMENSIONES_OFERTA = ['estadoConservacion', 'medida'] as const;

/** Fila fija al final de la lista de posibles recibidores (D-19, D-43). */
export const FILA_LOCAL = {
  tipo: 'LOCAL' as const,
  nombre: 'Local - Laboratorio Integrado de Sistemas (destino institucional)',
  reglas: [
    'Siempre es la última opción, después de las peticiones compatibles.',
    'El auxiliar puede iniciar CUSTODIA TEMPORAL del LIS.',
    'La ACEPTACION como donativo institucional requiere autorizacion del administrador.',
    'No es un usuario ni una petición: no se crea ninguna petición ficticia.',
  ],
};

interface Diagnostico {
  totalEnCategoria: number;
  compatibles: number;
  incompatibles: number;
  nodosVisitados: number;
  alturaArbol: number;
  coincideConFiltroLineal: boolean;
  msConstruccion: number;
  msConsulta: number;
}

const ms = (t0: bigint) => Number(Number(process.hrtime.bigint() - t0) / 1e6).valueOf();

@Injectable()
export class EmparejamientoService {
  constructor(
    @InjectRepository(Oferta) private readonly ofertas: Repository<Oferta>,
    @InjectRepository(Peticion) private readonly peticiones: Repository<Peticion>,
    @InjectRepository(OfertaXPeticion) private readonly asignaciones: Repository<OfertaXPeticion>,
    @InjectRepository(Caracterizacion) private readonly caracterizaciones: Repository<Caracterizacion>,
    @InjectRepository(GrupoSisben) private readonly sisben: Repository<GrupoSisben>,
    @InjectRepository(DestinoLocal) private readonly destinos: Repository<DestinoLocal>,
    @InjectRepository(LoteFisico) private readonly lotes: Repository<LoteFisico>,
    private readonly parametros: ParametrosService,
  ) {}

  // ------------------------------------------------------------------
  // Fase A: compatibilidad (KD-tree). Fase B: prioridad.
  // ------------------------------------------------------------------

  /** Posibles recibidores de una OFERTA aprobada con unidades disponibles. */
  async candidatosParaOferta(ofertaId: number, actual: UsuarioActual, limite = 20) {
    const oferta = await this.ofertas.findOne({ where: { id: ofertaId }, relations: { categoria: true } });
    if (!oferta) throw new NotFoundException('La oferta no existe.');
    if (oferta.estado !== EstadoOferta.APROBADA) {
      throw new BadRequestException(`Solo se emparejan ofertas aprobadas. Esta está en ${oferta.estado}.`);
    }
    const saldo = await saldoDeOferta(oferta, { intentos: this.asignaciones, destinos: this.destinos, lotes: this.lotes });
    if (saldo.disponible <= 0) {
      throw new BadRequestException('La oferta no tiene unidades disponibles por asignar.');
    }
    const r = await this.candidatos(oferta, oferta, actual, limite);
    return { origen: 'OFERTA' as const, cantidadDisponible: saldo.disponible, ...r };
  }

  /** Posibles recibidores de un LOTE que ya esta en el LIS (reasignacion). */
  async candidatosParaLote(loteId: number, actual: UsuarioActual, limite = 20) {
    const lote = await this.lotes.findOne({ where: { id: loteId }, relations: { oferta: { categoria: true } } });
    if (!lote) throw new NotFoundException('El lote no existe.');
    if (lote.ubicacion !== 'EN_LIS') throw new BadRequestException('El lote ya no está en el LIS.');
    const r = await this.candidatos(lote.oferta, lote.oferta, actual, limite);
    return { origen: 'LOTE' as const, loteId: lote.id, cantidadDisponible: lote.cantidad, ...r };
  }

  private async candidatos(oferta: Oferta, atributos: AtributosOferta, actual: UsuarioActual, limite: number) {
    // 1. Igualdad de categoria (nunca distancia) + peticiones elegibles.
    const enCategoria = await this.peticiones.find({
      // D-64 (C2): un estudiante bloqueado no recibe asignaciones nuevas.
      where: { estado: EstadoPeticion.APROBADA, categoriaId: oferta.categoriaId, estudiante: { activo: true } },
      relations: { estudiante: true },
    });
    const vigentes = enCategoria.length
      ? await this.asignaciones.find({
          where: { peticionId: In(enCategoria.map((p) => p.id)), estado: In(ASIGNACION_VIGENTE) },
        })
      : [];
    const ocupadas = new Set(vigentes.map((v) => v.peticionId));
    const libres = enCategoria.filter((p) => !ocupadas.has(p.id));

    // 2. KD-tree 3D sobre (estadoMinimo, medidaMin, medidaMax) de las peticiones.
    const puntos: PuntoKd<Peticion>[] = libres.map((p) => ({ id: p.id, coordenadas: puntoPeticion(p), dato: p }));
    const caja = cajaParaOferta(atributos);
    const t0 = process.hrtime.bigint();
    const arbol = new KdTreeAdaptativo(puntos, DIMENSIONES_PETICION.length);
    const msConstruccion = ms(t0);
    const t1 = process.hrtime.bigint();
    const compatibles = arbol.buscarRango(caja.min, caja.max);
    const msConsulta = ms(t1);
    const referencia = rangoLineal(puntos, caja.min, caja.max);
    const coincide =
      referencia.length === compatibles.length && referencia.every((x, i) => x.id === compatibles[i].id);

    // 3. Prioridad SOLO sobre los compatibles.
    const ordenados = await this.ordenarPorPrioridad(compatibles.map((c) => c.dato), actual);
    const coeficientes = await this.parametros.coeficientesPrioridad();

    const diagnostico: Diagnostico = {
      totalEnCategoria: libres.length,
      compatibles: compatibles.length,
      incompatibles: libres.length - compatibles.length,
      nodosVisitados: arbol.nodosVisitados,
      alturaArbol: arbol.altura,
      coincideConFiltroLineal: coincide,
      msConstruccion: Number(msConstruccion.toFixed(3)),
      msConsulta: Number(msConsulta.toFixed(3)),
    };

    return {
      oferta: {
        id: oferta.id,
        nombreProducto: oferta.nombreProducto,
        // Para reconocer el producto al emparejar (solo personal LIS consulta esto).
        descripcion: oferta.descripcion ?? null,
        fotoId: oferta.fotoId ?? null,
        categoriaId: oferta.categoriaId,
        categoria: oferta.categoria?.nombre ?? null,
        estadoConservacion: Number(atributos.estadoConservacion),
        estadoConservacionTexto: ESTADOS_CONSERVACION[Number(atributos.estadoConservacion)] ?? null,
        medida: atributos.medida === null ? null : Number(atributos.medida),
        medidaNombre: oferta.categoria?.medidaNombre ?? null,
      },
      busqueda: {
        dimensiones: DIMENSIONES_PETICION,
        cajaMin: caja.min,
        cajaMax: caja.max,
      },
      coeficientes,
      escalaPrioridad: 'Número real en [0, 1]; 1 = mayor necesidad. No es un porcentaje.',
      candidatos: ordenados.slice(0, limite),
      /** LOCAL siempre al final de la lista (D-19). */
      destinoLocal: FILA_LOCAL,
      coeficientesTexto: describirCoeficientes(coeficientes),
      diagnostico,
    };
  }

  /** Calcula los componentes de prioridad y ordena (orden total reproducible). */
  async ordenarPorPrioridad(peticiones: Peticion[], actual: UsuarioActual, ahora = new Date()) {
    if (!peticiones.length) return [];
    const ids = [...new Set(peticiones.map((p) => p.estudianteId))];
    const [caracterizaciones, grupos, coef] = await Promise.all([
      this.caracterizaciones.find({ where: { usuarioId: In(ids) } }),
      this.sisben.find(),
      this.parametros.coeficientesPrioridad(),
    ]);
    const porUsuario = new Map(caracterizaciones.map((c) => [c.usuarioId, c]));
    const puntajeGrupo = new Map(grupos.map((g) => [g.codigo, Number(g.puntajeNecesidad)]));

    const filas = peticiones.map((p) => {
      const c = porUsuario.get(p.estudianteId);
      const prioridad: Prioridad = calcularPrioridad(
        {
          puntajeSisben: c ? puntajeGrupo.get(c.grupoSisben) ?? 0 : 0,
          puntajeCaracterizacion: c ? Number(c.puntajeTotal) : 0,
          creadaEn: p.creadaEn,
        },
        coef,
        ahora,
      );
      return {
        peticionId: p.id,
        estudianteId: p.estudianteId,
        estudianteNombre: p.estudiante?.nombre ?? `Usuario ${p.estudianteId}`,
        descripcionPeticion: p.descripcion,
        creadaEn: p.creadaEn,
        atributos: {
          estadoMinimo: Number(p.estadoMinimo),
          medidaMin: p.medidaMin === null ? null : Number(p.medidaMin),
          medidaMax: p.medidaMax === null ? null : Number(p.medidaMax),
        },
        sinCaracterizacion: !c,
        // D-39: el grupo Sisben es dato sensible, solo para el administrador.
        grupoSisben: actual?.esAdministrador && c ? c.grupoSisben : undefined,
        prioridad,
      };
    });
    filas.sort(compararPrioridad);
    return filas.map((f, i) => ({ posicion: i + 1, ...f }));
  }

  /**
   * Componentes de prioridad de una peticion concreta, para guardarlos con
   * la asignacion (D-38: explicar despues por que quedo en esa posicion).
   */
  async prioridadDe(peticionId: number, ahora = new Date()) {
    const p = await this.peticiones.findOne({ where: { id: peticionId } });
    if (!p) throw new NotFoundException('La petición no existe.');
    const [fila] = await this.ordenarPorPrioridad([p], { esAdministrador: false } as UsuarioActual, ahora);
    const coef = await this.parametros.coeficientesPrioridad();
    return { prioridad: fila.prioridad, coeficientes: describirCoeficientes(coef) };
  }

  // ------------------------------------------------------------------
  // Sentido inverso: ofertas compatibles con una peticion (2D).
  // ------------------------------------------------------------------
  async ofertasParaPeticion(peticionId: number) {
    const p = await this.peticiones.findOne({ where: { id: peticionId }, relations: { categoria: true } });
    if (!p) throw new NotFoundException('La petición no existe.');
    const enCategoria = await this.ofertas.find({
      where: { estado: EstadoOferta.APROBADA, categoriaId: p.categoriaId },
    });
    const conSaldo: Oferta[] = [];
    const disponible = new Map<number, number>();
    for (const o of enCategoria) {
      const s = await saldoDeOferta(o, { intentos: this.asignaciones, destinos: this.destinos, lotes: this.lotes });
      if (s.disponible > 0) {
        conSaldo.push(o);
        disponible.set(o.id, s.disponible);
      }
    }
    const puntos: PuntoKd<Oferta>[] = conSaldo.map((o) => ({ id: o.id, coordenadas: puntoOferta(o), dato: o }));
    const arbol = new KdTreeAdaptativo(puntos, DIMENSIONES_OFERTA.length);
    const caja = cajaParaPeticion(p);
    const compatibles = arbol.buscarRango(caja.min, caja.max);
    const referencia = rangoLineal(puntos, caja.min, caja.max);
    return {
      peticion: { id: p.id, categoria: p.categoria?.nombre, estadoMinimo: p.estadoMinimo, medidaMin: p.medidaMin, medidaMax: p.medidaMax },
      busqueda: { dimensiones: DIMENSIONES_OFERTA, cajaMin: caja.min, cajaMax: caja.max },
      ofertas: compatibles.map(({ dato: o }) => ({
        id: o.id,
        nombreProducto: o.nombreProducto,
        estadoConservacion: o.estadoConservacion,
        medida: o.medida,
        cantidadDisponible: disponible.get(o.id),
      })),
      diagnostico: {
        totalEnCategoria: conSaldo.length,
        compatibles: compatibles.length,
        nodosVisitados: arbol.nodosVisitados,
        coincideConFiltroLineal:
          referencia.length === compatibles.length && referencia.every((x, i) => x.id === compatibles[i].id),
      },
    };
  }

  /** Validacion al confirmar: la peticion debe ser compatible con la oferta. */
  verificarCompatibilidad(oferta: AtributosOferta, peticion: Peticion) {
    if (!esCompatible(oferta, peticion)) {
      throw new BadRequestException(
        'La petición no es compatible con el producto (estado de conservación o medida). Revisa la búsqueda de compatibilidad.',
      );
    }
  }
}
