import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Caracterizacion,
  Categoria,
  DestinoLocal,
  GrupoSisben,
  LoteFisico,
  Oferta,
  OfertaXPeticion,
  Peticion,
} from '../entities';
import { EmparejamientoController } from './emparejamiento.controller';
import { EmparejamientoService } from './emparejamiento.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Oferta,
      Peticion,
      OfertaXPeticion,
      Caracterizacion,
      GrupoSisben,
      Categoria,
      DestinoLocal,
      LoteFisico,
    ]),
  ],
  controllers: [EmparejamientoController],
  providers: [EmparejamientoService],
  exports: [EmparejamientoService],
})
export class EmparejamientoModule {}
