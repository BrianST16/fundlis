import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Caracterizacion,
  CertificadoEstudio,
  GrupoSisben,
  OpcionCaracterizacion,
  PreguntaCaracterizacion,
  RespuestaCaracterizacion,
} from '../entities';
import { CaracterizacionController } from './caracterizacion.controller';
import { CaracterizacionService } from './caracterizacion.service';
import { CertificadoService } from './certificado.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PreguntaCaracterizacion,
      OpcionCaracterizacion,
      Caracterizacion,
      RespuestaCaracterizacion,
      GrupoSisben,
      CertificadoEstudio,
    ]),
  ],
  controllers: [CaracterizacionController],
  providers: [CaracterizacionService, CertificadoService],
  exports: [CaracterizacionService],
})
export class CaracterizacionModule {}
