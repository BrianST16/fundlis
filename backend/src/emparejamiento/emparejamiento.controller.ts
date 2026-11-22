import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { UsuarioActual } from '../auth/auth.types';
import { Actual, Roles } from '../auth/decoradores';
import { Rol } from '../common/enums';
import { EmparejamientoService } from './emparejamiento.service';

/** Herramienta del personal del LIS: sugiere y ordena, nunca asigna sola. */
@Controller('emparejamiento')
@Roles(Rol.AUXILIAR_LIS)
export class EmparejamientoController {
  constructor(private readonly servicio: EmparejamientoService) {}

  private limite(v?: string) {
    return Math.min(Math.max(Number(v) || 20, 1), 100);
  }

  /** Recibidores compatibles de una oferta, por prioridad; LOCAL al final. */
  @Get('oferta/:id')
  oferta(@Param('id', ParseIntPipe) id: number, @Actual() actual: UsuarioActual, @Query('limite') limite?: string) {
    return this.servicio.candidatosParaOferta(id, actual, this.limite(limite));
  }

  /** Recibidores compatibles de un lote que ya esta en el LIS. */
  @Get('lote/:id')
  lote(@Param('id', ParseIntPipe) id: number, @Actual() actual: UsuarioActual, @Query('limite') limite?: string) {
    return this.servicio.candidatosParaLote(id, actual, this.limite(limite));
  }

  /** Ofertas compatibles con una peticion (consulta inversa, 2D). */
  @Get('peticion/:id')
  peticion(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.ofertasParaPeticion(id);
  }
}
