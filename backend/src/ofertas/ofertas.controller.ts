import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Actual, Perfiles, Publico, Roles } from '../auth/decoradores';
import { UsuarioActual } from '../auth/auth.types';
import { Perfil, Rol } from '../common/enums';
import { OfertasService } from './ofertas.service';

class CrearOfertaDto {
  @IsInt() @IsPositive()
  categoriaId: number;

  @IsString() @MinLength(3) @MaxLength(200)
  nombreProducto: string;

  @IsString() @MinLength(10, { message: 'Describe el producto con al menos 10 caracteres.' }) @MaxLength(1000)
  descripcion: string;

  @IsInt() @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  cantidad: number;

  @IsOptional() @IsInt() @IsPositive()
  fotoId?: number;

  /** Compatibilidad (D-41): 1 deteriorado ... 5 nuevo. */
  @IsInt() @Min(1) @Max(5, { message: 'El estado de conservación va de 1 (deteriorado) a 5 (nuevo).' })
  estadoConservacion: number;

  /** Medida de la categoria (p. ej. talla), si la categoria la usa. */
  @IsOptional() @IsNumber()
  medida?: number | null;
}

class EditarOfertaDto {
  @IsOptional() @IsInt() @IsPositive()
  categoriaId?: number;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(200)
  nombreProducto?: string;

  @IsOptional() @IsString() @MinLength(10) @MaxLength(1000)
  descripcion?: string;

  @IsOptional() @IsInt() @Min(1)
  cantidad?: number;

  @IsOptional() @IsInt() @IsPositive()
  fotoId?: number;

  @IsOptional() @IsInt() @Min(1) @Max(5)
  estadoConservacion?: number;

  @IsOptional() @IsNumber()
  medida?: number | null;
}

class MotivoDto {
  @IsString() @MinLength(5, { message: 'Indica un motivo de al menos 5 caracteres.' }) @MaxLength(400)
  motivo: string;
}

@Controller('ofertas')
export class OfertasController {
  constructor(private readonly servicio: OfertasService) {}

  /** Catalogo anonimo: no revela donador ni contacto. */
  @Publico()
  @Get('catalogo')
  catalogo(@Query('categoriaId') categoriaId?: string) {
    return this.servicio.catalogo(categoriaId ? Number(categoriaId) : undefined);
  }

  @Perfiles(Perfil.DONADOR)
  @Get('mias')
  mias(@Actual() actual: UsuarioActual) {
    return this.servicio.mias(actual.sub);
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

  @Get(':id/historial')
  @Roles(Rol.AUXILIAR_LIS)
  historial(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.historialDe(id);
  }

  @Perfiles(Perfil.DONADOR)
  @Post()
  crear(@Body() dto: CrearOfertaDto, @Actual() actual: UsuarioActual) {
    return this.servicio.crear(actual.sub, dto);
  }

  @Perfiles(Perfil.DONADOR)
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarOfertaDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.editar(id, actual.sub, dto);
  }

  @Perfiles(Perfil.DONADOR)
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
    return this.servicio.aprobar(id, actual.sub, actual.esAdministrador);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Patch(':id/rechazar')
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.rechazar(id, actual.sub, dto.motivo, actual.esAdministrador);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Patch(':id/cerrar')
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.cerrar(id, actual.sub, dto.motivo);
  }
}
