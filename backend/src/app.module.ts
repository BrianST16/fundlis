import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnaliticaModule } from './analitica/analitica.module';
import { AsignacionesModule } from './asignaciones/asignaciones.module';
import { AuthModule } from './auth/auth.module';
import { JwtGuard } from './auth/jwt.guard';
import { RolesGuard } from './auth/roles.guard';
import { CaracterizacionModule } from './caracterizacion/caracterizacion.module';
import { CategoriasModule } from './categorias/categorias.module';
import { CommonModule } from './common/common.module';
import { EmparejamientoModule } from './emparejamiento/emparejamiento.module';
import { EvidenciasModule } from './evidencias/evidencias.module';
import { HealthModule } from './health/health.module';
import { OfertasModule } from './ofertas/ofertas.module';
import { PeticionesModule } from './peticiones/peticiones.module';
import { PlazosModule } from './plazos/plazos.module';
import { LocalModule } from './local/local.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { TareasModule } from './tareas/tareas.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { TrazabilidadModule } from './trazabilidad/trazabilidad.module';
import { opcionesBaseDatos } from './common/bd-config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => opcionesBaseDatos((k) => config.get<string>(k)),
    }),
    CommonModule,
    NotificacionesModule,
    AuthModule,
    UsuariosModule,
    TrazabilidadModule,
    CategoriasModule,
    CaracterizacionModule,
    EvidenciasModule,
    OfertasModule,
    PeticionesModule,
    EmparejamientoModule,
    AsignacionesModule,
    PlazosModule,
    LocalModule,
    TareasModule,
    AnaliticaModule,
    HealthModule,
  ],
  providers: [
    // Orden importante: primero autentica, luego autoriza.
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
