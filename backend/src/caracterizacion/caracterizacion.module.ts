import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Caracterizacion,
  GrupoSisben,
  OpcionCaracterizacion,
  PreguntaCaracterizacion,
  RespuestaCaracterizacion,
} from '../entities';
import { CaracterizacionController } from './caracterizacion.controller';
import { CaracterizacionService } from './caracterizacion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PreguntaCaracterizacion,
      OpcionCaracterizacion,
      Caracterizacion,
      RespuestaCaracterizacion,
      GrupoSisben,
    ]),
  ],
  controllers: [CaracterizacionController],
  providers: [CaracterizacionService],
  exports: [CaracterizacionService],
})
export class CaracterizacionModule {}
