import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DestinoLocal, HistorialEstado, LoteFisico, Movimiento, Oferta, OfertaXPeticion, Usuario } from '../entities';
import { TrazabilidadController } from './trazabilidad.controller';
import { TrazabilidadService } from './trazabilidad.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Oferta, OfertaXPeticion, LoteFisico, DestinoLocal, Movimiento, HistorialEstado, Usuario]),
  ],
  controllers: [TrazabilidadController],
  providers: [TrazabilidadService],
})
export class TrazabilidadModule {}
