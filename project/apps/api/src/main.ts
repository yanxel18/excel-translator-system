import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaFactory } from '@nestjs/graphql';
import { createHandler } from 'graphql-http/lib/use/express';
import { AppModule } from './app.module';
import { ProductSurfacesResolver } from './modules/product-surfaces/graphql.resolver';
import { AuthenticationService } from './modules/authentication/authentication.service';

async function bootstrap() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') || ['http://localhost:5173'], credentials: true });
  const basePath = (process.env.BASE_PATH || '/excel-convert').replace(/^\/+|\/+$/g, '');
  const graphqlPath = `${basePath ? `/${basePath}` : ''}/graphql`;
  app.setGlobalPrefix(basePath);
  app.getHttpAdapter().getInstance().get(`/${basePath}`, (_req, res) => res.status(200).json({ status: 'ok', service: 'translator-api' }));
  const schema = await app.get(GraphQLSchemaFactory).create([ProductSurfacesResolver]);
  const resolver = app.get(ProductSurfacesResolver);
  const authentication = app.get(AuthenticationService);
  app.use(graphqlPath, async (req, res, next) => {
    const token = (req.headers.authorization as string | undefined)?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ message: 'A bearer token is required.' });
    try { (req as any).user = await authentication.verifySession(token); next(); }
    catch { return res.status(401).json({ message: 'Session is invalid or expired.' }); }
  });
  app.use(graphqlPath, createHandler({
    schema,
    context: (req) => ({ req }),
    rootValue: {
      history: (_root, args, context) => resolver.history(context, args.cursor),
      profile: (_root, _args, context) => resolver.profile(context),
      notifications: (_root, args, context) => resolver.notifications(context, args.cursor),
      changelog: (_root, args) => resolver.changelog(args.cursor),
      preview: (_root, args, context) => resolver.preview(context, args.jobId, args.version),
      downloadUrl: (_root, args, context) => resolver.downloadUrl(context, args.jobId),
      deleteHistoryItem: (_root, args, context) => resolver.deleteHistoryItem(context, args.id),
      updateProfile: (_root, args, context) => resolver.updateProfile(context, args.fullName, args.email),
      markNotificationRead: (_root, args, context) => resolver.markNotificationRead(context, args.id),
    },
  }));
  await app.listen(Number(process.env.PORT) || 3000, '0.0.0.0');
}
bootstrap();
