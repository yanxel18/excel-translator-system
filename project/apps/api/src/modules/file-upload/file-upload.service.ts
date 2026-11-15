import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createWriteStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { StorageEngine } from "multer";
import { TextExtractionService } from "../text-extraction/text-extraction.service";
import { ApplicationSettingsService } from "../application-settings/application-settings.service";

@Injectable()
export class FileUploadService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly uploadDir = join(
    resolve(process.env.DATA_DIR || join(process.cwd(), "data")),
    "legacy-uploads",
  );

  constructor(
    private readonly extraction: TextExtractionService,
    private readonly settings: ApplicationSettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await mkdir(this.uploadDir, { recursive: true, mode: 0o700 });
      const root = await lstat(this.uploadDir);
      if (!root.isDirectory() || root.isSymbolicLink())
        throw new Error("Private upload storage must be a directory, not a link.");
      await chmod(this.uploadDir, 0o700);
      // All module initializers, including the database singleton lock, finish first.
      for (const entry of await readdir(this.uploadDir, { withFileTypes: true })) {
        if (entry.isDirectory() && /^receive-[A-Za-z0-9]{6}$/.test(entry.name))
          await rm(join(this.uploadDir, entry.name), { recursive: true });
      }
    } catch (error) {
      throw this.storageFailure(error);
    }
  }

  private storageFailure(error: unknown): ServiceUnavailableException {
    this.logger.error(
      "Workbook upload storage failed.",
      error instanceof Error ? error.stack : String(error),
    );
    return new ServiceUnavailableException(
      "Workbook upload storage is unavailable. Retry after storage is restored.",
      { cause: error },
    );
  }

  async createReception() {
    const { maxUploadSizeMb } = await this.settings.getSettings();
    if (
      !Number.isInteger(maxUploadSizeMb) ||
      maxUploadSizeMb < 1 ||
      maxUploadSizeMb > 50
    ) {
      this.logger.error("Workbook upload limit settings are outside the supported range.");
      throw new ServiceUnavailableException("Workbook upload limit settings are invalid.");
    }
    let directory: string;
    try {
      directory = await mkdtemp(join(this.uploadDir, "receive-"));
    } catch (error) {
      throw this.storageFailure(error);
    }
    const writes = new Map<string, Promise<void>>();
    const streams = new Set<Readable>();
    const remove = async (path: string) => {
      const writing = writes.get(path);
      if (!writing)
        throw new Error("Refusing to remove an unowned upload path.");
      await Promise.allSettled([writing]);
      try {
        await unlink(path);
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw this.storageFailure(error);
      }
    };
    const storage: StorageEngine = {
      _handleFile: (req, file, callback) => {
        const filename = `${randomUUID()}.xlsx`;
        const path = join(directory, filename);
        file.path = path;
        const output = createWriteStream(path, { flags: "wx", mode: 0o600 });
        let storageError: Error | undefined;
        let receiveError: Error | undefined;
        file.stream.once("error", (error) => { receiveError = error; });
        output.once("error", (error) => {
          if (receiveError !== error) storageError = error;
        });
        const abort = () =>
          file.stream.destroy(new Error("Workbook receive interrupted."));
        const close = () => {
          if (!req.complete) abort();
        };
        req.once("aborted", abort);
        req.once("close", close);
        streams.add(file.stream);
        const writing = pipeline(file.stream, output);
        writes.set(path, writing);
        if (req.aborted || req.destroyed) abort();
        void writing.then(
          () =>
            callback(null, {
              destination: directory,
              filename,
              path,
              size: output.bytesWritten,
            }),
          (error: unknown) =>
            callback(storageError ? this.storageFailure(storageError) : error),
        ).finally(() => {
          req.removeListener("aborted", abort);
          req.removeListener("close", close);
          streams.delete(file.stream);
        });
      },
      _removeFile: (_req, file, callback) => {
        void remove(file.path).then(() => callback(null), callback);
      },
    };
    return {
      storage,
      maxBytes: maxUploadSizeMb * 1024 * 1024,
      cleanup: async () => {
        for (const stream of streams) stream.destroy();
        await Promise.allSettled(writes.values());
        try {
          await rm(directory, { recursive: true });
        } catch (error) {
          throw this.storageFailure(error);
        }
      },
    };
  }

  async validateFile(file?: Express.Multer.File): Promise<boolean> {
    const { maxUploadSizeMb } = await this.settings.getSettings();
    return (await this.validateFileWithLimit(file, maxUploadSizeMb)) !== null;
  }

  private async validateFileWithLimit(
    file: Pick<Express.Multer.File, "path" | "buffer" | "originalname" | "size"> | undefined,
    maxUploadSizeMb: number,
  ): Promise<string[] | null> {
    if (
      !file ||
      (!file.path && !Buffer.isBuffer(file.buffer)) ||
      !file.originalname?.toLowerCase().endsWith(".xlsx")
    )
      return null;
    if (file.size > maxUploadSizeMb * 1024 * 1024) return null;
    let bytes: Buffer;
    if (file.path) {
      try {
        bytes = await readFile(file.path);
      } catch (error) {
        throw this.storageFailure(error);
      }
    } else bytes = file.buffer;
    const zip = await this.extraction.openWorkbook(bytes, true);
    return (await this.extraction.getWorksheetParts(zip)).map(({ name }) => name);
  }

  async validateSessionWorkbook(path: string, fileName: string, fileSize: number): Promise<string[]> {
    const sheets = await this.validateFileWithLimit(
      { path, originalname: fileName, size: fileSize, buffer: Buffer.alloc(0) },
      50,
    );
    if (!sheets)
      throw new BadRequestException("Upload must be a valid XLSX workbook.");
    if (!sheets.length)
      throw new BadRequestException("The workbook does not contain any worksheets.");
    return sheets;
  }

  async uploadFile(file: Express.Multer.File) {
    const { maxUploadSizeMb } = await this.settings.getSettings();
    const availableSheets = await this.validateFileWithLimit(
      file,
      maxUploadSizeMb,
    );
    if (!file?.path || !availableSheets)
      throw new BadRequestException(
        `Upload must be a valid XLSX workbook no larger than ${maxUploadSizeMb} MB.`,
      );
    return {
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
      uploadedAt: new Date(),
      path: file.path,
      availableSheets,
    };
  }
}
