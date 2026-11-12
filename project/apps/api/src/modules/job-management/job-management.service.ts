import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { TextExtractionService } from "../text-extraction/text-extraction.service";
import { TranslationService } from "../translation/translation.service";
import { normalizeUploadFilename } from "../../utils/filename";

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
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
  warnings?: string[];
  textCount?: number;
}

@Injectable()
export class JobManagementService {
  private readonly jobs = new Map<string, Job>();
  private readonly originals = new Map<string, string>();
  private readonly outputs = new Map<string, string>();
  private readonly cancelled = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly dataDir = resolve(
    process.env.DATA_DIR || join(process.cwd(), "data"),
  );
  private readonly stateFile = join(this.dataDir, "jobs.json");
  private ready: Promise<void>;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly extraction: TextExtractionService,
    private readonly translation: TranslationService,
  ) {
    this.ready = this.loadState();
  }

  private async loadState(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const persisted = JSON.parse(await readFile(this.stateFile, "utf8")) as {
        jobs?: Job[];
      };
      for (const item of persisted.jobs || []) {
        const job: Job = {
          ...item,
          fileName: normalizeUploadFilename(item.fileName),
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
        };
        this.jobs.set(job.id, job);
        const original = join(this.dataDir, `${job.id}.source.xlsx`);
        const output = join(this.dataDir, `${job.id}.translated.xlsx`);
        try {
          await readFile(original);
          this.originals.set(job.id, original);
        } catch {
          /* missing temp upload */
        }
        try {
          await readFile(output);
          this.outputs.set(job.id, output);
        } catch {
          /* not completed */
        }
        if (job.status === JobStatus.PROCESSING) {
          job.status = JobStatus.FAILED;
          job.error =
            "The API restarted while this job was running. Retry the job to continue.";
          job.updatedAt = new Date();
        }
      }
      await this.persist();
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify({ jobs: [...this.jobs.values()] });
    const operation = this.persistQueue.then(async () => {
      const temp = `${this.stateFile}.tmp`;
      await writeFile(temp, snapshot, "utf8");
      await rename(temp, this.stateFile);
    });
    this.persistQueue = operation.catch(() => undefined);
    return operation;
  }

  async createJob(
    fileName: string,
    ownerId: string,
    file?: Buffer,
  ): Promise<Job> {
    await this.ready;
    if (!file)
      throw new BadRequestException("An uploaded workbook is required.");
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const original = join(this.dataDir, `${id}.source.xlsx`);
    await writeFile(original, file, { flag: "wx" });
    const now = new Date();
    const job: Job = {
      id,
      ownerId,
      status: JobStatus.PENDING,
      fileName: normalizeUploadFilename(fileName),
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    this.originals.set(id, original);
    await this.persist();
    return job;
  }

  private owned(id: string, ownerId: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException("Job not found.");
    if (job.ownerId !== ownerId)
      throw new ForbiddenException("You do not own this job.");
    return job;
  }

  async getJob(id: string, ownerId: string): Promise<Job> {
    await this.ready;
    return this.owned(id, ownerId);
  }

  async getJobList(ownerId: string): Promise<Job[]> {
    await this.ready;
    return [...this.jobs.values()]
      .filter((job) => job.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async startJob(id: string, ownerId: string): Promise<Job> {
    await this.ready;
    const job = this.owned(id, ownerId);
    if (job.status !== JobStatus.PENDING)
      throw new BadRequestException("Only pending jobs can be started.");
    if (!this.originals.has(id))
      throw new BadRequestException(
        "The temporary upload is unavailable. Upload the workbook again.",
      );
    job.status = JobStatus.PROCESSING;
    job.progress = 1;
    job.updatedAt = new Date();
    this.controllers.set(id, new AbortController());
    await this.persist();
    void this.process(id);
    return job;
  }

  async retryJob(id: string, ownerId: string): Promise<Job> {
    await this.ready;
    const job = this.owned(id, ownerId);
    if (job.status !== JobStatus.FAILED)
      throw new BadRequestException("Only failed jobs can be retried.");
    if (!this.originals.has(id))
      throw new BadRequestException(
        "The temporary upload is unavailable. Upload the workbook again.",
      );
    job.status = JobStatus.PENDING;
    job.progress = 0;
    job.error = undefined;
    job.updatedAt = new Date();
    await this.persist();
    return this.startJob(id, ownerId);
  }

  private async process(id: string): Promise<void> {
    const job = this.jobs.get(id)!;
    try {
      const original = await readFile(this.originals.get(id)!);
      const extracted = await this.extraction.extractTextFromXlsx(original);
      this.checkCancelled(id);
      job.textCount = extracted.length;
      job.progress = 10;
      job.updatedAt = new Date();
      await this.persist();
      const translated = await this.translation.sendTextForTranslation(
        extracted,
        (completed, total) => {
          job.progress = 10 + Math.floor((completed / total) * 75);
          job.updatedAt = new Date();
          void this.persist().catch(() => undefined);
        },
        this.controllers.get(id)?.signal,
      );
      this.checkCancelled(id);
      job.progress = 90;
      job.updatedAt = new Date();
      await this.persist();
      const output = await this.translation.patchOOXML(original, translated);
      this.checkCancelled(id);
      const outputPath = join(this.dataDir, `${id}.translated.xlsx`);
      const tempPath = `${outputPath}.tmp`;
      await writeFile(tempPath, output);
      await rename(tempPath, outputPath);
      this.outputs.set(id, outputPath);
      job.status = JobStatus.COMPLETED;
      job.progress = 100;
      job.updatedAt = new Date();
    } catch (error) {
      if (this.cancelled.has(id)) {
        job.status = JobStatus.CANCELLED;
        job.error = undefined;
      } else {
        job.status = JobStatus.FAILED;
        job.error =
          error instanceof Error ? error.message : "Translation failed.";
      }
      job.updatedAt = new Date();
    } finally {
      this.cancelled.delete(id);
      this.controllers.delete(id);
      await this.persist();
    }
  }

  private checkCancelled(id: string): void {
    if (this.cancelled.has(id)) throw new Error("Job cancelled.");
  }

  async cancelJob(id: string, ownerId: string): Promise<Job> {
    await this.ready;
    const job = this.owned(id, ownerId);
    if (job.status === JobStatus.PENDING) {
      job.status = JobStatus.CANCELLED;
      job.updatedAt = new Date();
    } else if (job.status === JobStatus.PROCESSING) {
      this.cancelled.add(id);
      this.controllers.get(id)?.abort();
    } else
      throw new BadRequestException(
        "Only pending or processing jobs can be cancelled.",
      );
    await this.persist();
    return job;
  }

  async getDownload(
    id: string,
    ownerId: string,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    await this.ready;
    const job = this.owned(id, ownerId);
    if (job.status !== JobStatus.COMPLETED)
      throw new BadRequestException("The translated workbook is not ready.");
    const output = this.outputs.get(id);
    if (!output)
      throw new NotFoundException("Translated workbook is unavailable.");
    return {
      fileName: job.fileName.replace(/\.xlsx$/i, "") + "-translated.xlsx",
      buffer: await readFile(output),
    };
  }
}
