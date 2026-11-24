import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Actual, Roles } from '../auth/decoradores';
import { UsuarioActual } from '../auth/auth.types';
import { EstadoAsignacion, MIMES_EVIDENCIA, Rol } from '../common/enums';
import { AsignacionesService } from './asignaciones.service';

class FotoDto {
  @IsIn(MIMES_EVIDENCIA, { message: 'La foto debe ser JPEG, PNG o WebP.' })
  mime: string;

  @IsString() @MinLength(100, { message: 'La foto es obligatoria.' })
  contenidoBase64: string;

  @IsOptional() @IsString() @MaxLength(260)
  nombreOriginal?: string;
}

class MovimientoDto {
  @IsInt() @Min(1)
  cantidad: number;

  @IsString()
  @MinLength(3, { message: 'Registra el nombre de quien entrega o recibe.' })
  @MaxLength(200)
  nombreContraparte: string;

  @ValidateNested() @Type(() => FotoDto)
  foto: FotoDto;

  @IsOptional() @IsString() @MaxLength(600)
  observaciones?: string;
}

class AsignarDto {
  @IsInt() @IsPositive()
  ofertaId: number;

  @IsInt() @IsPositive()
  peticionId: number;

  @IsInt() @Min(1)
  cantidad: number;
}

class MotivoDto {
  @IsString() @MinLength(5) @MaxLength(400)
  motivo: string;
}

class DesdeLoteDto {
  @IsInt() @IsPositive()
  loteId: number;

  @IsInt() @IsPositive()
  peticionId: number;
}

class ReasignarDto extends MotivoDto {
  @IsInt() @IsPositive()
  peticionId: number;
}

class ProrrogaDto extends MotivoDto {
  @IsIn(['APLAZAR', 'EXTENDER'])
  tipo: 'APLAZAR' | 'EXTENDER';
}

@Controller('asignaciones')
export class AsignacionesController {
  constructor(private readonly servicio: AsignacionesService) {}

  /** Bandeja del LIS. */
  @Roles(Rol.AUXILIAR_LIS)
  @Get()
  listar(@Query('estado') estado?: string) {
    const estados = estado
      ? estado
          .split(',')
          .map((e) => e.trim().toUpperCase())
          .filter((e): e is EstadoAsignacion =>
            Object.values(EstadoAsignacion).includes(e as EstadoAsignacion),
          )
      : undefined;
    return this.servicio.listar(estados);
  }

  /** Lo que le concierne al donador o al estudiante. */
  @Get('mias')
  mias(@Actual() actual: UsuarioActual) {
    return this.servicio.mias(actual);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @Actual() actual: UsuarioActual) {
    return this.servicio.detalle(id, actual);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Post()
  asignar(@Body() dto: AsignarDto, @Actual() actual: UsuarioActual) {
    return this.servicio.asignar(dto, actual.sub);
  }

  /** Reasigna un lote que ya esta en el LIS: nace EN_CUSTODIA, sin recepcion ficticia. */
  @Roles(Rol.AUXILIAR_LIS)
  @Post('desde-lote')
  desdeLote(@Body() dto: DesdeLoteDto, @Actual() actual: UsuarioActual) {
    return this.servicio.reasignarLote(dto.loteId, dto.peticionId, actual.sub);
  }

  /** Correccion 6: un producto EN_CUSTODIA pasa a otra peticion directamente
   *  EN_CUSTODIA, sin repetir la recepcion, en una sola transaccion. */
  @Roles(Rol.AUXILIAR_LIS)
  @Post(':id/reasignar')
  reasignar(@Param('id', ParseIntPipe) id: number, @Body() dto: ReasignarDto, @Actual() actual: UsuarioActual) {
    return this.servicio.reasignarDesdeCustodia(id, dto.peticionId, dto.motivo, actual.sub);
  }

  /** Aplazamiento del donador o extension de recogida del estudiante. */
  @Roles(Rol.AUXILIAR_LIS)
  @Post(':id/prorrogar')
  prorrogar(@Param('id', ParseIntPipe) id: number, @Body() dto: ProrrogaDto, @Actual() actual: UsuarioActual) {
    return this.servicio.prorrogar(id, dto.tipo, dto.motivo, actual.sub);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Post(':id/recepcion')
  recibir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MovimientoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.registrarRecepcion(id, dto, actual.sub);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Post(':id/entrega')
  entregar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MovimientoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.registrarEntrega(id, dto, actual.sub);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Post(':id/cancelar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.cancelar(id, dto.motivo, actual.sub);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Post(':id/marcar-devolucion')
  marcarDevolucion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.marcarParaDevolucion(id, dto.motivo, actual.sub);
  }

  @Roles(Rol.AUXILIAR_LIS)
  @Post(':id/devolucion')
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MovimientoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.servicio.registrarDevolucion(id, dto, actual.sub);
  }
}
