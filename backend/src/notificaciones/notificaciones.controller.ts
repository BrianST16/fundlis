import { Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UsuarioActual } from '../auth/auth.types';
import { Actual, Roles } from '../auth/decoradores';
import { Rol } from '../common/enums';
import { CorreoService } from './correo.service';
import { NotificacionesService } from './notificaciones.service';

/** Bandeja interna: cada usuario solo ve y marca SUS notificaciones. */
@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    private readonly servicio: NotificacionesService,
    private readonly correo: CorreoService,
  ) {}

  @Get()
  bandeja(@Actual() actual: UsuarioActual, @Query('noLeidas') noLeidas?: string) {
    return this.servicio.bandeja(actual.sub, noLeidas === 'true');
  }

  @Get('no-leidas')
  noLeidas(@Actual() actual: UsuarioActual) {
    return this.servicio.noLeidas(actual.sub);
  }

  @Patch('leer-todas')
  marcarTodas(@Actual() actual: UsuarioActual) {
    return this.servicio.marcarTodas(actual.sub);
  }

  @Patch(':id/leida')
  marcarLeida(@Param('id', ParseIntPipe) id: number, @Actual() actual: UsuarioActual) {
    return this.servicio.marcarLeida(id, actual.sub);
  }

  /** Estado del canal de correo (para el administrador y la sustentacion). */
  @Roles(Rol.ADMINISTRADOR)
  @Get('correo/estado')
  estadoCorreo() {
    return this.correo.resumen();
  }

  @Roles(Rol.ADMINISTRADOR)
  @Post('correo/procesar')
  @HttpCode(200)
  procesar() {
    return this.correo.procesarPendientes();
  }

  @Roles(Rol.ADMINISTRADOR)
  @Post('correo/reencolar')
  @HttpCode(200)
  async reencolar() {
    return { reencolados: await this.correo.reencolar() };
  }
}
