import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { UsuarioActual } from '../auth/auth.types';
import { Actual, Perfiles, Roles } from '../auth/decoradores';
import { MIMES_EVIDENCIA, Perfil, Rol } from '../common/enums';
import { EstadoLocal } from '../entities';
import { LocalService } from './local.service';

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
  @IsString() @MinLength(3) @MaxLength(200)
  nombreContraparte: string;
  @ValidateNested() @Type(() => FotoDto)
  foto: FotoDto;
  @IsOptional() @IsString() @MaxLength(600)
  observaciones?: string;
}

class MotivoDto {
  @IsString() @MinLength(5) @MaxLength(400)
  motivo: string;
}

class DesdeOfertaDto extends MotivoDto {
  @IsInt() @IsPositive()
  ofertaId: number;
  @IsInt() @Min(1)
  cantidad: number;
}

class DesdeLoteDto extends MotivoDto {
  @IsInt() @IsPositive()
  loteId: number;
}

class RespuestaDonadorDto {
  @IsBoolean({ message: 'Indica si aceptas (true) o rechazas (false).' })
  acepta: boolean;
  @IsOptional() @IsString() @MaxLength(400)
  motivo?: string;
}

const ESTADOS: EstadoLocal[] = [
  'ESPERA_RECEPCION', 'CUSTODIA_TEMPORAL', 'PROPUESTO_DONADOR', 'POR_DEVOLVER',
  'ACEPTADO', 'REASIGNADO', 'DEVUELTO', 'CANCELADO',
];

/** LOCAL. Por defecto personal LIS; proponer/retirar la aceptacion
 *  institucional es SOLO del administrador (D-50). */
@Controller('local')
@Roles(Rol.AUXILIAR_LIS)
export class LocalController {
  constructor(private readonly servicio: LocalService) {}

  @Get()
  listar(@Query('estado') estado?: string) {
    const estados = estado
      ? (estado.split(',').map((e) => e.trim().toUpperCase()).filter((e) => ESTADOS.includes(e as EstadoLocal)) as EstadoLocal[])
      : undefined;
    return this.servicio.listar(estados);
  }

  @Get('lotes')
  lotes(@Query('filtro') filtro?: string) {
    const f = filtro === 'SIN_DESTINO' || filtro === 'TODOS' || filtro === 'DISPONIBLES' ? filtro : 'EN_LIS';
    return this.servicio.lotes(f);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalle(id);
  }

  @Post('desde-oferta')
  desdeOferta(@Body() dto: DesdeOfertaDto, @Actual() a: UsuarioActual) {
    return this.servicio.seleccionarDesdeOferta(dto.ofertaId, dto.cantidad, dto.motivo, a.sub);
  }

  @Post('desde-lote')
  desdeLote(@Body() dto: DesdeLoteDto, @Actual() a: UsuarioActual) {
    return this.servicio.custodiaDesdeLote(dto.loteId, dto.motivo, a.sub);
  }

  @Post(':id/recepcion')
  recibir(@Param('id', ParseIntPipe) id: number, @Body() dto: MovimientoDto, @Actual() a: UsuarioActual) {
    return this.servicio.recibir(id, dto, a.sub);
  }

  @Post(':id/cancelar')
  cancelar(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @Actual() a: UsuarioActual) {
    return this.servicio.cancelar(id, dto.motivo, a.sub);
  }

  /** D-50: el administrador propone al donador que el producto quede para
   *  el LIS. La aceptacion final la da el DONADOR. */
  @Roles(Rol.ADMINISTRADOR)
  @Post(':id/proponer')
  proponer(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @Actual() a: UsuarioActual) {
    return this.servicio.proponer(id, dto.motivo, a);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Post(':id/retirar-propuesta')
  retirarPropuesta(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @Actual() a: UsuarioActual) {
    return this.servicio.retirarPropuesta(id, dto.motivo, a);
  }

  @Post(':id/devolucion')
  devolver(@Param('id', ParseIntPipe) id: number, @Body() dto: MovimientoDto, @Actual() a: UsuarioActual) {
    return this.servicio.devolver(id, dto, a.sub);
  }

}

/**
 * D-50 / correccion 8: lado del DONADOR. Ve las propuestas sobre SUS
 * donaciones y las acepta o rechaza. El servicio comprueba que la
 * donacion sea suya (404 si no lo es).
 */
@Controller('local/donador')
@Perfiles(Perfil.DONADOR)
export class LocalDonadorController {
  constructor(private readonly servicio: LocalService) {}

  @Get('propuestas')
  propuestas(@Actual() a: UsuarioActual) {
    return this.servicio.propuestasDelDonador(a.sub);
  }

  @Post('propuestas/:id/responder')
  responder(@Param('id', ParseIntPipe) id: number, @Body() dto: RespuestaDonadorDto, @Actual() a: UsuarioActual) {
    return this.servicio.responder(id, dto.acepta, dto.motivo, a);
  }
}
