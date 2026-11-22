import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorreoSalida, Notificacion, Usuario, UsuarioRol } from '../entities';
import { CorreoService } from './correo.service';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';

/** Global: cualquier servicio de negocio puede emitir avisos. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notificacion, CorreoSalida, Usuario, UsuarioRol])],
  controllers: [NotificacionesController],
  providers: [NotificacionesService, CorreoService],
  exports: [NotificacionesService, CorreoService],
})
export class NotificacionesModule {}
