import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DestinoLocal, LoteFisico, Oferta, OfertaXPeticion, Peticion } from '../entities';
import { AnaliticaController } from './analitica.controller';
import { AnaliticaService } from './analitica.service';

@Module({
  imports: [TypeOrmModule.forFeature([Oferta, Peticion, OfertaXPeticion, LoteFisico, DestinoLocal])],
  controllers: [AnaliticaController],
  providers: [AnaliticaService],
})
export class AnaliticaModule {}
