import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParametrosService } from '../common/parametros.service';
import { CierreLis } from '../entities';
import { fechaEnBogota, RangoCierre, restarDiasHabiles } from './dias-habiles';

/** Fecha que llega de SQL Server (DATE) como Date o string -> 'AAAA-MM-DD'. */
export function aFechaCivil(v: Date | string): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

/**
 * Calendario operativo del LIS: cierres configurados (tabla CIERRE_LIS;
 * el parametro CIERRES_LIS queda como respaldo) y suspension anticipada de
 * la recepcion de donaciones antes de un cierre (D-24).
 */
@Injectable()
export class CalendarioService {
  constructor(
    @InjectRepository(CierreLis) private readonly cierresRepo: Repository<CierreLis>,
    private readonly parametros: ParametrosService,
  ) {}

  async cierres(): Promise<RangoCierre[]> {
    const filas = await this.cierresRepo.find({ order: { desde: 'ASC' } });
    const deTabla = filas.map((c) => ({ desde: aFechaCivil(c.desde), hasta: aFechaCivil(c.hasta) }));
    const deParametro = await this.parametros.cierresLis();
    return [...deTabla, ...deParametro];
  }

  async listar() {
    return this.cierresRepo.find({ order: { desde: 'ASC' } });
  }

  async crear(datos: { desde: string; hasta: string; motivo: string }, actorId: number) {
    return this.cierresRepo.save(this.cierresRepo.create({ ...datos, creadoPor: actorId }));
  }

  async eliminar(id: number) {
    await this.cierresRepo.delete({ id });
  }

  /**
   * Si hoy cae dentro de [inicio del cierre - anticipacion, fin del cierre],
   * la recepcion de NUEVAS donaciones esta suspendida. Devuelve el cierre.
   */
  async recepcionSuspendida(ahora = new Date()): Promise<RangoCierre | null> {
    const anticipacion = await this.parametros.numero('DIAS_ANTICIPACION_CIERRE', 5);
    const hoy = fechaEnBogota(ahora);
    const cierres = await this.cierres();
    for (const c of cierres) {
      const inicioSuspension = restarDiasHabiles(c.desde, anticipacion, cierres);
      if (hoy >= inicioSuspension && hoy <= c.hasta) return c;
    }
    return null;
  }
}
