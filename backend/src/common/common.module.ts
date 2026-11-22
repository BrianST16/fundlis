import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarioService } from '../calendario/calendario.service';
import { CierreLis, HistorialEstado, Parametro } from '../entities';
import { HistorialService } from './historial.service';
import { ParametrosService } from './parametros.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Parametro, HistorialEstado, CierreLis])],
  providers: [ParametrosService, HistorialService, CalendarioService],
  exports: [ParametrosService, HistorialService, CalendarioService],
})
export class CommonModule {}
