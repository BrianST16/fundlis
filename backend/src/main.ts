import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const log = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.useBodyParser('json', { limit: '5mb' });

  app.setGlobalPrefix('api');

  // CORS restringido a los origenes declarados. Sin comodines.
  const origenes = (config.get<string>('CORS_ORIGINS') || 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origenes,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  });

  // Toda entrada pasa por validacion y se descartan campos no declarados.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const puerto = Number(config.get<string>('PORT')) || 3000;
  await app.listen(puerto);
  log.log(`API escuchando en http://localhost:${puerto}/api`);
  log.log(`Salud: http://localhost:${puerto}/api/salud`);
  log.log(`CORS permitido para: ${origenes.join(', ')}`);
}

bootstrap();
