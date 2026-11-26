import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UsuarioActual } from '../auth/auth.types';
import { Actual, Roles } from '../auth/decoradores';
import { Rol } from '../common/enums';
import { DecisionTarea } from '../entities';
import { TareasService } from './tareas.service';

const DECISIONES: DecisionTarea[] = ['APLAZAR', 'CANCELAR_INTENTO', 'EXTENDER', 'REASIGNAR', 'DEVOLUCION', 'CUSTODIA_LOCAL', 'RETIRAR_PROPUESTA', 'ESPERAR', 'RECIBIR_LIS', 'SIN_ACCION'];

class ResolverDto {
  @IsIn(DECISIONES)
  decision: DecisionTarea;
  @IsString() @MinLength(5) @MaxLength(400)
  motivo: string;
  @IsOptional() @IsInt() @IsPositive()
  peticionId?: number;
}

class RevisarDto {
  /** Fecha simulada AAAA-MM-DD (solo fuera de produccion), para probar disparadores. */
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaSimulada?: string;
}

@Controller('tareas')
@Roles(Rol.AUXILIAR_LIS)
export class TareasController {
  constructor(private readonly servicio: TareasService) {}

  @Get()
  listar(@Query('estado') estado?: string) {
    return this.servicio.listar(estado === 'ABIERTA' || estado === 'RESUELTA' ? estado : undefined);
  }

  /** Ejecuta la revision ahora (la misma que corre periodicamente). */
  @Post('revisar')
  @HttpCode(200)
  revisar(@Body() dto: RevisarDto) {
    if (dto.fechaSimulada) {
      if (process.env.NODE_ENV === 'production') {
        throw new BadRequestException('La fecha simulada no está permitida en produccion.');
      }
      return this.servicio.revisar(new Date(`${dto.fechaSimulada}T15:00:00Z`));
    }
    return this.servicio.revisar();
  }

  @Post(':id/resolver')
  @HttpCode(200)
  resolver(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolverDto, @Actual() actual: UsuarioActual) {
    return this.servicio.resolver(id, dto, actual);
  }
}
