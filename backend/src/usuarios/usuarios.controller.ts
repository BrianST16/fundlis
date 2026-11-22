import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { Actual, Roles } from '../auth/decoradores';
import { UsuarioActual } from '../auth/auth.types';
import { Rol } from '../common/enums';
import { UsuariosService } from './usuarios.service';

class RolDto {
  @IsEnum(Rol, { message: 'El rol debe ser AUXILIAR_LIS o ADMINISTRADOR.' })
  rol: Rol;
}

class BloqueoDto {
  @IsString()
  @MinLength(5, { message: 'Indica el motivo del bloqueo (minimo 5 caracteres).' })
  @MaxLength(400)
  motivo: string;
}

/** Gestion de usuarios y roles: solo ADMINISTRADOR. */
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
    return this.servicio.otorgarRol(id, dto.rol, actual.sub);
  }

  @Post(':id/roles/revocar')
  revocar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RolDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.revocarRol(id, dto.rol, actual.sub);
  }

  @Patch(':id/bloquear')
  bloquear(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BloqueoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.bloquear(id, dto.motivo, actual.sub);
  }

  @Patch(':id/desbloquear')
  desbloquear(@Param('id', ParseIntPipe) id: number, @Actual() actual: UsuarioActual) {
    return this.servicio.desbloquear(id, actual.sub);
  }
}
