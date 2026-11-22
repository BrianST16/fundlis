import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decoradores';
import { Rol } from '../common/enums';
import { AnaliticaService } from './analitica.service';

/**
 * Pilar C. Solo el personal del LIS (auxiliar o administrador): los
 * rankings incluyen identidades, que invitados, estudiantes y donadores no
 * pueden ver (D-06). No incluye caracterizacion sensible.
 */
@Controller('analitica')
@Roles(Rol.AUXILIAR_LIS)
export class AnaliticaController {
  constructor(private readonly servicio: AnaliticaService) {}

  @Get('indicadores')
  indicadores() {
    return this.servicio.indicadores();
  }

  @Get('ranking/estudiantes')
  rankingEstudiantes() {
    return this.servicio.rankingEstudiantes();
  }

  @Get('ranking/donadores')
  rankingDonadores() {
    return this.servicio.rankingDonadores();
  }

  @Get('alertas')
  alertas() {
    return this.servicio.alertas();
  }
}
