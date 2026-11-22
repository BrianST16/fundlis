import { Controller, Get, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Publico } from '../auth/decoradores';

/** Endpoint de salud exigido por el criterio de "tres componentes
 *  independientes": informa si la API responde y si ve la base de datos.
 *
 *  Es publico, asi que NO devuelve el mensaje de error del motor (puede
 *  revelar servidor, instancia o usuario de BD). El detalle va al log. */
@Controller('salud')
export class HealthController {
  private readonly log = new Logger(HealthController.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Publico()
  @Get()
  async estado() {
    let bd = 'desconectada';
    try {
      await this.ds.query('SELECT 1');
      bd = 'conectada';
    } catch (e: any) {
      this.log.warn(`La verificacion de BD fallo: ${e?.message ?? 'error desconocido'}`);
    }
    return {
      servicio: 'lis-dona-backend',
      estado: bd === 'conectada' ? 'ok' : 'degradado',
      baseDatos: bd,
      hora: new Date().toISOString(),
    };
  }
}
