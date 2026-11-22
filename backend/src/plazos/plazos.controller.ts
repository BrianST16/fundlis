import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { UsuarioActual } from '../auth/auth.types';
import { Actual, Roles } from '../auth/decoradores';
import { Rol } from '../common/enums';
import { EstadoPlazo } from './plazos';
import { PlazosService } from './plazos.service';

const ESTADOS: EstadoPlazo[] = ['EN_PLAZO', 'POR_VENCER', 'VENCIDO'];

@Controller('plazos')
export class PlazosController {
  constructor(private readonly servicio: PlazosService) {}

  /** Bandeja del LIS. ?estado=VENCIDO devuelve solo las tareas DEFINIR_ESTADO. */
  @Roles(Rol.AUXILIAR_LIS)
  @Get('bandeja')
  bandeja(@Query('estado') estado?: string) {
    if (estado && !ESTADOS.includes(estado as EstadoPlazo)) {
      throw new BadRequestException(`estado debe ser uno de: ${ESTADOS.join(', ')}.`);
    }
    return this.servicio.bandeja(estado as EstadoPlazo | undefined);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Get('resumen')
  resumen() {
    return this.servicio.resumen();
  }

  /** Cualquier usuario autenticado: sus propios plazos, sin datos de la otra parte. */
  @Get('mios')
  mios(@Actual() actual: UsuarioActual) {
    return this.servicio.mios(actual);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Get('calendario')
  calendario(@Query('anio') anio?: string) {
    const a = anio ? Number(anio) : new Date().getFullYear();
    if (!Number.isInteger(a) || a < 2000 || a > 2100) {
      throw new BadRequestException('anio debe ser un entero entre 2000 y 2100.');
    }
    return this.servicio.calendario(a);
  }
}
