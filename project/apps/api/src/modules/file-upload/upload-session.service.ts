import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  chmod,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  readdir,
  rm,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { strictObject, requiredText, uuid } from "../../common/management-validation";
import type { Prisma, UploadSession } from "../../generated/prisma/client";
import { ApplicationSettingsService } from "../application-settings/application-settings.service";
import { PrismaService } from "../persistence/prisma.service";
import { UploadAdmissionService } from "./upload-admission.service";

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
        await this.removeSessionStorage(session.id);
        await this.releaseReservation(session.id);
      }
      return this.toPublicResponse(await this.findOwnedSession(ownerId, id));
    } finally {
      release();
    }
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
}
