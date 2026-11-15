import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { strictObject, requiredText, uuid } from "../../common/management-validation";
import type { UploadSession } from "../../generated/prisma/client";
import { ApplicationSettingsService } from "../application-settings/application-settings.service";
import { PrismaService } from "../persistence/prisma.service";

export interface CreateUploadSessionInput {
  clientUploadId: string;
  fileName: string;
  fileSize: number;
  chunkHashes: string[];
}

const CHUNK_SIZE = 1024 * 1024;
const STORAGE_CAPACITY = 1024 * CHUNK_SIZE;

@Injectable()
export class UploadSessionService {
  private readonly logger = new Logger(UploadSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ApplicationSettingsService,
  ) {}

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
        return existing;
      }
      if (await tx.uploadSession.findFirst({
        where: { ownerId, OR: [{ status: { in: ["RECEIVING", "FINALIZING"] } }, { reservedBytes: { gt: 0 } }] },
      }))
        throw new ConflictException({
          code: "UPLOAD_SESSION_EXISTS",
          message: "Finish or cancel the account's existing upload before starting another.",
        });
      const { maxUploadSizeMb } = await tx.applicationSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      if (!Number.isInteger(maxUploadSizeMb) || maxUploadSizeMb < 1 || maxUploadSizeMb > 50) {
        this.logger.error("Upload limit settings are outside the supported range.");
        throw new ServiceUnavailableException("Workbook upload limit settings are invalid.");
      }
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
}
