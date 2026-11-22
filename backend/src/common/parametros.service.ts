import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parametro } from '../entities';

/** Pesos del puntaje de prioridad. Deben sumar 1. */
export interface PesosPrioridad {
  caracterizacion: number;
  sisben: number;
  antiguedad: number;
}

/**
 * Lectura de los parametros de configuracion guardados en BD, con cache
 * en memoria para no consultar en cada peticion.
 */
@Injectable()
export class ParametrosService {
  private readonly log = new Logger(ParametrosService.name);
  private cache = new Map<string, string>();
  private cargadoEn = 0;
  private readonly vigenciaMs = 60_000;

  constructor(
    @InjectRepository(Parametro) private readonly repo: Repository<Parametro>,
  ) {}

  private async cargar(): Promise<void> {
    if (Date.now() - this.cargadoEn < this.vigenciaMs && this.cache.size) return;
    const filas = await this.repo.find();
    this.cache = new Map(filas.map((f) => [f.clave, f.valor]));
    this.cargadoEn = Date.now();
  }

  async numero(clave: string, porDefecto: number): Promise<number> {
    await this.cargar();
    const bruto = this.cache.get(clave);
    const valor = bruto === undefined ? NaN : Number(bruto);
    if (Number.isNaN(valor)) {
      this.log.warn(`Parametro ${clave} ausente o no numerico; se usa ${porDefecto}.`);
      return porDefecto;
    }
    return valor;
  }

  async maxPeticionesActivas(): Promise<number> {
    return this.numero('MAX_PETICIONES_ACTIVAS', 5);
  }

  async maxBytesEvidencia(): Promise<number> {
    return this.numero('MAX_BYTES_EVIDENCIA', 2 * 1024 * 1024);
  }

  /**
   * Pesos del puntaje de prioridad. Si no suman 1 se normalizan, para que
   * una mala configuracion no altere la escala del puntaje.
   */
  async pesosPrioridad(): Promise<PesosPrioridad> {
    const caracterizacion = await this.numero('PESO_CARACTERIZACION', 0.5);
    const sisben = await this.numero('PESO_SISBEN', 0.3);
    const antiguedad = await this.numero('PESO_ANTIGUEDAD', 0.2);
    const suma = caracterizacion + sisben + antiguedad;
    if (suma <= 0) {
      this.log.error('Los pesos de prioridad suman cero; se usan los valores por defecto.');
      return { caracterizacion: 0.5, sisben: 0.3, antiguedad: 0.2 };
    }
    if (Math.abs(suma - 1) > 1e-9) {
      this.log.warn(`Los pesos de prioridad suman ${suma}; se normalizan a 1.`);
    }
    return {
      caracterizacion: caracterizacion / suma,
      sisben: sisben / suma,
      antiguedad: antiguedad / suma,
    };
  }

  /** Coeficientes (factores numericos) de la prioridad + horizonte de antiguedad (D-38). */
  async coeficientesPrioridad(): Promise<{
    caracterizacion: number;
    sisben: number;
    antiguedad: number;
    horizonteDias: number;
  }> {
    const p = await this.pesosPrioridad();
    return { ...p, horizonteDias: await this.numero('HORIZONTE_ANTIGUEDAD_DIAS', 90) };
  }

  async texto(clave: string, porDefecto: string): Promise<string> {
    await this.cargar();
    return this.cache.get(clave) ?? porDefecto;
  }

  // ---------------------------------------------------------------------
  // Pilar C. Pesos y umbrales del ranking de comportamiento (PROPUESTA,
  // P-11). Si la fila no existe en PARAMETRO se usa el valor por defecto;
  // no hace falta insertar datos para que funcione.
  // ---------------------------------------------------------------------
  async pesosReputacion(): Promise<{ cumplimiento: number; actividad: number }> {
    return {
      cumplimiento: await this.numero('RANKING_PESO_CUMPLIMIENTO', 0.85),
      actividad: await this.numero('RANKING_PESO_ACTIVIDAD', 0.15),
    };
  }

  async reglaAlerta(): Promise<{ umbralFallos: number; umbralReputacion: number }> {
    return {
      umbralFallos: await this.numero('ALERTA_UMBRAL_FALLOS', 2),
      umbralReputacion: await this.numero('ALERTA_UMBRAL_REPUTACION', 0.4),
    };
  }

  // ---------------------------------------------------------------------
  // Pilar B. Plazos en dias habiles. 10 y 3 son directrices del profesor
  // (D-21, D-22); el aviso previo es PROPUESTA.
  // ---------------------------------------------------------------------
  async plazos(): Promise<{ donador: number; estudiante: number; avisoPrevio: number }> {
    return {
      donador: await this.numero('PLAZO_DONADOR_DIAS_HABILES', 10),
      estudiante: await this.numero('PLAZO_ESTUDIANTE_DIAS_HABILES', 3),
      avisoPrevio: await this.numero('PLAZO_AVISO_DIAS_HABILES', 1),
    };
  }

  /**
   * Cierres del LIS (vacaciones, cierres administrativos) como rangos de
   * fechas civiles: "2026-12-14..2027-01-12;2027-04-01..2027-04-01".
   * Configurable en PARAMETRO.CIERRES_LIS. Es temporal: la tabla
   * CIERRE_LIS del diseno T4.4 la reemplaza cuando se autorice el esquema.
   */
  async cierresLis(): Promise<{ desde: string; hasta: string }[]> {
    const crudo = await this.texto('CIERRES_LIS', '');
    return crudo
      .split(';')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const [desde, hasta] = r.split('..').map((s) => s.trim());
        return { desde, hasta: hasta || desde };
      })
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.desde) && /^\d{4}-\d{2}-\d{2}$/.test(r.hasta));
  }

  invalidarCache(): void {
    this.cargadoEn = 0;
  }
}
