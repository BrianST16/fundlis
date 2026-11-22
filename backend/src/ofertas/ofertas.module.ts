import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriasModule } from '../categorias/categorias.module';
import { DestinoLocal, Evidencia, LoteFisico, Movimiento, Oferta, OfertaXPeticion } from '../entities';
import { OfertasController } from './ofertas.controller';
import { OfertasService } from './ofertas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Oferta, OfertaXPeticion, Evidencia, Movimiento, DestinoLocal, LoteFisico]),
    CategoriasModule,
  ],
  controllers: [OfertasController],
  providers: [OfertasService],
  exports: [OfertasService],
})
export class OfertasModule {}
