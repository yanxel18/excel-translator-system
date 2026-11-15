import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import type { IncomingMessage } from "node:http";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  readdir,
  rm,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { strictObject, requiredText, uuid } from "../../common/management-validation";
import type { Prisma, UploadSession } from "../../generated/prisma/client";
import { ApplicationSettingsService } from "../application-settings/application-settings.service";
import { PrismaService } from "../persistence/prisma.service";
import { UploadAdmissionService } from "./upload-admission.service";
import { FileUploadService } from "./file-upload.service";
import { DatabaseJobManagementService } from "../job-management/database-job-management.service";

export interface CreateUploadSessionInput {
  clientUploadId: string;
  fileName: string;
  fileSize: number;
  chunkHashes: string[];
}

export interface UploadSessionResponse {
  id: string;
  clientUploadId: string;
  fileName: string;
  fileSize: number;
  chunkHashes: string[];
  chunkSize: number;
  status: UploadSession["status"];
  bytesReceived: number;
  nextChunkIndex: number;
  expiresAt: string;
  jobId: string | null;
}

const CHUNK_SIZE = 1024 * 1024;
const STORAGE_CAPACITY = 1024 * CHUNK_SIZE;
const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_BATCH_SIZE = 20;
const MAX_STORAGE_ENTRIES = 512;
const MAX_STORAGE_DEPTH = 8;
const OWNER_MARKER = ".upload-session-owner";
const ASSEMBLED_FILE = "assembled.bin";
const TEMP_CHUNK_PATTERN = /^\.chunk-[0-9a-f-]{36}\.tmp$/;

@Injectable()
export class UploadSessionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(UploadSessionService.name);
  private readonly storageRoot = join(
    resolve(process.env.DATA_DIR || join(process.cwd(), "data")),
    "upload-sessions",
  );
  private cleanupTimer: NodeJS.Timeout | undefined;
  private sweepPromise: Promise<number> | undefined;
  private cleanupCursor: { expiresAt: Date; id: string } | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ApplicationSettingsService,
    private readonly admission: UploadAdmissionService,
    private readonly files: FileUploadService,
    private readonly jobs: DatabaseJobManagementService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureStorageRoot();
    await this.sweepExpiredSessions();
    this.cleanupTimer = setInterval(() => {
      void this.sweepExpiredSessions();
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await this.sweepPromise;
  }

  private parseInput(value: unknown): CreateUploadSessionInput {
    const input = strictObject(value, [
      "clientUploadId", "fileName", "fileSize", "chunkHashes",
    ]);
    const clientUploadId = uuid(input.clientUploadId).toLowerCase();
    const fileName = requiredText(input.fileName, "File name", 255, false);
    if (!/\.xlsx$/i.test(fileName) || /[\u0000-\u001f\u007f-\u009f/\\]/.test(fileName))
      throw new BadRequestException("File name must be an XLSX filename without paths or control characters.");
    const fileSize = input.fileSize;
    if (typeof fileSize !== "number" || !Number.isSafeInteger(fileSize) ||
        fileSize < 1 || fileSize > 50 * CHUNK_SIZE)
      throw new BadRequestException("File size must contain 1 to 50 MiB of bytes.");
    const chunkHashes = Array.isArray(input.chunkHashes) ? Array.from(input.chunkHashes) : null;
    if (!Array.isArray(chunkHashes) ||
        chunkHashes.length !== Math.ceil(fileSize / CHUNK_SIZE) ||
        !chunkHashes.every((hash: unknown): hash is string =>
          typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash)))
      throw new BadRequestException("Provide one lowercase SHA-256 hash for each ordered 1 MiB chunk.");
    return { clientUploadId, fileName, fileSize, chunkHashes };
  }

  async create(ownerId: string, value: unknown): Promise<UploadSession> {
    const input = this.parseInput(value);
    // Ensure settings exist without waiting for another pool connection inside the transaction.
    await this.settings.getSettings();
    return this.prisma.$transaction(async (tx) => {
      const [budget] = await tx.$queryRaw<{ reservedBytes: number }[]>`
        SELECT "reservedBytes" FROM "UploadStorageBudget" WHERE "id" = 'default' FOR UPDATE
      `;
      if (!budget) {
        this.logger.error("Upload storage budget is missing.");
        throw new ServiceUnavailableException("Upload storage reservations are unavailable.");
      }
      const { maxUploadSizeMb } = await tx.applicationSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      if (!Number.isInteger(maxUploadSizeMb) || maxUploadSizeMb < 1 || maxUploadSizeMb > 50) {
        this.logger.error("Upload limit settings are outside the supported range.");
        throw new ServiceUnavailableException("Workbook upload limit settings are invalid.");
      }
      const existing = await tx.uploadSession.findUnique({
        where: { ownerId_clientUploadId: { ownerId, clientUploadId: input.clientUploadId } },
      });
      if (existing) {
        if (existing.fileName !== input.fileName || existing.fileSize !== input.fileSize ||
            existing.chunkHashes.length !== input.chunkHashes.length ||
            existing.chunkHashes.some((hash, index) => hash !== input.chunkHashes[index]))
          throw new ConflictException({
            code: "UPLOAD_INTENT_CONFLICT",
            message: "This upload intent already belongs to different file metadata.",
          });
        const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
        if (existing.expiresAt <= now)
          throw new GoneException({ code: "UPLOAD_EXPIRED", message: "This upload recovery deadline has expired." });
        if ((existing.status === "RECEIVING" || existing.status === "FINALIZING") &&
            existing.fileSize > maxUploadSizeMb * CHUNK_SIZE)
          throw new PayloadTooLargeException({
            code: "UPLOAD_LIMIT_CHANGED",
            message: `The administrator's upload limit has been lowered to ${maxUploadSizeMb} MB. Cancel this upload or choose a smaller file.`,
          });
        return existing;
      }
      if (await tx.uploadSession.findFirst({
        where: { ownerId, OR: [{ status: { in: ["RECEIVING", "FINALIZING"] } }, { reservedBytes: { gt: 0 } }] },
      }))
        throw new ConflictException({
          code: "UPLOAD_SESSION_EXISTS",
          message: "Finish or cancel the account's existing upload before starting another.",
        });
      if (input.fileSize > maxUploadSizeMb * CHUNK_SIZE)
        throw new PayloadTooLargeException(`The administrator's upload limit is ${maxUploadSizeMb} MB.`);
      if (budget.reservedBytes + input.fileSize > STORAGE_CAPACITY)
        throw new ConflictException({
          code: "UPLOAD_CAPACITY_BUSY",
          message: "Temporary upload storage is fully reserved. Retry after capacity is released.",
        });
      const [{ createdAt }] = await tx.$queryRaw<{ createdAt: Date }[]>`
        SELECT clock_timestamp()::timestamptz(3) AS "createdAt"
      `;
      return tx.uploadSession.create({
        data: {
          ...input,
          ownerId,
          reservedBytes: input.fileSize,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        },
      });
    });
  }

  async getStatus(ownerId: string, value: unknown): Promise<UploadSessionResponse> {
    const id = uuid(value);
    const session = await this.findOwnedSession(ownerId, id);
    const [{ now }] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;
    if (session.status !== "COMPLETED" && session.expiresAt <= now)
      throw new GoneException({
        code: "UPLOAD_EXPIRED",
        message: "This upload recovery deadline has expired.",
      });
    if (session.status === "RECEIVING" || session.status === "FINALIZING")
      await this.assertWithinCurrentLimit(session.fileSize);
    return this.toPublicResponse(session);
  }

  async cancel(ownerId: string, value: unknown): Promise<UploadSessionResponse> {
    const id = uuid(value);
    const release = this.admission.acquire();
    try {
      const session = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "UploadSession"
          WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}
          FOR UPDATE
        `;
        if (!locked.length) throw new NotFoundException("Upload session not found.");
        let current = await tx.uploadSession.findUniqueOrThrow({ where: { id } });
        if (current.status === "RECEIVING" || current.status === "FINALIZING") {
          const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`
            SELECT clock_timestamp() AS now
          `;
          current = await tx.uploadSession.update({
            where: { id },
            data: {
              status: current.expiresAt <= now ? "EXPIRED" : "CANCELLED",
            },
          });
        }
        return current;
      });

      if (session.reservedBytes > 0) {
        await this.removeUncommittedPromotion(session);
        await this.removeSessionStorage(session.id);
        await this.releaseReservation(session.id);
      }
      return this.toPublicResponse(await this.findOwnedSession(ownerId, id));
    } finally {
      release();
    }
  }

  async complete(ownerId: string, value: unknown) {
    let id = uuid(value);
    const release = this.admission.acquire();
    try {
      let session = await this.findOwnedSession(ownerId, id);
      id = session.id;
      if (session.status === "COMPLETED") {
        if (session.reservedBytes > 0) {
          await this.removeSessionStorage(id);
          await this.releaseReservation(id);
        }
        try {
          return await this.jobs.getJob(session.completionJobId, ownerId);
        } catch (error) {
          if (error instanceof NotFoundException)
            throw new GoneException({
              code: "UPLOAD_COMPLETED_JOB_DELETED",
              message: "The completed upload's job was deleted and cannot be recreated.",
            });
          throw error;
        }
      }
      const [{ now }] = await this.prisma.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS now
      `;
      if (session.expiresAt <= now || session.status === "EXPIRED")
        throw new GoneException({ code: "UPLOAD_EXPIRED", message: "This upload recovery deadline has expired." });
      if (session.status !== "RECEIVING" && session.status !== "FINALIZING")
        throw new ConflictException({
          code: "UPLOAD_SESSION_NOT_ACTIVE",
          message: "This upload session is no longer active.",
        });
      if (session.bytesReceived !== session.fileSize)
        throw new ConflictException({ code: "UPLOAD_INCOMPLETE", message: "Upload all chunks before completion." });
      await this.assertWithinCurrentLimit(session.fileSize);
      const directory = await this.ensureSessionStorage(id);
      const spool = await this.reconcileSpool(directory, session);
      let sheets: string[];
      try {
        sheets = await this.files.validateSessionWorkbook(spool, session.fileName, session.fileSize);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        session = await this.prisma.uploadSession.update({
          where: { id },
          data: { status: "FAILED" },
        });
        await this.removeUncommittedPromotion(session);
        await this.removeSessionStorage(id);
        await this.releaseReservation(id);
        throw new UnprocessableEntityException({
          code: "UPLOAD_INVALID_WORKBOOK",
          message: "The uploaded workbook is invalid or contains no worksheets.",
        });
      }
      session = await this.lockForCompletion(ownerId, session);
      const destination = this.jobs.sourcePath(session.completionJobId);
      await this.promoteSessionSpool(spool, destination);
      const job = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ status: UploadSession["status"]; expiresAt: Date; now: Date }[]>`
          SELECT "status", "expiresAt", clock_timestamp() AS now FROM "UploadSession"
          WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId} FOR UPDATE
        `;
        const current = rows[0];
        if (!current) throw new NotFoundException("Upload session not found.");
        if (current.expiresAt <= current.now)
          throw new GoneException({ code: "UPLOAD_EXPIRED", message: "This upload recovery deadline has expired." });
        if (current.status !== "FINALIZING")
          throw new ConflictException({ code: "UPLOAD_SESSION_NOT_ACTIVE", message: "This upload session is no longer active." });
        const limits = await tx.$queryRaw<{ maxUploadSizeMb: number }[]>`
          SELECT "maxUploadSizeMb" FROM "ApplicationSettings" WHERE "id" = 'default' FOR SHARE
        `;
        const limit = limits[0]?.maxUploadSizeMb;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50)
          throw new ServiceUnavailableException("Workbook upload limit settings are invalid.");
        if (session.fileSize > limit * CHUNK_SIZE)
          throw new PayloadTooLargeException({
            code: "UPLOAD_LIMIT_CHANGED",
            message: `The administrator's upload limit has been lowered to ${limit} MB. Cancel this upload or choose a smaller file.`,
          });
        const created = await this.jobs.createSessionJob(tx, {
          id: session.completionJobId, ownerId, fileName: session.fileName,
          fileSize: session.fileSize, availableSheets: sheets,
        });
        const changed = await tx.$executeRaw`
          UPDATE "UploadSession" SET "status" = 'COMPLETED',
            "completedAt" = clock_timestamp(), "updatedAt" = clock_timestamp()
          WHERE "id" = ${id}::uuid AND "status" = 'FINALIZING'
            AND "expiresAt" > clock_timestamp()
        `;
        if (changed !== 1)
          throw new GoneException({ code: "UPLOAD_EXPIRED", message: "This upload recovery deadline has expired." });
        return created;
      });
      await this.removeSessionStorage(id);
      await this.releaseReservation(id);
      return job;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw this.storageFailure(error);
    } finally {
      release();
    }
  }

  private async lockForCompletion(ownerId: string, session: UploadSession): Promise<UploadSession> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: UploadSession["status"]; expiresAt: Date; now: Date }[]>`
        SELECT "status", "expiresAt", clock_timestamp() AS now FROM "UploadSession"
        WHERE "id" = ${session.id}::uuid AND "ownerId" = ${ownerId} FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException("Upload session not found.");
      if (current.expiresAt <= current.now)
        throw new GoneException({ code: "UPLOAD_EXPIRED", message: "This upload recovery deadline has expired." });
      if (current.status !== "RECEIVING" && current.status !== "FINALIZING")
        throw new ConflictException({ code: "UPLOAD_SESSION_NOT_ACTIVE", message: "This upload session is no longer active." });
      return tx.uploadSession.update({
        where: { id: session.id },
        data: { status: "FINALIZING" },
      });
    });
  }

  private async promoteSessionSpool(spool: string, destination: string): Promise<void> {
    try {
      await link(spool, destination);
    } catch (error) {
      if (!this.isCode(error, "EEXIST")) throw error;
      const [sourceInfo, destinationInfo] = await Promise.all([lstat(spool), lstat(destination)]);
      if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() ||
          !destinationInfo.isFile() || destinationInfo.isSymbolicLink() ||
          sourceInfo.dev !== destinationInfo.dev || sourceInfo.ino !== destinationInfo.ino)
        throw new Error("Existing job source does not belong to this upload session.");
    }
    await this.syncDirectory(resolve(destination, ".."));
  }

  private async removeUncommittedPromotion(session: UploadSession): Promise<void> {
    try {
      await this.removeUncommittedPromotionChecked(session);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw this.storageFailure(error);
    }
  }

  private async removeUncommittedPromotionChecked(session: UploadSession): Promise<void> {
    if (session.status === "COMPLETED") return;
    const destination = this.jobs.sourcePath(session.completionJobId);
    let destinationInfo;
    try {
      destinationInfo = await lstat(destination);
    } catch (error) {
      if (this.isCode(error, "ENOENT")) return;
      throw error;
    }
    if (await this.prisma.translationJob.findUnique({ where: { id: session.completionJobId } }))
      throw new Error("Refusing to remove a source belonging to an existing job.");
    const directory = await this.ensureSessionStorage(session.id);
    const sourceInfo = await lstat(join(directory, ASSEMBLED_FILE));
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() ||
        !destinationInfo.isFile() || destinationInfo.isSymbolicLink() ||
        sourceInfo.dev !== destinationInfo.dev || sourceInfo.ino !== destinationInfo.ino)
      throw new Error("Refusing to remove an unowned promoted workbook.");
    await unlink(destination);
    await this.syncDirectory(resolve(destination, ".."));
  }

  async receiveChunk(
    ownerId: string,
    sessionValue: unknown,
    indexValue: unknown,
    request: IncomingMessage,
  ): Promise<UploadSessionResponse> {
    const release = this.admission.acquire();
    try {
      let id: string;
      try {
        id = uuid(sessionValue);
      } catch {
        throw new BadRequestException({
          code: "UPLOAD_SESSION_ID",
          message: "Provide a valid upload session ID.",
        });
      }
      const index = this.parseChunkIndex(indexValue);
      const contentType = request.headers["content-type"];
      if (typeof contentType !== "string" ||
          contentType.trim().toLowerCase() !== "application/octet-stream")
        throw new UnsupportedMediaTypeException({
          code: "UPLOAD_CHUNK_CONTENT_TYPE",
          message: "Send each chunk as application/octet-stream raw bytes.",
        });

      const session = await this.findOwnedSession(ownerId, id);
      await this.assertChunkWritable(session, index);
      const expectedLength = this.chunkLength(session, index);
      const contentLength = request.headers["content-length"];
      if (contentLength !== undefined &&
          (typeof contentLength !== "string" ||
           !/^(0|[1-9][0-9]*)$/.test(contentLength) ||
           Number(contentLength) !== expectedLength))
        throw new BadRequestException({
          code: "UPLOAD_CHUNK_LENGTH",
          message: `Chunk ${index} must contain exactly ${expectedLength} bytes.`,
        });

      const directory = await this.ensureSessionStorage(session.id);
      await this.removeStaleChunkFiles(directory);
      const incoming = await this.receiveChunkBytes(request, expectedLength);
      if (createHash("sha256").update(incoming).digest("hex") !== session.chunkHashes[index])
        throw new UnprocessableEntityException({
          code: "UPLOAD_CHUNK_HASH_MISMATCH",
          message: `Chunk ${index} does not match its declared SHA-256 hash.`,
        });

      // Re-read persisted progress and limit after slow client I/O. Any tail
      // truncation below is based only on this fresh database state.
      const current = await this.findOwnedSession(ownerId, session.id);
      await this.assertChunkWritable(current, index);
      await this.assertWithinCurrentLimit(current.fileSize);
      if (index < current.nextChunkIndex) {
        const spool = await this.reconcileSpool(directory, current);
        const acknowledged = await this.readExactFileRange(
          spool,
          index * current.chunkSize,
          expectedLength,
        );
        if (!incoming.equals(acknowledged))
          throw new ConflictException({
            code: "UPLOAD_CHUNK_REPLAY_MISMATCH",
            message: `Chunk ${index} differs from the bytes already acknowledged.`,
          });
        return this.toPublicResponse(current);
      }

      if (index !== current.nextChunkIndex)
        throw this.chunkOrderError(current.nextChunkIndex);
      const spool = await this.reconcileSpool(directory, current);
      await this.appendChunk(
        incoming,
        spool,
        current.bytesReceived,
        directory,
      );
      const committed = await this.commitChunkProgress(
        ownerId,
        current,
        index,
        expectedLength,
      );
      return this.toPublicResponse(committed);
    } catch (error) {
      if (error instanceof HttpException) {
        const body = error.getResponse();
        if (
          error.getStatus() !== 503 ||
          (typeof body === "object" && body !== null && "code" in body)
        )
          throw error;
      }
      throw this.chunkStorageFailure(error);
    } finally {
      release();
    }
  }

  private parseChunkIndex(value: unknown): number {
    if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
      throw new BadRequestException({
        code: "UPLOAD_CHUNK_INDEX",
        message: "Chunk index must be a non-negative decimal integer.",
      });
    const index = Number(value);
    if (!Number.isSafeInteger(index))
      throw new BadRequestException({
        code: "UPLOAD_CHUNK_INDEX",
        message: "Chunk index is outside the supported range.",
      });
    return index;
  }

  private async assertChunkWritable(session: UploadSession, index: number): Promise<void> {
    const [{ now }] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;
    if (session.expiresAt <= now)
      throw new GoneException({
        code: "UPLOAD_EXPIRED",
        message: "This upload recovery deadline has expired.",
      });
    if (session.status === "EXPIRED")
      throw new GoneException({
        code: "UPLOAD_EXPIRED",
        message: "This upload recovery deadline has expired.",
      });
    if (session.status !== "RECEIVING")
      throw new ConflictException({
        code: "UPLOAD_SESSION_NOT_RECEIVING",
        message: "This upload session is not accepting chunks.",
      });
    if (index >= session.chunkHashes.length)
      throw new BadRequestException({
        code: "UPLOAD_CHUNK_INDEX",
        message: "Chunk index is outside the declared upload.",
      });
    if (index > session.nextChunkIndex)
      throw this.chunkOrderError(session.nextChunkIndex);
    await this.assertWithinCurrentLimit(session.fileSize);
  }

  private chunkOrderError(nextChunkIndex: number): ConflictException {
    return new ConflictException({
      code: "UPLOAD_CHUNK_ORDER",
      message: `Send the next unacknowledged chunk at index ${nextChunkIndex}.`,
    });
  }

  private chunkLength(session: UploadSession, index: number): number {
    return Math.min(
      session.chunkSize,
      session.fileSize - index * session.chunkSize,
    );
  }

  private async receiveChunkBytes(
    request: IncomingMessage,
    expectedLength: number,
  ): Promise<Buffer> {
    const bytes = Buffer.allocUnsafe(expectedLength);
    let received = 0;
    try {
      for await (const part of request.iterator({ destroyOnReturn: false })) {
        if (!Buffer.isBuffer(part))
          throw new BadRequestException({
            code: "UPLOAD_CHUNK_BODY",
            message: "Chunk body must be raw binary data.",
          });
        received += part.length;
        if (received > expectedLength)
          throw new BadRequestException({
            code: "UPLOAD_CHUNK_LENGTH",
            message: `Chunk body exceeds the exact ${expectedLength}-byte length.`,
          });
        part.copy(bytes, received - part.length);
      }
      if (received !== expectedLength)
        throw new BadRequestException({
          code: "UPLOAD_CHUNK_LENGTH",
          message: `Chunk body ended after ${received} bytes; exactly ${expectedLength} are required.`,
        });
      return bytes;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (request.aborted || !request.complete)
        throw new BadRequestException({
          code: "UPLOAD_CHUNK_INTERRUPTED",
          message: "Chunk reception was interrupted; retry this chunk after checking session progress.",
        });
      throw error;
    }
  }

  private async removeStaleChunkFiles(directory: string): Promise<void> {
    for (const name of await readdir(directory)) {
      if (!TEMP_CHUNK_PATTERN.test(name)) continue;
      const file = join(directory, name);
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink())
        throw new Error("Temporary chunk path is not a regular owned file.");
      await unlink(file);
    }
  }

  private async reconcileSpool(
    directory: string,
    session: UploadSession,
  ): Promise<string> {
    const spool = join(directory, ASSEMBLED_FILE);
    let handle: FileHandle;
    let created = false;
    try {
      try {
        const info = await lstat(spool);
        if (!info.isFile() || info.isSymbolicLink())
          throw new Error("Assembled upload spool is not a regular file.");
        handle = await open(
          spool,
          fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW || 0),
        );
      } catch (error) {
        if (!this.isCode(error, "ENOENT") || session.bytesReceived !== 0)
          throw error;
        handle = await open(spool, "wx", 0o600);
        created = true;
      }
      try {
        const stat = await handle.stat();
        if (!stat.isFile())
          throw new Error("Assembled upload spool is not a regular file.");
        if (stat.size < session.bytesReceived)
          throw new Error("Committed upload prefix is missing from private storage.");
        if (stat.size > session.bytesReceived) {
          // This is safe only after loading the authoritative persisted offset above.
          await handle.truncate(session.bytesReceived);
          await handle.sync();
        }
        for (let index = 0; index < session.nextChunkIndex; index++) {
          const length = this.chunkLength(session, index);
          const bytes = await this.readHandleRange(handle, index * session.chunkSize, length);
          if (createHash("sha256").update(bytes).digest("hex") !== session.chunkHashes[index])
            throw new Error("Committed upload prefix failed its persisted SHA-256 check.");
        }
        if (created) await handle.sync();
      } finally {
        await handle.close();
      }
      return spool;
    } catch (error) {
      throw error;
    }
  }

  private async readExactFileRange(
    file: string,
    position: number,
    length: number,
  ): Promise<Buffer> {
    let handle: FileHandle | undefined;
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size < position + length)
        throw new Error("Upload chunk file is missing or unsafe.");
      handle = await open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
      return await this.readHandleRange(handle, position, length);
    } finally {
      await handle?.close();
    }
  }

  private async readHandleRange(
    handle: FileHandle,
    position: number,
    length: number,
  ): Promise<Buffer> {
    const bytes = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
      const result = await handle.read(bytes, read, length - read, position + read);
      if (result.bytesRead <= 0) throw new Error("Committed upload bytes are truncated.");
      read += result.bytesRead;
    }
    return bytes;
  }

  private async appendChunk(
    bytes: Buffer,
    spool: string,
    offset: number,
    directory: string,
  ): Promise<void> {
    let destination: FileHandle | undefined;
    try {
      destination = await open(spool, fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW || 0));
      const spoolInfo = await destination.stat();
      if (!spoolInfo.isFile() || spoolInfo.size !== offset)
        throw new Error("Assembled upload spool changed before append.");
      let written = 0;
      while (written < bytes.length) {
        const result = await destination.write(bytes, written, bytes.length - written, offset + written);
        if (result.bytesWritten <= 0) throw new Error("Assembled upload write made no progress.");
        written += result.bytesWritten;
      }
      await destination.sync();
      await this.syncDirectory(directory);
    } finally {
      await destination?.close();
    }
  }

  private async syncDirectory(directory: string): Promise<void> {
    let handle: FileHandle | undefined;
    try {
      handle = await open(directory, fsConstants.O_RDONLY);
      await handle.sync();
    } catch (error) {
      if (
        process.platform === "win32" &&
        error instanceof Error &&
        "code" in error &&
        ["EINVAL", "EISDIR", "EPERM", "ENOTSUP"].includes(String(error.code))
      )
        return;
      throw error;
    } finally {
      await handle?.close();
    }
  }

  private async commitChunkProgress(
    ownerId: string,
    session: UploadSession,
    index: number,
    length: number,
  ): Promise<UploadSession> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{
        id: string;
        status: UploadSession["status"];
        bytesReceived: number;
        nextChunkIndex: number;
        expiresAt: Date;
        now: Date;
      }[]>`
        SELECT "id", "status", "bytesReceived", "nextChunkIndex", "expiresAt",
          clock_timestamp() AS "now"
        FROM "UploadSession"
        WHERE "id" = ${session.id}::uuid AND "ownerId" = ${ownerId}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException("Upload session not found.");
      if (current.status !== "RECEIVING")
        throw new ConflictException({
          code: "UPLOAD_SESSION_NOT_RECEIVING",
          message: "This upload session is not accepting chunks.",
        });
      if (current.expiresAt <= current.now)
        throw new GoneException({
          code: "UPLOAD_EXPIRED",
          message: "This upload recovery deadline has expired.",
        });
      if (current.nextChunkIndex !== index || current.bytesReceived !== session.bytesReceived)
        throw this.chunkOrderError(current.nextChunkIndex);
      const limits = await tx.$queryRaw<{ maxUploadSizeMb: number }[]>`
        SELECT "maxUploadSizeMb" FROM "ApplicationSettings"
        WHERE "id" = 'default' FOR SHARE
      `;
      if (!limits[0] || !Number.isInteger(limits[0].maxUploadSizeMb) ||
          limits[0].maxUploadSizeMb < 1 || limits[0].maxUploadSizeMb > 50)
        throw new ServiceUnavailableException("Workbook upload limit settings are invalid.");
      if (session.fileSize > limits[0].maxUploadSizeMb * CHUNK_SIZE)
        throw new PayloadTooLargeException({
          code: "UPLOAD_LIMIT_CHANGED",
          message: `The administrator's upload limit has been lowered to ${limits[0].maxUploadSizeMb} MB. Cancel this upload or choose a smaller file.`,
        });
      const updated = await tx.$executeRaw`
        UPDATE "UploadSession"
        SET "bytesReceived" = ${session.bytesReceived + length},
            "nextChunkIndex" = ${index + 1},
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${session.id}::uuid AND "ownerId" = ${ownerId}
          AND "status" = 'RECEIVING' AND "nextChunkIndex" = ${index}
          AND "bytesReceived" = ${session.bytesReceived}
          AND "expiresAt" > clock_timestamp()
      `;
      if (updated !== 1) {
        const [{ now: checkedAt }] = await tx.$queryRaw<{ now: Date }[]>`
          SELECT clock_timestamp() AS now
        `;
        if (current.expiresAt <= checkedAt)
          throw new GoneException({
            code: "UPLOAD_EXPIRED",
            message: "This upload recovery deadline has expired.",
          });
        throw this.chunkOrderError(current.nextChunkIndex);
      }
      return tx.uploadSession.findUniqueOrThrow({ where: { id: session.id } });
    });
  }

  /**
   * Prepare the private, ID-keyed directory used by future chunk reception.
   * The returned path is internal and must never be serialized to an API client.
   */
  async ensureSessionStorage(value: unknown): Promise<string> {
    const requestedId = uuid(value);
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: requestedId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException("Upload session not found.");
    const id = session.id;
    await this.ensureStorageRoot();
    const directory = join(this.storageRoot, id);
    let created = false;
    try {
      await mkdir(directory, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (!this.isCode(error, "EEXIST")) throw this.storageFailure(error);
    }
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("Session storage is not a private directory.");
      const resolvedDirectory = await realpath(directory);
      if (resolvedDirectory !== join(await this.checkedStorageRoot(), id))
        throw new Error("Session storage escaped its private root.");
      const marker = join(directory, OWNER_MARKER);
      if (created) {
        await this.writeOwnerMarker(marker, id);
      } else {
        try {
          const markerInfo = await lstat(marker);
          if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || markerInfo.size > 64)
            throw new Error("Session storage ownership marker is unsafe.");
          if ((await readFile(marker, "utf8")) !== `${id}\n`)
            throw new Error("Session storage ownership marker does not match.");
        } catch (error) {
          if (!this.isCode(error, "ENOENT")) throw error;
          // Recover a crash between making an empty directory and writing its marker.
          if ((await readdir(directory)).length !== 0) throw error;
          await this.writeOwnerMarker(marker, id);
        }
      }
      await chmod(directory, 0o700);
      await chmod(marker, 0o600);
      return directory;
    } catch (error) {
      throw this.storageFailure(error);
    }
  }

  /**
   * Process at most one bounded batch. The shared admission lease prevents
   * cleanup from racing an in-process receive, validation, or cancellation.
   */
  sweepExpiredSessions(): Promise<number> {
    if (this.sweepPromise) return this.sweepPromise;
    this.sweepPromise = this.sweepExpiredSessionsOnce().finally(() => {
      this.sweepPromise = undefined;
    });
    return this.sweepPromise;
  }

  private async sweepExpiredSessionsOnce(): Promise<number> {
    let release: (() => void) | undefined;
    try {
      release = this.admission.acquire();
    } catch (error) {
      // Another admitted upload owns the shared slot; a later bounded sweep retries.
      if (error instanceof ConflictException) return 0;
      this.logger.error("Could not acquire upload cleanup admission.", error instanceof Error ? error.stack : String(error));
      return 0;
    }
    let completed = 0;
    try {
      const [{ now }] = await this.prisma.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS now
      `;
      const eligibleSessions: Prisma.UploadSessionWhereInput = {
        OR: [
          { status: { in: ["RECEIVING", "FINALIZING"] }, expiresAt: { lte: now } },
          { status: { in: ["COMPLETED", "CANCELLED", "EXPIRED", "FAILED"] }, reservedBytes: { gt: 0 } },
        ],
      };
      const findCandidates = (cursor?: { expiresAt: Date; id: string }) =>
        this.prisma.uploadSession.findMany({
          where: cursor
            ? {
                AND: [
                  eligibleSessions,
                  {
                    OR: [
                      { expiresAt: { gt: cursor.expiresAt } },
                      { expiresAt: cursor.expiresAt, id: { gt: cursor.id } },
                    ],
                  },
                ],
              }
            : eligibleSessions,
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
          take: CLEANUP_BATCH_SIZE,
          select: { id: true, expiresAt: true },
        });

      // The immutable ordering key lets failed paths yield to later candidates.
      let candidates = await findCandidates(this.cleanupCursor);
      if (candidates.length === 0 && this.cleanupCursor) {
        this.cleanupCursor = undefined;
        candidates = await findCandidates();
      }
      const lastCandidate = candidates.at(-1);
      this.cleanupCursor = lastCandidate
        ? { expiresAt: lastCandidate.expiresAt, id: lastCandidate.id }
        : undefined;

      for (const candidate of candidates) {
        try {
          if (await this.cleanupSession(candidate.id)) completed++;
        } catch (error) {
          this.logger.error(
            `Upload session cleanup failed for ${candidate.id}; reservation retained.`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } catch (error) {
      this.logger.error("Upload session cleanup sweep failed.", error instanceof Error ? error.stack : String(error));
    } finally {
      release();
    }
    return completed;
  }

  private async cleanupSession(id: string): Promise<boolean> {
    const session = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "UploadSession" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (!locked.length) return null;
      let current = await tx.uploadSession.findUniqueOrThrow({ where: { id } });
      if (current.status === "RECEIVING" || current.status === "FINALIZING") {
        const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`
          SELECT clock_timestamp() AS now
        `;
        if (current.expiresAt > now) return null;
        current = await tx.uploadSession.update({
          where: { id },
          data: { status: "EXPIRED" },
        });
      }
      return current.reservedBytes > 0 ? current : null;
    });
    if (!session) return false;
    await this.removeUncommittedPromotion(session);
    await this.removeSessionStorage(id);
    await this.releaseReservation(id);
    return true;
  }

  private async releaseReservation(id: string): Promise<void> {
    await this.prisma.uploadSession.updateMany({
      where: { id, reservedBytes: { gt: 0 } },
      data: { reservedBytes: 0 },
    });
  }

  private async findOwnedSession(ownerId: string, id: string): Promise<UploadSession> {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id, ownerId },
    });
    if (!session) throw new NotFoundException("Upload session not found.");
    return session;
  }

  toPublicResponse(session: UploadSession): UploadSessionResponse {
    return {
      id: session.id,
      clientUploadId: session.clientUploadId,
      fileName: session.fileName,
      fileSize: session.fileSize,
      chunkHashes: [...session.chunkHashes],
      chunkSize: session.chunkSize,
      status: session.status,
      bytesReceived: session.bytesReceived,
      nextChunkIndex: session.nextChunkIndex,
      expiresAt: session.expiresAt.toISOString(),
      jobId: session.status === "COMPLETED" ? session.completionJobId : null,
    };
  }

  private async assertWithinCurrentLimit(fileSize: number): Promise<void> {
    const { maxUploadSizeMb } = await this.settings.getSettings();
    if (!Number.isInteger(maxUploadSizeMb) || maxUploadSizeMb < 1 || maxUploadSizeMb > 50) {
      this.logger.error("Upload limit settings are outside the supported range.");
      throw new ServiceUnavailableException("Workbook upload limit settings are invalid.");
    }
    if (fileSize > maxUploadSizeMb * CHUNK_SIZE)
      throw new PayloadTooLargeException({
        code: "UPLOAD_LIMIT_CHANGED",
        message: `The administrator's upload limit has been lowered to ${maxUploadSizeMb} MB. Cancel this upload or choose a smaller file.`,
      });
  }

  private async ensureStorageRoot(): Promise<void> {
    try {
      await mkdir(this.storageRoot, { recursive: true, mode: 0o700 });
      const info = await lstat(this.storageRoot);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("Private upload-session storage must not be a symlink.");
      await chmod(this.storageRoot, 0o700);
      await this.checkedStorageRoot();
    } catch (error) {
      throw this.storageFailure(error);
    }
  }

  private async checkedStorageRoot(): Promise<string> {
    const resolved = await realpath(this.storageRoot);
    if (resolved !== this.storageRoot)
      throw new Error("Private upload-session storage escaped its configured root.");
    return resolved;
  }

  private async removeSessionStorage(id: string): Promise<void> {
    let root: string;
    try {
      root = await this.checkedStorageRoot();
    } catch (error) {
      if (this.isCode(error, "ENOENT")) return;
      throw this.storageFailure(error);
    }
    const directory = join(root, id);
    let info;
    try {
      info = await lstat(directory);
    } catch (error) {
      if (this.isCode(error, "ENOENT")) return;
      throw this.storageFailure(error);
    }
    try {
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("Refusing to remove a foreign or linked upload-session path.");
      if ((await realpath(directory)) !== directory)
        throw new Error("Upload-session path escaped its private root.");
      const marker = join(directory, OWNER_MARKER);
      try {
        const markerInfo = await lstat(marker);
        if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || markerInfo.size > 64)
          throw new Error("Upload-session ownership marker is unsafe.");
        if ((await readFile(marker, "utf8")) !== `${id}\n`)
          throw new Error("Upload-session ownership marker does not match.");
      } catch (error) {
        if (!this.isCode(error, "ENOENT") || (await readdir(directory)).length !== 0)
          throw error;
      }
      let entries = 0;
      const inspectTree = async (parent: string, depth: number): Promise<void> => {
        if (depth > MAX_STORAGE_DEPTH)
          throw new Error("Upload-session storage nesting exceeds the cleanup bound.");
        const directoryHandle = await opendir(parent, { bufferSize: 32 });
        for await (const entry of directoryHandle) {
          if (++entries > MAX_STORAGE_ENTRIES)
            throw new Error("Upload-session storage exceeds the cleanup entry bound.");
          if (parent === directory && entry.name === OWNER_MARKER) continue;
          const child = join(parent, entry.name);
          const childInfo = await lstat(child);
          if (childInfo.isSymbolicLink())
            throw new Error("Refusing to follow a symlink in upload-session storage.");
          if (childInfo.isDirectory()) await inspectTree(child, depth + 1);
          else if (!childInfo.isFile())
            throw new Error("Refusing to remove a special file from upload-session storage.");
        }
      };
      await inspectTree(directory, 0);
      await rm(directory, { recursive: true, force: false, maxRetries: 0 });
    } catch (error) {
      throw this.storageFailure(error);
    }
  }

  private async writeOwnerMarker(marker: string, id: string): Promise<void> {
    const handle = await open(marker, "wx", 0o600);
    try {
      await handle.writeFile(`${id}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private isCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
  }

  private storageFailure(error: unknown): ServiceUnavailableException {
    this.logger.error(
      "Upload-session storage operation failed; reservation accounting was retained.",
      error instanceof Error ? error.stack : String(error),
    );
    return new ServiceUnavailableException(
      "Upload-session storage is unavailable or ownership could not be verified. Retry after storage is restored.",
      { cause: error },
    );
  }

  private chunkStorageFailure(error: unknown): ServiceUnavailableException {
    this.logger.error(
      "Upload chunk storage or progress could not be confirmed.",
      error instanceof Error ? error.stack : String(error),
    );
    return new ServiceUnavailableException({
      code: "UPLOAD_STORAGE_FAILURE",
      message: "The chunk was not acknowledged because upload storage or progress could not be confirmed. Check session status before retrying.",
    }, { cause: error });
  }
}
