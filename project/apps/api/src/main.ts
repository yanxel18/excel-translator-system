import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') || ['http://localhost:5173'], credentials: true });
  const basePath = (process.env.BASE_PATH || '/excel-convert').replace(/^\/+|\/+$/g, '');
  app.setGlobalPrefix(basePath);
  app.getHttpAdapter().getInstance().get(`/${basePath}`, (_req, res) => res.status(200).json({ status: 'ok', service: 'translator-api' }));
  await app.listen(Number(process.env.PORT) || 3000, '0.0.0.0');
}
bootstrap();
