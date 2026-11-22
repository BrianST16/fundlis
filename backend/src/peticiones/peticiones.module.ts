import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriasModule } from '../categorias/categorias.module';
import { Caracterizacion, OfertaXPeticion, Peticion } from '../entities';
import { PeticionesController } from './peticiones.controller';
import { PeticionesService } from './peticiones.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Peticion, OfertaXPeticion, Caracterizacion]),
    CategoriasModule,
  ],
  controllers: [PeticionesController],
  providers: [PeticionesService],
  exports: [PeticionesService],
})
export class PeticionesModule {}
