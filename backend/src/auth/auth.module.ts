import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario, UsuarioRol } from '../entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, UsuarioRol]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32) {
          throw new Error(
            'JWT_SECRET debe existir y tener al menos 32 caracteres. Genera uno con: openssl rand -hex 48',
          );
        }
        return {
          secret,
          signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '8h') as any },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

