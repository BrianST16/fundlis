import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Actual, Roles } from '../auth/decoradores';
import { UsuarioActual } from '../auth/auth.types';
import { Rol } from '../common/enums';
import { UsuariosService } from './usuarios.service';

/** SUPERUSUARIO queda fuera a proposito: solo se asigna por script de BD. */
class RolDto {
  @IsIn([Rol.AUXILIAR_LIS, Rol.ADMINISTRADOR], {
    message: 'Solo se pueden gestionar los roles AUXILIAR_LIS y ADMINISTRADOR.',
  })
  rol: Rol;
}

class BloqueoDto {
  @IsString()
  @MinLength(5, { message: 'Indica el motivo del bloqueo (mínimo 5 caracteres).' })
  @MaxLength(400)
  motivo: string;
}

/** Gestion de usuarios y roles: ADMINISTRADOR (y SUPERUSUARIO, que lo
 *  hereda). Las reglas finas por rol estan en UsuariosService. */
@Controller('usuarios')
@Roles(Rol.ADMINISTRADOR)
export class UsuariosController {
  constructor(private readonly servicio: UsuariosService) {}

  @Get()
  listar(@Query('buscar') buscar?: string) {
    return this.servicio.listar(buscar);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalle(id);
  }

  @Post(':id/roles')
  otorgar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RolDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.otorgarRol(id, dto.rol, actual.sub, actual.esSuperusuario);
  }

  @Post(':id/roles/revocar')
  revocar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RolDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.revocarRol(id, dto.rol, actual.sub, actual.esSuperusuario);
  }

  @Patch(':id/bloquear')
  bloquear(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BloqueoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.bloquear(id, dto.motivo, actual.sub, actual.esSuperusuario);
  }

  @Patch(':id/desbloquear')
  desbloquear(@Param('id', ParseIntPipe) id: number, @Actual() actual: UsuarioActual) {
    return this.servicio.desbloquear(id, actual.sub, actual.esSuperusuario);
  }
}
