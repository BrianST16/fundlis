import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfertaXPeticion } from '../entities';
import { PlazosController } from './plazos.controller';
import { PlazosService } from './plazos.service';

@Module({
  imports: [TypeOrmModule.forFeature([OfertaXPeticion])],
  controllers: [PlazosController],
  providers: [PlazosService],
  exports: [PlazosService],
})
export class PlazosModule {}
