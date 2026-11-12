import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../persistence/prisma.service";
import {
  nullableEmail,
  nullableText,
  strictObject,
} from "../../common/management-validation";
import { readFile, unlink } from "node:fs/promises";
import * as XLSX from "xlsx";
import { normalizeBasePath, pathAtBase } from "../../config/base-path";
import { HistoryQuery } from "./history-query";

const CHANGELOG_PAGE_SIZE = 10;

@Injectable()
export class ProductSurfacesService {
  constructor(private readonly prisma: PrismaService) {}

  async history(
    ownerId: string,
    input: HistoryQuery | string | undefined,
    requestedPage = 1,
  ) {
    const query: HistoryQuery =
      typeof input === "object" && input !== null
        ? input
        : {
            q: undefined,
            sourceLanguage: undefined,
            targetLanguage: undefined,
            sort: "createdAt",
            direction: "desc",
            page: input ? 1 : requestedPage,
            pageSize: 10,
            cursor: typeof input === "string" ? input : undefined,
          };
    const where: Record<string, unknown> = { ownerId };
    if (query.sourceLanguage) where.sourceLanguage = query.sourceLanguage;
    if (query.targetLanguage) where.targetLanguage = query.targetLanguage;
    if (query.q) {
      const term = query.q;
      const metadataMatches: Record<string, unknown>[] = [
        { fileName: { contains: term, mode: "insensitive" } },
      ];
      const status = [
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "CANCELLED",
        "FAILED",
      ].find((value) => value === term.toUpperCase());
      if (status) metadataMatches.push({ status });
      if (["ENGLISH", "JAPANESE", "CHINESE"].includes(term.toUpperCase())) {
        metadataMatches.push(
          { sourceLanguage: term.toUpperCase() },
          { targetLanguage: term.toUpperCase() },
        );
      }
      if (
        /^(0|[1-9]\d*)$/.test(term) &&
        Number.isSafeInteger(Number(term)) &&
        Number(term) <= 2147483647
      ) {
        metadataMatches.push({ fileSize: Number(term) });
      }
      where.OR = metadataMatches;
    }
    if (
      query.cursor &&
      !(await this.prisma.translationJob.findFirst({
        where: { id: query.cursor, ownerId },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException("Invalid history cursor.");
    }
    const page = query.cursor ? 1 : query.page;
    const orderBy = [
      { [query.sort]: query.direction },
      { id: query.direction },
    ];
    const [rows, total] = await Promise.all([
      this.prisma.translationJob.findMany({
        where,
        orderBy,
        take: query.pageSize + (query.cursor ? 1 : 0),
        select: {
          id: true,
          status: true,
          fileName: true,
          fileSize: true,
          progress: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          elapsedMs: true,
          error: true,
          textCount: true,
          selectedSheets: true,
          sourceLanguage: true,
          targetLanguage: true,
          vocabularyGroupId: true,
        },
        ...(query.cursor
          ? { cursor: { id: query.cursor }, skip: 1 }
          : { skip: (page - 1) * query.pageSize }),
      }),
      this.prisma.translationJob.count({ where }),
    ]);
    const hasMore = query.cursor
      ? rows.length > query.pageSize
      : page * query.pageSize < total;
    const data = rows.slice(0, query.pageSize);
    return {
      data,
      total,
      page,
      pageSize: query.pageSize,
      nextCursor: hasMore ? (data[data.length - 1]?.id ?? null) : null,
    };
  }

  async preview(id: string, ownerId: string, version: string) {
    if (version !== "source" && version !== "translated")
      throw new BadRequestException(
        "Preview version must be source or translated.",
      );
    const job = await this.prisma.translationJob.findFirst({
      where: { id, ownerId },
    });
    if (!job) throw new NotFoundException("Job not found.");
    const path = version === "source" ? job.sourcePath : job.outputPath;
    if (!path || (version === "translated" && job.status !== "COMPLETED"))
      throw new BadRequestException(
        "The requested workbook is not ready to preview.",
      );
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(await readFile(path), {
        type: "buffer",
        cellDates: false,
      });
    } catch {
      throw new BadRequestException("The workbook preview is unavailable.");
    }
    return {
      fileName: job.fileName,
      version,
      sheets: workbook.SheetNames.map((name) => ({
        name,
        rows: (
          XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
            header: 1,
            raw: false,
          }) as unknown[][]
        )
          .slice(0, 50)
          .map((row) =>
            row.slice(0, 20).map((cell) => (cell == null ? "" : String(cell))),
          ),
      })),
    };
  }

  async previewFile(id: string, ownerId: string, version: string) {
    if (version !== "source" && version !== "translated")
      throw new BadRequestException(
        "Preview version must be source or translated.",
      );
    const job = await this.prisma.translationJob.findFirst({
      where: { id, ownerId },
    });
    if (!job) throw new NotFoundException("Job not found.");
    const path = version === "source" ? job.sourcePath : job.outputPath;
    if (!path || (version === "translated" && job.status !== "COMPLETED"))
      throw new BadRequestException(
        "The requested workbook is not ready to preview.",
      );
    try {
      return await readFile(path);
    } catch {
      throw new BadRequestException("The workbook preview is unavailable.");
    }
  }

  async downloadUrl(id: string, ownerId: string) {
    const job = await this.prisma.translationJob.findFirst({
      where: { id, ownerId },
      select: { id: true, status: true, outputPath: true },
    });
    if (!job) throw new NotFoundException("Job not found.");
    if (job.status !== "COMPLETED" || !job.outputPath)
      throw new BadRequestException("The translated workbook is not ready.");
    const basePath = normalizeBasePath(process.env.BASE_PATH);
    return pathAtBase(basePath, `jobs/${encodeURIComponent(id)}/download`);
  }

  async deleteHistoryItem(id: string, ownerId: string) {
    const job = await this.prisma.translationJob.findFirst({
      where: { id, ownerId },
    });
    if (!job) throw new NotFoundException("Job not found.");
    if (job.status === "PROCESSING")
      throw new BadRequestException("A processing job cannot be deleted.");
    await this.prisma.translationJob.delete({ where: { id } });
    await Promise.all([
      unlink(job.sourcePath).catch(() => undefined),
      job.outputPath
        ? unlink(job.outputPath).catch(() => undefined)
        : Promise.resolve(),
    ]);
    return { ok: true };
  }

  async getProfile(ownerId: string, isAdmin = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        createdAt: true,
        passwordHash: true,
        identities: { select: { provider: true } },
      },
    });
    if (!user) throw new NotFoundException("Profile not found.");
    return this.profileResponse(user, isAdmin);
  }

  async updateProfile(
    ownerId: string,
    input: { fullName?: unknown; email?: unknown },
    isAdmin = false,
  ) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new BadRequestException("Profile details are required.");
    const fields = strictObject(input, ["fullName", "email"]);
    const data: { fullName?: string | null; email?: string | null } = {};
    const fullName = nullableText(fields.fullName, "Name", 120);
    if (fullName !== undefined) data.fullName = fullName;
    const email = nullableEmail(fields.email);
    if (email !== undefined) data.email = email;
    try {
      const user = await this.prisma.user.update({
        where: { id: ownerId },
        data,
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          createdAt: true,
          passwordHash: true,
          identities: { select: { provider: true } },
        },
      });
      return this.profileResponse(user, isAdmin);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new BadRequestException("That email address is already in use.");
      throw error;
    }
  }

  private profileResponse(user: any, isAdmin: boolean) {
    const { passwordHash, identities, ...profile } = user;
    const identityProviders = (identities || []).map(
      (identity: any) => identity.provider,
    );
    if (passwordHash && !identityProviders.includes("LOCAL"))
      identityProviders.push("LOCAL");
    return {
      ...profile,
      isAdmin,
      identityProviders,
      hasLocalPassword: Boolean(passwordHash),
    };
  }

  async changelog(cursor?: string) {
    if (
      cursor &&
      !(await this.prisma.changelogEntry.findUnique({
        where: { id: cursor },
        select: { id: true },
      }))
    )
      throw new BadRequestException("Invalid changelog cursor.");
    const rows = await this.prisma.changelogEntry.findMany({
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: CHANGELOG_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > CHANGELOG_PAGE_SIZE;
    const data = rows.slice(0, CHANGELOG_PAGE_SIZE);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }
}
