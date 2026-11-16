import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  JobStatus as DatabaseJobStatus,
  Language,
  NotificationType,
  Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../persistence/prisma.service";
import { TextExtractionService } from "../text-extraction/text-extraction.service";
import { TranslationService } from "../translation/translation.service";
import { normalizeUploadFilename } from "../../utils/filename";
import { isSupportedLanguagePair } from "./language-pairs";
import { ApplicationSettingsService } from "../application-settings/application-settings.service";
import { openWorkbookFileStream } from "../../common/workbook-file-stream";

const ADVISORY_LOCK_NAMESPACE = 1_163_430_226;
const SINGLETON_LOCK_ID = 1;
const CAPACITY_LOCK_ID = 2;

export interface DiskWorkbook {
  path: string;
  fileSize: number;
  availableSheets: string[];
}

export enum JobStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
}
export interface Job {
  id: string;
  ownerId: string;
  status: JobStatus;
  fileName: string;
  fileSize: number;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  elapsedMs?: number;
  error?: string;
  textCount?: number;
  selectedSheets: string[];
  availableSheets: string[];
  sourceLanguage: Language;
  targetLanguage: Language;
  vocabularyGroupId: string | null;
}

@Injectable()
export class DatabaseJobManagementService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly dataDir = resolve(
    process.env.DATA_DIR || join(process.cwd(), "data"),
  );
  private readonly cancelled = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly workers = new Map<string, Promise<void>>();
  private readonly jobOperations = new Map<string, Promise<void>>();
  private readonly inFlightAdmissions = new Set<Promise<void>>();
  private singletonConnection: Client | null = null;
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly extraction: TextExtractionService,
    private readonly translation: TranslationService,
    private readonly settings: ApplicationSettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.acquireSingletonLock();
    try {
      const interrupted = await this.prisma.$transaction(async (tx) => {
        const jobs = await tx.translationJob.updateManyAndReturn({
          where: { status: DatabaseJobStatus.PROCESSING },
          data: {
            status: DatabaseJobStatus.FAILED,
            error:
              "The API restarted while this job was running. Retry the job to continue.",
            completedAt: new Date(),
          },
        });
        if (jobs.length)
          await tx.notification.createMany({
            data: jobs.map((job) => ({
              userId: job.ownerId,
              jobId: job.id,
              type: NotificationType.JOB_FAILED,
              title: "Translation interrupted",
              message: `${job.fileName} can be retried after an API restart.`,
            })),
          });
        return jobs;
      });
      for (const job of interrupted)
        await unlink(`${this.outputPath(job.id)}.tmp`).catch(() => undefined);
    } catch (error) {
      await this.releaseSingletonLock();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await Promise.all(this.inFlightAdmissions);
    await Promise.allSettled(this.workers.values());
    await this.releaseSingletonLock();
  }

  private async acquireSingletonLock(): Promise<void> {
    const connection = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    try {
      await connection.connect();
      const result = await connection.query(
        "SELECT pg_try_advisory_lock($1, $2) AS locked",
        [ADVISORY_LOCK_NAMESPACE, SINGLETON_LOCK_ID],
      );
      if (result.rows[0]?.locked !== true)
        throw new Error(
          "Only one API instance may use this database. Stop the other API instance before starting this one.",
        );
      this.singletonConnection = connection;
      connection.on("error", (error) => {
        console.error(
          "The API lost its database singleton lock connection and will exit to prevent split-brain job processing.",
          error,
        );
        process.exit(1);
      });
    } catch (error) {
      await connection.end().catch(() => undefined);
      throw error;
    }
  }

  private async releaseSingletonLock(): Promise<void> {
    const connection = this.singletonConnection;
    this.singletonConnection = null;
    if (!connection) return;
    connection.removeAllListeners("error");
    try {
      await connection.query(
        "SELECT pg_advisory_unlock($1, $2)",
        [ADVISORY_LOCK_NAMESPACE, SINGLETON_LOCK_ID],
      );
    } catch {
      /* Closing the session releases its advisory lock. */
    } finally {
      await connection.end().catch(() => undefined);
    }
  }

  private assertSingletonLock(): void {
    if (!this.singletonConnection)
      throw new ServiceUnavailableException(
        "Translation processing is unavailable until the API acquires its database instance lock.",
      );
  }

  private beginAdmission(): () => void {
    if (this.shuttingDown)
      throw new ServiceUnavailableException(
        "Translation processing is shutting down.",
      );
    this.assertSingletonLock();
    let finish!: () => void;
    const admission = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.inFlightAdmissions.add(admission);
    return () => {
      this.inFlightAdmissions.delete(admission);
      finish();
    };
  }

  private async withJobLock<T>(
    id: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.jobOperations.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.jobOperations.set(id, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.jobOperations.get(id) === current)
        this.jobOperations.delete(id);
    }
  }

  private toJob(job: any): Job {
    return {
      id: job.id,
      ownerId: job.ownerId,
      status: job.status as JobStatus,
      fileName: job.fileName,
      fileSize: job.fileSize,
      progress: job.progress,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt ?? undefined,
      elapsedMs: job.elapsedMs ?? undefined,
      error: job.error ?? undefined,
      textCount: job.textCount ?? undefined,
      selectedSheets: Array.isArray(job.selectedSheets)
        ? job.selectedSheets
        : [],
      availableSheets: Array.isArray(job.availableSheets)
        ? job.availableSheets
        : [],
      sourceLanguage: job.sourceLanguage,
      targetLanguage: job.targetLanguage,
      vocabularyGroupId: job.vocabularyGroupId ?? null,
    };
  }
  sourcePath(id: string): string {
    return join(this.dataDir, `${id}.source.xlsx`);
  }
  private outputPath(id: string): string {
    return join(this.dataDir, `${id}.translated.xlsx`);
  }

  async createSessionJob(
    tx: Prisma.TransactionClient,
    input: { id: string; ownerId: string; fileName: string; fileSize: number; availableSheets: string[] },
  ): Promise<Job> {
    const job = await tx.translationJob.create({
      data: {
        id: input.id,
        ownerId: input.ownerId,
        fileName: normalizeUploadFilename(input.fileName),
        fileSize: input.fileSize,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sourceLanguage: Language.JAPANESE,
        targetLanguage: Language.ENGLISH,
        selectedSheets: input.availableSheets,
        sourcePath: this.sourcePath(input.id),
        notifications: {
          create: {
            userId: input.ownerId,
            type: NotificationType.JOB_QUEUED,
            title: "Translation queued",
            message: "Your workbook is ready to start.",
          },
        },
      },
    });
    return { ...this.toJob(job), availableSheets: input.availableSheets };
  }

  async createJob(
    fileName: string,
    ownerId: string,
    file?: Buffer | DiskWorkbook,
  ): Promise<Job> {
    if (!file)
      throw new BadRequestException("An uploaded workbook is required.");
    const id = randomUUID();
    await mkdir(this.dataDir, { recursive: true });
    const sourcePath = this.sourcePath(id);
    if (Buffer.isBuffer(file))
      await writeFile(sourcePath, file, { flag: "wx" });
    else {
      try {
        await link(file.path, sourcePath);
      } catch (error) {
        console.error("Workbook upload could not be promoted to job storage.", error);
        throw new ServiceUnavailableException(
          "Workbook job storage is unavailable. Retry after storage is restored.",
          { cause: error },
        );
      }
    }
    try {
      if (!Buffer.isBuffer(file)) {
        try {
          await unlink(file.path);
        } catch (error) {
          console.error("Promoted workbook upload could not be unlinked.", error);
          throw new ServiceUnavailableException(
            "Workbook upload cleanup failed. Retry after storage is restored.",
            { cause: error },
          );
        }
      }
      const availableSheets = Buffer.isBuffer(file)
        ? await this.extraction.getSheetNames(file)
        : file.availableSheets;
      if (!availableSheets.length)
        throw new BadRequestException(
          "The workbook does not contain any worksheets.",
        );
      return await this.createSessionJob(this.prisma, {
        id,
        ownerId,
        fileName,
        fileSize: Buffer.isBuffer(file) ? file.length : file.fileSize,
        availableSheets,
      });
    } catch (error) {
      try {
        await unlink(sourcePath);
      } catch (cleanupError) {
        if (!(
          cleanupError instanceof Error &&
          "code" in cleanupError &&
          cleanupError.code === "ENOENT"
        )) {
          console.error("Workbook job creation and cleanup failed.", error, cleanupError);
          throw new ServiceUnavailableException(
            "Workbook job creation failed and its file could not be cleaned up.",
            { cause: cleanupError },
          );
        }
      }
      throw error;
    }
  }

  private async owned(id: string, ownerId: string) {
    const job = await this.prisma.translationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException("Job not found.");
    if (job.ownerId !== ownerId)
      throw new ForbiddenException("You do not own this job.");
    return job;
  }

  async getJob(id: string, ownerId: string): Promise<Job> {
    const job = await this.owned(id, ownerId);
    let availableSheets: string[] = [];
    try {
      availableSheets = await this.extraction.getSheetNames(
        await readFile(job.sourcePath),
      );
    } catch {
      /* The job metadata remains available if file storage is unavailable. */
    }
    return { ...this.toJob(job), availableSheets };
  }
  async getJobList(ownerId: string): Promise<Job[]> {
    return (
      await this.prisma.translationJob.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
      })
    ).map((job) => this.toJob(job));
  }

  async updateJobSettings(
    id: string,
    ownerId: string,
    input: {
      selectedSheets?: unknown;
      sourceLanguage?: unknown;
      targetLanguage?: unknown;
      vocabularyGroupId?: unknown;
    },
  ): Promise<Job> {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new BadRequestException("Job settings are required.");
    const job = await this.owned(id, ownerId);
    if (job.status !== DatabaseJobStatus.PENDING)
      throw new BadRequestException(
        "Settings can only be changed while a job is pending.",
      );
    const availableSheets = await this.extraction.getSheetNames(
      await readFile(job.sourcePath),
    );
    const selectedSheets =
      input.selectedSheets === undefined
        ? Array.isArray(job.selectedSheets)
          ? (job.selectedSheets as string[])
          : []
        : input.selectedSheets;
    const sourceLanguage =
      input.sourceLanguage === undefined
        ? job.sourceLanguage
        : input.sourceLanguage;
    const targetLanguage =
      input.targetLanguage === undefined
        ? job.targetLanguage
        : input.targetLanguage;
    if (
      !Array.isArray(selectedSheets) ||
      !selectedSheets.length ||
      selectedSheets.some(
        (sheet) =>
          typeof sheet !== "string" || !availableSheets.includes(sheet),
      ) ||
      new Set(selectedSheets).size !== selectedSheets.length
    )
      throw new BadRequestException("Select one or more valid worksheets.");
    if (!isSupportedLanguagePair(sourceLanguage, targetLanguage))
      throw new BadRequestException(
        "Choose two different supported languages.",
      );
    let vocabularyGroupId =
      input.vocabularyGroupId === undefined
        ? job.vocabularyGroupId
        : input.vocabularyGroupId;
    if (vocabularyGroupId !== null && typeof vocabularyGroupId !== "string")
      throw new BadRequestException("Choose a compatible vocabulary group.");
    if (typeof vocabularyGroupId === "string") {
      const group = await this.prisma.vocabularyGroup.findFirst({
        where: {
          id: vocabularyGroupId,
          ownerId,
          sourceLanguage,
          targetLanguage,
        },
        select: { id: true },
      });
      if (!group) {
        if (input.vocabularyGroupId === undefined) vocabularyGroupId = null;
        else
          throw new BadRequestException(
            "Choose a vocabulary group for the selected language pair.",
          );
      }
    }
    const updated = await this.prisma.translationJob.updateManyAndReturn({
      where: { id, ownerId, status: DatabaseJobStatus.PENDING },
      data: {
        selectedSheets: selectedSheets as string[],
        sourceLanguage: sourceLanguage as Language,
        targetLanguage: targetLanguage as Language,
        vocabularyGroupId: vocabularyGroupId as string | null,
      },
    });
    if (!updated.length)
      throw new BadRequestException(
        "Job status changed. Refresh and try again.",
      );
    return { ...this.toJob(updated[0]), availableSheets };
  }

  async startJob(id: string, ownerId: string): Promise<Job> {
    const finishAdmission = this.beginAdmission();
    try {
      return await this.withJobLock(id, async () => {
        const job = await this.owned(id, ownerId);
        await this.assertCompatibleVocabulary(job);
        const claimed = await this.claimJob(
          id,
          ownerId,
          DatabaseJobStatus.PENDING,
        );
        if (claimed.length !== 1)
          throw new BadRequestException("Only pending jobs can be started.");
        this.launchWorker(id);
        return this.toJob(claimed[0]);
      });
    } finally {
      finishAdmission();
    }
  }

  async retryJob(id: string, ownerId: string): Promise<Job> {
    const finishAdmission = this.beginAdmission();
    try {
      while (true) {
        const result = await this.withJobLock(id, async () => {
          const job = await this.owned(id, ownerId);
          await this.assertCompatibleVocabulary(job);
          if (job.status !== DatabaseJobStatus.FAILED)
            throw new BadRequestException("Only failed jobs can be retried.");
          const previousWorker = this.workers.get(id);
          if (previousWorker)
            return { kind: "wait" as const, worker: previousWorker };
          const claimed = await this.claimJob(
            id,
            ownerId,
            DatabaseJobStatus.FAILED,
          );
          if (claimed.length !== 1)
            throw new BadRequestException("Only failed jobs can be retried.");
          this.launchWorker(id);
          return { kind: "started" as const, job: this.toJob(claimed[0]) };
        });
        if (result.kind === "started") return result.job;
        // Worker finalization may need the per-job lock, so wait only after releasing it.
        await result.worker.catch(() => undefined);
      }
    } finally {
      finishAdmission();
    }
  }

  private launchWorker(id: string): void {
    this.controllers.set(id, new AbortController());
    const worker = this.process(id);
    this.workers.set(id, worker);
    void worker.then(
      () => {
        if (this.workers.get(id) === worker) this.workers.delete(id);
      },
      (error) => {
        if (this.workers.get(id) === worker) this.workers.delete(id);
        console.error(`Translation worker ${id} stopped unexpectedly.`, error);
      },
    );
  }

  private async claimJob(
    id: string,
    ownerId: string,
    status: DatabaseJobStatus,
  ) {
    const { maxConcurrentTranslations } = await this.settings.getSettings();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock($1, $2)::text",
        ADVISORY_LOCK_NAMESPACE,
        CAPACITY_LOCK_ID,
      );
      const eligible = await tx.translationJob.findFirst({
        where: { id, ownerId, status },
        select: { id: true },
      });
      if (!eligible) return [];
      const processingCount = await tx.translationJob.count({
        where: { status: DatabaseJobStatus.PROCESSING },
      });
      if (processingCount >= maxConcurrentTranslations)
        throw new ConflictException(
          `Translation capacity reached (${maxConcurrentTranslations} concurrent jobs). Wait for a job to finish or cancel before starting or retrying another.`,
        );
      const claimed = await tx.translationJob.updateManyAndReturn({
        where: { id, ownerId, status },
        data: {
          status: DatabaseJobStatus.PROCESSING,
          progress: 1,
          startedAt: new Date(),
          error: null,
          completedAt: null,
          elapsedMs: null,
        },
      });
      if (claimed.length)
        await tx.notification.create({
          data: {
            userId: ownerId,
            jobId: id,
            type: NotificationType.JOB_PROGRESS,
            title: "Translation started",
            message: `${claimed[0].fileName} is being translated.`,
          },
        });
      return claimed;
    });
  }

  private async process(id: string): Promise<void> {
    const startedAt = Date.now();
    let progressWrites: Promise<unknown> = Promise.resolve();
    let outputPath: string | undefined;
    try {
      const job = await this.prisma.translationJob.findUniqueOrThrow({
        where: { id },
      });
      const original = await readFile(job.sourcePath);
      const selectedSheets =
        Array.isArray(job.selectedSheets) && job.selectedSheets.length
          ? (job.selectedSheets as string[])
          : await this.extraction.getSheetNames(original);
      const vocabulary = job.vocabularyGroupId
        ? await this.prisma.vocabularyGroup.findFirst({
            where: {
              id: job.vocabularyGroupId,
              ownerId: job.ownerId,
              sourceLanguage: job.sourceLanguage,
              targetLanguage: job.targetLanguage,
            },
            include: { entries: { select: { source: true, target: true } } },
          })
        : null;
      if (job.vocabularyGroupId && !vocabulary)
        throw new Error(
          "The selected vocabulary group is no longer compatible with this job.",
        );
      const extracted = await this.extraction.extractTextFromXlsx(
        original,
        selectedSheets,
      );
      this.ensureNotCancelled(id);
      await this.prisma.translationJob.updateMany({
        where: { id, status: DatabaseJobStatus.PROCESSING },
        data: { textCount: extracted.length, progress: 10 },
      });
      const translated = await this.translation.sendTextForTranslation(
        extracted,
        (completed, total) => {
          progressWrites = progressWrites
            .then(() =>
              this.prisma.translationJob.updateMany({
                where: { id, status: DatabaseJobStatus.PROCESSING },
                data: { progress: 10 + Math.floor((completed / total) * 75) },
              }),
            )
            .catch(() => undefined);
        },
        this.controllers.get(id)?.signal,
        {
          sourceLanguage: job.sourceLanguage,
          targetLanguage: job.targetLanguage,
        },
        vocabulary?.entries ?? [],
      );
      await progressWrites;
      this.ensureNotCancelled(id);
      await this.prisma.translationJob.updateMany({
        where: { id, status: DatabaseJobStatus.PROCESSING },
        data: { progress: 90 },
      });
      const output = await this.translation.patchOOXML(
        original,
        translated,
        selectedSheets,
      );
      this.ensureNotCancelled(id);
      outputPath = this.outputPath(id);
      await writeFile(`${outputPath}.tmp`, output);
      await rename(`${outputPath}.tmp`, outputPath);
      await this.withJobLock(id, async () => {
        this.ensureNotCancelled(id);
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.translationJob.updateManyAndReturn({
            where: { id, status: DatabaseJobStatus.PROCESSING },
            data: {
              status: DatabaseJobStatus.COMPLETED,
              progress: 100,
              outputPath,
              completedAt: new Date(),
              elapsedMs: Date.now() - startedAt,
            },
          });
          if (changed.length)
            await tx.notification.create({
              data: {
                userId: changed[0].ownerId,
                jobId: id,
                type: NotificationType.JOB_COMPLETED,
                title: "Translation complete",
                message: "Your translated workbook is ready to download.",
              },
            });
        });
      });
    } catch (error) {
      await progressWrites.catch(() => undefined);
      const wasCancelled = this.cancelled.has(id);
      if (wasCancelled && outputPath) {
        await unlink(`${outputPath}.tmp`).catch(() => undefined);
        await unlink(outputPath).catch(() => undefined);
      }
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.translationJob.updateManyAndReturn({
          where: { id, status: DatabaseJobStatus.PROCESSING },
          data: {
            status: wasCancelled
              ? DatabaseJobStatus.CANCELLED
              : DatabaseJobStatus.FAILED,
            error: wasCancelled
              ? null
              : error instanceof Error
                ? error.message
                : "Translation failed.",
            completedAt: new Date(),
            elapsedMs: Date.now() - startedAt,
          },
        });
        if (changed.length)
          await tx.notification.create({
            data: {
              userId: changed[0].ownerId,
              jobId: id,
              type: wasCancelled
                ? NotificationType.JOB_CANCELLED
                : NotificationType.JOB_FAILED,
              title: wasCancelled
                ? "Translation cancelled"
                : "Translation failed",
              message: wasCancelled
                ? `${changed[0].fileName} was cancelled.`
                : `${changed[0].fileName} could not be translated.`,
            },
          });
      });
    } finally {
      this.cancelled.delete(id);
      this.controllers.delete(id);
    }
  }

  private ensureNotCancelled(id: string): void {
    if (this.cancelled.has(id)) throw new Error("Job cancelled.");
  }
  private async assertCompatibleVocabulary(job: any): Promise<void> {
    if (!job.vocabularyGroupId) return;
    const group = await this.prisma.vocabularyGroup.findFirst({
      where: {
        id: job.vocabularyGroupId,
        ownerId: job.ownerId,
        sourceLanguage: job.sourceLanguage,
        targetLanguage: job.targetLanguage,
      },
      select: { id: true },
    });
    if (!group)
      throw new BadRequestException(
        "Choose a vocabulary group for the selected language pair before starting.",
      );
  }
  async cancelJob(id: string, ownerId: string): Promise<Job> {
    const worker = await this.withJobLock(id, async () => {
      this.assertSingletonLock();
      const job = await this.owned(id, ownerId);
      if (job.status === DatabaseJobStatus.PROCESSING) {
        this.cancelled.add(id);
        this.controllers.get(id)?.abort();
        return { worker: this.workers.get(id) };
      }
      if (job.status !== DatabaseJobStatus.PENDING)
        throw new BadRequestException(
          "Only pending or processing jobs can be cancelled.",
        );
      const changed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.translationJob.updateManyAndReturn({
          where: { id, ownerId, status: DatabaseJobStatus.PENDING },
          data: {
            status: DatabaseJobStatus.CANCELLED,
            completedAt: new Date(),
          },
        });
        if (result.length)
          await tx.notification.create({
            data: {
              userId: ownerId,
              jobId: id,
              type: NotificationType.JOB_CANCELLED,
              title: "Translation cancelled",
              message: `${result[0].fileName} was cancelled.`,
            },
          });
        return result;
      });
      if (!changed.length)
        throw new BadRequestException(
          "Job status changed. Refresh and try again.",
        );
      return { worker: undefined };
    });
    await worker.worker?.catch(() => undefined);
    return this.toJob(await this.owned(id, ownerId));
  }
  async getDownload(
    id: string,
    ownerId: string,
  ) {
    const job = await this.owned(id, ownerId);
    if (job.status !== DatabaseJobStatus.COMPLETED || !job.outputPath)
      throw new BadRequestException("The translated workbook is not ready.");
    try {
      return {
        fileName: job.fileName.replace(/\.xlsx$/i, "") + "-translated.xlsx",
        ...(await openWorkbookFileStream(job.outputPath)),
      };
    } catch (error) {
      console.error("Translated workbook file could not be opened.", error);
      throw new ServiceUnavailableException("The translated workbook is unavailable.");
    }
  }
}
