import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  const origin =
    app.get(ConfigService).get<string>('CORS_ORIGIN')?.trim() ||
    'http://localhost:5173';
  app.enableCors({ origin });
  app.enableShutdownHooks();
}
