import { INestApplication } from "@nestjs/common";
import { json } from "express";
import { GraphQLSchemaFactory } from "@nestjs/graphql";
import { createHandler } from "graphql-http/lib/use/express";
import { AuthenticationService } from "../authentication/authentication.service";
import { normalizeBasePath, pathAtBase } from "../../config/base-path";
import { ProductSurfacesResolver } from "./graphql.resolver";

export async function mountProductSurfacesGraphql(
  app: INestApplication,
): Promise<void> {
  const graphqlPath = pathAtBase(
    normalizeBasePath(process.env.BASE_PATH),
    "graphql",
  );
  const schema = await app
    .get(GraphQLSchemaFactory)
    .create([ProductSurfacesResolver]);
  const resolver = app.get(ProductSurfacesResolver);
  const authentication = app.get(AuthenticationService);

  // Nest detects registered parsers by name, so a scoped parser disables its global JSON parser.
  app.use(json());
  app.use(graphqlPath, async (req, res, next) => {
    const token = (req.headers.authorization as string | undefined)?.match(
      /^Bearer\s+(.+)$/i,
    )?.[1];
    if (!token)
      return res.status(401).json({ message: "A bearer token is required." });
    try {
      (req as any).user = await authentication.verifySession(token);
      next();
    } catch {
      return res
        .status(401)
        .json({ message: "Session is invalid or expired." });
    }
  });
  app.use(graphqlPath, (req, res, next) => {
    const allowed = new Set([
      "query",
      "variables",
      "operationName",
      "extensions",
    ]);
    const unknownBodyField =
      req.method === "POST" &&
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body) &&
      Object.keys(req.body).some((key) => !allowed.has(key));
    const url = new URL(
      req.originalUrl,
      `http://${req.headers.host || "localhost"}`,
    );
    const unknownQueryField =
      req.method === "GET" &&
      Array.from(url.searchParams.keys()).some((key) => !allowed.has(key));
    if (unknownBodyField || unknownQueryField)
      return res
        .status(400)
        .json({ errors: [{ message: "Unexpected GraphQL request field." }] });
    return next();
  });
  app.use(
    graphqlPath,
    createHandler({
      schema,
      context: (req) => ({ req: req.raw }),
      rootValue: {
        history: (args, context) => resolver.history(context, args.cursor),
        profile: (_args, context) => resolver.profile(context),
        notifications: (args, context) =>
          resolver.notifications(context, args.cursor),
        changelog: (args) => resolver.changelog(args.cursor),
        preview: (args, context) =>
          resolver.preview(context, args.jobId, args.version),
        downloadUrl: (args, context) =>
          resolver.downloadUrl(context, args.jobId),
        deleteHistoryItem: (args, context) =>
          resolver.deleteHistoryItem(context, args.id),
        updateProfile: (args, context) =>
          resolver.updateProfile(context, args.fullName, args.email),
        markNotificationRead: (args, context) =>
          resolver.markNotificationRead(context, args.id),
      },
    }),
  );
}
