import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmparejamientoModule } from '../emparejamiento/emparejamiento.module';
import { EvidenciasModule } from '../evidencias/evidencias.module';
import { Movimiento, Oferta, OfertaXPeticion, Peticion } from '../entities';
import { AsignacionesController } from './asignaciones.controller';
import { AsignacionesService } from './asignaciones.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OfertaXPeticion, Movimiento, Oferta, Peticion]),
    EmparejamientoModule,
    EvidenciasModule,
  ],
  controllers: [AsignacionesController],
  providers: [AsignacionesService],
  exports: [AsignacionesService],
})
export class AsignacionesModule {}
