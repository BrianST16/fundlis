import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Actual, Perfiles, Publico, Roles } from '../auth/decoradores';
import { UsuarioActual } from '../auth/auth.types';
import { Perfil, Rol } from '../common/enums';
import { PeticionesService } from './peticiones.service';

class CrearPeticionDto {
  @IsInt() @IsPositive()
  categoriaId: number;

  @IsString()
  @MinLength(10, { message: 'Explica tu necesidad con al menos 10 caracteres.' })
  @MaxLength(1000)
  descripcion: string;

  /** Estado de conservacion minimo aceptable (1-5). Por defecto 1 (cualquiera). */
  @IsOptional() @IsInt() @Min(1) @Max(5)
  estadoMinimo?: number;

  /** Rango aceptable de la medida de la categoria (p. ej. talla). Vacio = cualquiera. */
  @IsOptional() @IsNumber()
  medidaMin?: number | null;

  @IsOptional() @IsNumber()
  medidaMax?: number | null;
}

class EditarPeticionDto {
  @IsOptional() @IsInt() @IsPositive()
  categoriaId?: number;

  @IsOptional() @IsString() @MinLength(10) @MaxLength(1000)
  descripcion?: string;

  @IsOptional() @IsInt() @Min(1) @Max(5)
  estadoMinimo?: number;

  @IsOptional() @IsNumber()
  medidaMin?: number | null;

  @IsOptional() @IsNumber()
  medidaMax?: number | null;
}

class MotivoDto {
  @IsString() @MinLength(5) @MaxLength(400)
  motivo: string;
}

@Controller('peticiones')
export class PeticionesController {
  constructor(private readonly servicio: PeticionesService) {}

  /** Catalogo anonimo de necesidades. */
  @Publico()
  @Get('catalogo')
  catalogo(@Query('categoriaId') categoriaId?: string) {
    return this.servicio.catalogo(categoriaId ? Number(categoriaId) : undefined);
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Get('mias')
  mias(@Actual() actual: UsuarioActual) {
    return this.servicio.mias(actual.sub);
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Get('mi-cupo')
  cupo(@Actual() actual: UsuarioActual) {
    return this.servicio.conteoVigente(actual.sub);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Get('pendientes')
  pendientes() {
    return this.servicio.colaAprobacion();
  }

  @Publico()
  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @Actual() actual: UsuarioActual) {
    return this.servicio.detalle(id, actual?.sub ?? 0, actual?.esPersonalLis ?? false);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Get(':id/historial')
  historial(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.historialDe(id);
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Post()
  crear(@Body() dto: CrearPeticionDto, @Actual() actual: UsuarioActual) {
    return this.servicio.crear(actual.sub, dto);
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarPeticionDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.editar(id, actual.sub, dto);
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Patch(':id/cancelar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.cancelar(id, actual.sub, dto.motivo);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Patch(':id/aprobar')
  aprobar(@Param('id', ParseIntPipe) id: number, @Actual() actual: UsuarioActual) {
    return this.servicio.aprobar(id, actual.sub);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Patch(':id/rechazar')
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.rechazar(id, actual.sub, dto.motivo);
  }
}
