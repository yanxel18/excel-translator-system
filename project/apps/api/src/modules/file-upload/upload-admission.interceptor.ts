import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { MULTER_MODULE_OPTIONS } from "@nestjs/platform-express/multer/files.constants";
import { transformException } from "@nestjs/platform-express/multer/multer/multer.utils";
import { multerExceptions } from "@nestjs/platform-express/multer/multer/multer.constants";
import { Request, RequestHandler, Response } from "express";
import multer = require("multer");
import { lastValueFrom, Observable, of } from "rxjs";
import { UploadAdmissionService } from "./upload-admission.service";

@Injectable()
export class UploadAdmissionInterceptor
  implements NestInterceptor<unknown, unknown>
{
  private readonly receive: RequestHandler;

  constructor(
    private readonly admission: UploadAdmissionService,
    @Inject(MULTER_MODULE_OPTIONS) options: multer.Options,
  ) {
    this.receive = multer({
      ...options,
      limits: { ...options.limits, fileSize: 50 * 1024 * 1024, files: 1 },
    }).single("file");
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Promise<Observable<unknown>> {
    let release: () => void;
    try {
      release = this.admission.acquire();
    } catch (error) {
      if (error instanceof ConflictException)
        context
          .switchToHttp()
          .getResponse<Response>()
          .setHeader("Retry-After", "1");
      throw error;
    }
    try {
      const http = context.switchToHttp();
      await new Promise<void>((resolve, reject) => {
        this.receive(
          http.getRequest<Request>(),
          http.getResponse<Response>(),
          (error: unknown) => {
            if (error instanceof multer.MulterError)
              // Nest 10 maps message text, while Multer 2.5 changes some wording.
              reject(
                transformException(new Error(multerExceptions[error.code])),
              );
            else if (error instanceof Error) reject(transformException(error));
            else if (error) reject(error);
            else resolve();
          },
        );
      });
      // Await the operation, not response teardown: disconnected clients may leave validation running.
      return of(await lastValueFrom(next.handle()));
    } finally {
      release();
    }
  }
}
