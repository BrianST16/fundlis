import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Actual, Perfiles, Roles } from '../auth/decoradores';
import { UsuarioActual } from '../auth/auth.types';
import { MIMES_CERTIFICADO, Perfil, Rol } from '../common/enums';
import { CaracterizacionService } from './caracterizacion.service';
import { CertificadoService } from './certificado.service';

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

class SubirCertificadoDto {
  @IsIn(MIMES_CERTIFICADO, { message: 'El certificado debe ser PDF, JPEG o PNG.' })
  mime: string;

  @IsString()
  @MinLength(20, { message: 'El contenido del archivo es demasiado corto.' })
  contenidoBase64: string;

  @IsOptional() @IsString() @MaxLength(260)
  nombreOriginal?: string;
}

class RevisarCertificadoDto {
  @IsIn(['VALIDADO', 'RECHAZADO'], { message: 'El estado debe ser VALIDADO o RECHAZADO.' })
  estado: 'VALIDADO' | 'RECHAZADO';

  @IsOptional() @IsString() @MaxLength(400)
  observacion?: string;
}

function enviarArchivo(res: Response, a: { contenido: Buffer; mime: string; nombre: string }) {
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Length', a.contenido.length);
  // Dato sensible: que ningun intermediario lo guarde.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', `inline; filename="${a.nombre}"`);
  res.end(a.contenido);
}

@Controller('caracterizacion')
export class CaracterizacionController {
  constructor(
    private readonly servicio: CaracterizacionService,
    private readonly certificados: CertificadoService,
  ) {}

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

  // --- Certificado de estudio (D-46): opcional, solo dueno y administrador ---

  /** Estado del certificado propio (null si no ha cargado ninguno). */
  @Perfiles(Perfil.ESTUDIANTE)
  @Get('mia/certificado')
  miCertificado(@Actual() actual: UsuarioActual) {
    return this.certificados.metadatos(actual.sub);
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Get('mia/certificado/archivo')
  async miCertificadoArchivo(@Actual() actual: UsuarioActual, @Res() res: Response) {
    enviarArchivo(res, await this.certificados.descargar(actual.sub));
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Put('mia/certificado')
  subirCertificado(@Body() dto: SubirCertificadoDto, @Actual() actual: UsuarioActual) {
    return this.certificados.subir(actual.sub, dto);
  }

  @Perfiles(Perfil.ESTUDIANTE)
  @Delete('mia/certificado')
  @HttpCode(204)
  async eliminarCertificado(@Actual() actual: UsuarioActual) {
    await this.certificados.eliminarPropio(actual.sub);
  }

  /** Caracterizacion completa de un estudiante: dato sensible, solo
   *  ADMINISTRADOR (el auxiliar no la ve). */
  @Roles(Rol.ADMINISTRADOR)
  @Get('usuario/:id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalleSensible(id);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Get('usuario/:id/certificado')
  certificadoDe(@Param('id', ParseIntPipe) id: number) {
    return this.certificados.metadatos(id);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Get('usuario/:id/certificado/archivo')
  async certificadoArchivoDe(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    enviarArchivo(res, await this.certificados.descargar(id));
  }

  @Roles(Rol.ADMINISTRADOR)
  @Patch('usuario/:id/certificado/revision')
  revisarCertificado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevisarCertificadoDto,
    @Actual() actual: UsuarioActual,
  ) {
    return this.certificados.revisar(id, dto.estado, dto.observacion, actual.sub);
  }
}
