import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsignacionesModule } from '../asignaciones/asignaciones.module';
import { EmparejamientoModule } from '../emparejamiento/emparejamiento.module';
import { DestinoLocal, LoteFisico, OfertaXPeticion } from '../entities';
import { EvidenciasModule } from '../evidencias/evidencias.module';
import { LocalController } from './local.controller';
import { LocalService } from './local.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DestinoLocal, LoteFisico, OfertaXPeticion]),
    AsignacionesModule,
    EmparejamientoModule,
    EvidenciasModule,
  ],
  controllers: [LocalController],
  providers: [LocalService],
  exports: [LocalService],
})
export class LocalModule {}
