import type { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import express = require("express");

const jsonParser = express.json();
const urlencodedParser = express.urlencoded({ extended: true });
const rawChunkRoute = /(?:^|\/)upload-sessions\/[^/]+\/chunks\/[^/]+\/?$/;

/**
 * Keep Nest's normal JSON/urlencoded parsing, but leave authenticated raw chunk
 * requests untouched until their guard and admission check have run.
 */
export function installRequestBodyParsers(app: INestApplication): void {
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.method === "PUT" && rawChunkRoute.test(request.path)) {
      next();
      return;
    }
    jsonParser(request, response, (jsonError?: unknown) => {
      if (jsonError) {
        next(jsonError);
        return;
      }
      urlencodedParser(request, response, next);
    });
  });
}
