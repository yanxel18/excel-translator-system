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
import { Request, Response } from "express";
import multer = require("multer");
import { lastValueFrom, Observable, of } from "rxjs";
import { UploadAdmissionService } from "./upload-admission.service";
import { FileUploadService } from "./file-upload.service";

@Injectable()
export class UploadAdmissionInterceptor
  implements NestInterceptor<unknown, unknown>
{
  constructor(
    private readonly admission: UploadAdmissionService,
    private readonly uploads: FileUploadService,
    @Inject(MULTER_MODULE_OPTIONS) private readonly options: multer.Options,
  ) {}

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
    let reception:
      | Awaited<ReturnType<FileUploadService["createReception"]>>
      | undefined;
    try {
      const http = context.switchToHttp();
      reception = await this.uploads.createReception();
      const receive = multer({
        ...this.options,
        storage: reception.storage,
        limits: {
          ...this.options.limits,
          fileSize: reception.maxBytes,
          files: 1,
        },
      }).single("file");
      await new Promise<void>((resolve, reject) => {
        receive(
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
      try {
        await reception?.cleanup();
      } finally {
        release();
      }
    }
  }
}
