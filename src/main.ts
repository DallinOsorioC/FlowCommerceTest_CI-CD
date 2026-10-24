import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './common/config/cors';
import { isSwaggerEnabled, trustProxySetting } from './common/config/http';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap(): Promise<void> {
  // rawBody es obligatorio para verificar X-Hub-Signature-256 de WhatsApp:
  // la firma se calcula sobre el buffer original, no sobre el JSON parseado.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Detrás de un proxy (Render, Railway, Nginx…) la IP real viene en
  // X-Forwarded-For; sin esto, el rate limiting vería la IP del proxy y
  // limitaría a todos los usuarios a la vez. Ver TRUST_PROXY en .env.example.
  const trustProxy = trustProxySetting(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  // Cabeceras de seguridad HTTP (X-Content-Type-Options, X-Frame-Options,
  // Strict-Transport-Security…). La política CSP por defecto rompe la UI de
  // Swagger, así que en /docs se usa helmet sin CSP.
  const secureHeaders = helmet();
  const docsHeaders = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/docs')
      ? docsHeaders(req, res, next)
      : secureHeaders(req, res, next),
  );

  app.setGlobalPrefix('api');

  // CORS con credenciales: el frontend vive en otro origen y la sesión viaja en
  // una cookie httpOnly, así que el navegador solo la envía si el origen está
  // en esta lista y la respuesta lleva Access-Control-Allow-Credentials.
  const corsOrigins = parseCorsOrigins(
    process.env.CORS_ORIGINS,
    process.env.APP_URL,
  );
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger expone el mapa completo de la API: en producción solo se monta si
  // se pide explícitamente con SWAGGER_ENABLED=true.
  if (isSwaggerEnabled(process.env)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Flowcommerce API')
      .setDescription('Backend API for Flowcommerce')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
