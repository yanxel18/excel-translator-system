import { INestApplication } from '@nestjs/common';
import { GraphQLSchemaFactory } from '@nestjs/graphql';
import { createHandler } from 'graphql-http/lib/use/express';
import { AuthenticationService } from '../authentication/authentication.service';
import { normalizeBasePath, pathAtBase } from '../../config/base-path';
import { ProductSurfacesResolver } from './graphql.resolver';

export async function mountProductSurfacesGraphql(app: INestApplication): Promise<void> {
  const graphqlPath = pathAtBase(normalizeBasePath(process.env.BASE_PATH), 'graphql');
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
}
