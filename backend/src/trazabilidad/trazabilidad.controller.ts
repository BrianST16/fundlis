import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Roles } from '../auth/decoradores';
import { Rol } from '../common/enums';
import { TrazabilidadService } from './trazabilidad.service';

/** D-52: trazabilidad completa de una donacion. SOLO administrador
 *  (y superusuario, que lo hereda): incluye identidades y fotos. */
@Controller('trazabilidad')
@Roles(Rol.ADMINISTRADOR)
export class TrazabilidadController {
  constructor(private readonly servicio: TrazabilidadService) {}

  @Get('oferta/:id')
  deOferta(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.deOferta(id);
  }
}
