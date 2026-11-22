import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsInt, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Actual, Perfiles, Roles } from '../auth/decoradores';
import { UsuarioActual } from '../auth/auth.types';
import { Perfil, Rol } from '../common/enums';
import { CaracterizacionService } from './caracterizacion.service';

class RespuestaDto {
  @IsInt() preguntaId: number;
  @IsInt() opcionId: number;
}

class GuardarCaracterizacionDto {
  @IsString()
  @Matches(/^[ABCD][0-9]{1,2}$/, { message: 'El grupo Sisben debe tener la forma A1, B3, C12...' })
  grupoSisben: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RespuestaDto)
  respuestas: RespuestaDto[];
}

@Controller('caracterizacion')
export class CaracterizacionController {
  constructor(private readonly servicio: CaracterizacionService) {}

  /** Preguntas activas y catalogo Sisben. */
  @Get('formulario')
  formulario() {
    return this.servicio.formulario();
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Get('mia')
  mia(@Actual() actual: UsuarioActual) {
    return this.servicio.miCaracterizacion(actual.sub);
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Put('mia')
  guardar(@Body() dto: GuardarCaracterizacionDto, @Actual() actual: UsuarioActual) {
    return this.servicio.guardar(actual.sub, dto);
  }

  /** Caracterizacion completa de un estudiante: dato sensible, solo
   *  ADMINISTRADOR (el auxiliar no la ve). */
  @Roles(Rol.ADMINISTRADOR)
  @Get('usuario/:id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalleSensible(id);
  }
}
