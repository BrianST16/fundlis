import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Actual, Publico } from './decoradores';
import { UsuarioActual } from './auth.types';

class LoginGoogleDto {
  @IsString()
  @MinLength(20, { message: 'El credential de Google no parece válido.' })
  credential: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Recibe el ID token de Google Identity Services y devuelve el JWT propio. */
  @Publico()
  @Post('google')
  @HttpCode(200)
  async google(@Body() dto: LoginGoogleDto) {
    return this.auth.iniciarSesion(dto.credential);
  }

  /** Perfil y roles vigentes, releidos de la BD. */
  @Get('yo')
  async yo(@Actual() actual: UsuarioActual) {
    return this.auth.perfilVigente(actual.sub);
  }

  /** La sesion es un JWT sin estado: el cierre lo hace el cliente al
   *  descartar el token. Se expone para dejar el gesto explicito. */
  @Post('salir')
  @HttpCode(200)
  salir() {
    return { mensaje: 'Sesión cerrada. Descarta el token en el cliente.' };
  }
}
