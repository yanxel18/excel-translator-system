import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { installRequestBodyParsers } from "./common/request-body-parsers";
import { normalizeBasePath } from "./config/base-path";
import { mountProductSurfacesGraphql } from "./modules/product-surfaces/graphql-http";

async function bootstrap() {
  if (!process.env.JWT_SECRET)
    throw new Error("JWT_SECRET must be configured.");
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL must be configured.");
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableShutdownHooks();
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(",") || ["http://localhost:5173"],
    credentials: true,
  });
  installRequestBodyParsers(app);
  const basePath = normalizeBasePath(process.env.BASE_PATH);
  app.setGlobalPrefix(basePath.replace(/^\//, ""));
  app
    .getHttpAdapter()
    .getInstance()
    .get(basePath || "/", (_req, res) =>
      res.status(200).json({ status: "ok", service: "translator-api" }),
    );
  await mountProductSurfacesGraphql(app);
  await app.listen(Number(process.env.PORT) || 3000, "0.0.0.0");
}
bootstrap();
