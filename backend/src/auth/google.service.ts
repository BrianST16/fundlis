import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

/** Identidad externa comprobada contra Google. */
export interface IdentidadGoogle {
  sub: string;
  email: string;
  nombre: string;
  dominioHospedado?: string;
}

/**
 * Verificacion del ID token de Google EN EL SERVIDOR.
 *
 * Todo lo que decide permisos sale de este token verificado: nunca de
 * campos que el navegador envie aparte (correo, dominio o rol).
 */
@Injectable()
export class GoogleService {
  private readonly log = new Logger(GoogleService.name);
  private readonly cliente: OAuth2Client;
  private readonly clientId: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!this.clientId) {
      throw new Error('Falta GOOGLE_CLIENT_ID en las variables de entorno.');
    }
    this.cliente = new OAuth2Client(this.clientId);
  }

  async verificar(idToken: string): Promise<IdentidadGoogle> {
    let carga: TokenPayload;
    try {
      // verifyIdToken comprueba firma, iss, aud y exp.
      const ticket = await this.cliente.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      carga = ticket.getPayload();
    } catch (e: any) {
      this.log.warn(`ID token rechazado: ${e?.message}`);
      throw new UnauthorizedException('El token de Google no es válido.');
    }

    if (!carga) {
      throw new UnauthorizedException('El token de Google no trae información.');
    }
    if (!carga.email) {
      throw new UnauthorizedException('El token de Google no incluye correo.');
    }
    if (carga.email_verified !== true) {
      throw new UnauthorizedException('El correo de la cuenta de Google no está verificado.');
    }

    return {
      sub: carga.sub,
      email: carga.email.toLowerCase().trim(),
      nombre: carga.name?.trim() || carga.email,
      dominioHospedado: carga.hd,
    };
  }
}
