import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Publico, Roles } from '../auth/decoradores';
import { Rol } from '../common/enums';
import { CategoriasService } from './categorias.service';

class CrearCategoriaDto {
  @IsString() @MinLength(3) @MaxLength(120)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(400)
  descripcion?: string;
}

class ActualizarCategoriaDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  nombre?: string;

  @IsOptional() @IsString() @MaxLength(400)
  descripcion?: string;

  @IsOptional() @IsBoolean()
  activa?: boolean;
}

class MedidaDto {
  @IsOptional() @IsString() @MaxLength(80)
  medidaNombre?: string | null;

  @IsOptional() @IsString() @MaxLength(60)
  medidaUnidad?: string | null;

  @IsOptional() @IsNumber()
  medidaMin?: number | null;

  @IsOptional() @IsNumber()
  medidaMax?: number | null;
}

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly servicio: CategoriasService) {}

  /** Publico: el catalogo anonimo necesita las categorias para filtrar. */
  @Publico()
  @Get()
  listar(@Query('todas') todas?: string) {
    return this.servicio.listar(todas === 'true');
  }

  @Roles(Rol.ADMINISTRADOR)
  @Post()
  crear(@Body() dto: CrearCategoriaDto) {
    return this.servicio.crear(dto);
  }

  /** Medida de compatibilidad de la categoria (p. ej. talla). Vacia = no usa medida. */
  @Roles(Rol.ADMINISTRADOR)
  @Patch(':id/medida')
  medida(@Param('id', ParseIntPipe) id: number, @Body() dto: MedidaDto) {
    return this.servicio.configurarMedida(id, {
      medidaNombre: dto.medidaNombre ?? null,
      medidaUnidad: dto.medidaUnidad ?? null,
      medidaMin: dto.medidaMin ?? null,
      medidaMax: dto.medidaMax ?? null,
    });
  }

  @Roles(Rol.ADMINISTRADOR)
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarCategoriaDto) {
    return this.servicio.actualizar(id, dto);
  }
}
