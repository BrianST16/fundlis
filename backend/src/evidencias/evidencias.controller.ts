import { Body, Controller, Get, Param, ParseIntPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Actual, Publico } from '../auth/decoradores';
import { UsuarioActual } from '../auth/auth.types';
import { MIMES_EVIDENCIA } from '../common/enums';
import { EvidenciasService } from './evidencias.service';

class SubirEvidenciaDto {
  @IsIn(MIMES_EVIDENCIA, { message: 'Solo se aceptan imagenes JPEG, PNG o WebP.' })
  mime: string;

  @IsString()
  @MinLength(100, { message: 'El contenido de la imagen es demasiado corto.' })
  contenidoBase64: string;

  @IsOptional() @IsString() @MaxLength(260)
  nombreOriginal?: string;
}

@Controller('evidencias')
export class EvidenciasController {
  constructor(private readonly servicio: EvidenciasService) {}

  /** Sube una imagen y devuelve su id, para asociarla luego a una oferta
   *  o a un movimiento fisico. */
  @Post()
  async subir(@Body() dto: SubirEvidenciaDto, @Actual() actual: UsuarioActual) {
    const e = await this.servicio.guardar(dto, actual.sub);
    return {
      id: e.id,
      mime: e.mime,
      tamanoBytes: e.tamanoBytes,
      hashSha256: e.hashSha256,
    };
  }

  /** Entrega el binario. El servicio decide si el solicitante puede verlo;
   *  la ruta es @Publico solo para que un invitado vea la foto de una
   *  oferta ya aprobada en el catalogo. */
  @Publico()
  @Get(':id')
  async descargar(
    @Param('id', ParseIntPipe) id: number,
    @Actual() actual: UsuarioActual,
    @Res() res: Response,
  ) {
    const archivo = await this.servicio.descargar(id, actual ?? null);
    res.setHeader('Content-Type', archivo.mime);
    res.setHeader('Content-Length', archivo.contenido.length);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${archivo.nombre}"`);
    res.end(archivo.contenido);
  }
}
