import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnaliticaModule } from '../analitica/analitica.module';
import { AsignacionesModule } from '../asignaciones/asignaciones.module';
import { DestinoLocal, LoteFisico, OfertaXPeticion, Tarea } from '../entities';
import { LocalModule } from '../local/local.module';
import { TareasController } from './tareas.controller';
import { TareasService } from './tareas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tarea, OfertaXPeticion, DestinoLocal, LoteFisico]), AsignacionesModule, LocalModule, AnaliticaModule],
  controllers: [TareasController],
  providers: [TareasService],
})
export class TareasModule {}
