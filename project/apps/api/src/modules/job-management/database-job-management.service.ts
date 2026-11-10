import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JobStatus as DatabaseJobStatus, Language, NotificationType } from '../../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { TextExtractionService } from '../text-extraction/text-extraction.service';
import { TranslationService } from '../translation/translation.service';
import { normalizeUploadFilename } from '../../utils/filename';

export enum JobStatus { PENDING = 'PENDING', PROCESSING = 'PROCESSING', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED', FAILED = 'FAILED' }
export interface Job { id: string; ownerId: string; status: JobStatus; fileName: string; fileSize: number; progress: number; createdAt: Date; updatedAt: Date; completedAt?: Date; elapsedMs?: number; error?: string; textCount?: number; selectedSheets: string[]; availableSheets: string[]; sourceLanguage: Language; targetLanguage: Language; }

@Injectable()
export class DatabaseJobManagementService implements OnModuleInit {
  private readonly dataDir = resolve(process.env.DATA_DIR || join(process.cwd(), 'data'));
  private readonly cancelled = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly prisma: PrismaService, private readonly extraction: TextExtractionService, private readonly translation: TranslationService) {}

  async onModuleInit(): Promise<void> {
    const interrupted = await this.prisma.$transaction(async (tx) => {
      const jobs = await tx.translationJob.updateManyAndReturn({
        where: { status: DatabaseJobStatus.PROCESSING },
        data: { status: DatabaseJobStatus.FAILED, error: 'The API restarted while this job was running. Retry the job to continue.', completedAt: new Date() },
      });
      if (jobs.length) await tx.notification.createMany({ data: jobs.map((job) => ({
        userId: job.ownerId, jobId: job.id, type: NotificationType.JOB_FAILED,
        title: 'Translation interrupted', message: `${job.fileName} can be retried after an API restart.`,
      })) });
      return jobs;
    });
    for (const job of interrupted) await unlink(`${this.outputPath(job.id)}.tmp`).catch(() => undefined);
  }

  private toJob(job: any): Job {
    return { id: job.id, ownerId: job.ownerId, status: job.status as JobStatus, fileName: job.fileName,
      fileSize: job.fileSize, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt,
      completedAt: job.completedAt ?? undefined, elapsedMs: job.elapsedMs ?? undefined,
      error: job.error ?? undefined, textCount: job.textCount ?? undefined,
      selectedSheets: Array.isArray(job.selectedSheets) ? job.selectedSheets : [],
      availableSheets: Array.isArray(job.availableSheets) ? job.availableSheets : [],
      sourceLanguage: job.sourceLanguage, targetLanguage: job.targetLanguage };
  }
  private sourcePath(id: string): string { return join(this.dataDir, `${id}.source.xlsx`); }
  private outputPath(id: string): string { return join(this.dataDir, `${id}.translated.xlsx`); }

  async createJob(fileName: string, ownerId: string, file?: Buffer): Promise<Job> {
    if (!file) throw new BadRequestException('An uploaded workbook is required.');
    const id = randomUUID();
    await mkdir(this.dataDir, { recursive: true });
    const sourcePath = this.sourcePath(id);
    await writeFile(sourcePath, file, { flag: 'wx' });
    try {
      const availableSheets = await this.extraction.getSheetNames(file);
      if (!availableSheets.length) throw new BadRequestException('The workbook does not contain any worksheets.');
      const job = await this.prisma.translationJob.create({ data: { id, ownerId, fileName: normalizeUploadFilename(fileName), fileSize: file.length, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sourceLanguage: Language.JAPANESE, targetLanguage: Language.ENGLISH, selectedSheets: availableSheets, sourcePath, notifications: { create: { userId: ownerId, type: NotificationType.JOB_QUEUED, title: 'Translation queued', message: 'Your workbook is ready to start.' } } } });
      return { ...this.toJob(job), availableSheets };
    } catch (error) {
      await unlink(sourcePath).catch(() => undefined);
      throw error;
    }
  }

  private async owned(id: string, ownerId: string) {
    const job = await this.prisma.translationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found.');
    if (job.ownerId !== ownerId) throw new ForbiddenException('You do not own this job.');
    return job;
  }

  async getJob(id: string, ownerId: string): Promise<Job> {
    const job = await this.owned(id, ownerId);
    let availableSheets: string[] = [];
    try { availableSheets = await this.extraction.getSheetNames(await readFile(job.sourcePath)); } catch { /* The job metadata remains available if file storage is unavailable. */ }
    return { ...this.toJob(job), availableSheets };
  }
  async getJobList(ownerId: string): Promise<Job[]> { return (await this.prisma.translationJob.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } })).map((job) => this.toJob(job)); }

  async updateJobSettings(id: string, ownerId: string, input: { selectedSheets?: unknown; sourceLanguage?: unknown; targetLanguage?: unknown }): Promise<Job> {
    const job = await this.owned(id, ownerId);
    if (job.status !== DatabaseJobStatus.PENDING) throw new BadRequestException('Settings can only be changed while a job is pending.');
    const availableSheets = await this.extraction.getSheetNames(await readFile(job.sourcePath));
    const selectedSheets = input.selectedSheets === undefined ? (Array.isArray(job.selectedSheets) ? job.selectedSheets as string[] : []) : input.selectedSheets;
    const sourceLanguage = input.sourceLanguage === undefined ? job.sourceLanguage : input.sourceLanguage;
    const targetLanguage = input.targetLanguage === undefined ? job.targetLanguage : input.targetLanguage;
    const languages = Object.values(Language);
    if (!Array.isArray(selectedSheets) || !selectedSheets.length || selectedSheets.some((sheet) => typeof sheet !== 'string' || !availableSheets.includes(sheet)) || new Set(selectedSheets).size !== selectedSheets.length) throw new BadRequestException('Select one or more valid worksheets.');
    if (!languages.includes(sourceLanguage as Language) || !languages.includes(targetLanguage as Language) || sourceLanguage === targetLanguage) throw new BadRequestException('Choose two different supported languages.');
    const updated = await this.prisma.translationJob.updateManyAndReturn({ where: { id, ownerId, status: DatabaseJobStatus.PENDING }, data: { selectedSheets: selectedSheets as string[], sourceLanguage: sourceLanguage as Language, targetLanguage: targetLanguage as Language } });
    if (!updated.length) throw new BadRequestException('Job status changed. Refresh and try again.');
    return { ...this.toJob(updated[0]), availableSheets };
  }

  async startJob(id: string, ownerId: string): Promise<Job> {
    await this.owned(id, ownerId);
    const claimed = await this.claimJob(id, ownerId, DatabaseJobStatus.PENDING);
    if (claimed.length !== 1) throw new BadRequestException('Only pending jobs can be started.');
    this.controllers.set(id, new AbortController());
    void this.process(id);
    return this.toJob(claimed[0]);
  }

  async retryJob(id: string, ownerId: string): Promise<Job> {
    await this.owned(id, ownerId);
    const claimed = await this.claimJob(id, ownerId, DatabaseJobStatus.FAILED);
    if (claimed.length !== 1) throw new BadRequestException('Only failed jobs can be retried.');
    this.controllers.set(id, new AbortController());
    void this.process(id);
    return this.toJob(claimed[0]);
  }

  private async claimJob(id: string, ownerId: string, status: DatabaseJobStatus) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.translationJob.updateManyAndReturn({ where: { id, ownerId, status }, data: { status: DatabaseJobStatus.PROCESSING, progress: 1, startedAt: new Date(), error: null, completedAt: null, elapsedMs: null } });
      if (claimed.length) await tx.notification.create({ data: { userId: ownerId, jobId: id, type: NotificationType.JOB_PROGRESS, title: 'Translation started', message: `${claimed[0].fileName} is being translated.` } });
      return claimed;
    });
  }

  private async process(id: string): Promise<void> {
    const startedAt = Date.now();
    let progressWrites: Promise<unknown> = Promise.resolve();
    try {
      const job = await this.prisma.translationJob.findUniqueOrThrow({ where: { id } });
      const original = await readFile(job.sourcePath);
      const selectedSheets = Array.isArray(job.selectedSheets) && job.selectedSheets.length
        ? job.selectedSheets as string[]
        : await this.extraction.getSheetNames(original);
      const extracted = await this.extraction.extractTextFromXlsx(original, selectedSheets);
      this.ensureNotCancelled(id);
      await this.prisma.translationJob.updateMany({ where: { id, status: DatabaseJobStatus.PROCESSING }, data: { textCount: extracted.length, progress: 10 } });
      const translated = await this.translation.sendTextForTranslation(extracted, (completed, total) => {
        progressWrites = progressWrites.then(() => this.prisma.translationJob.updateMany({ where: { id, status: DatabaseJobStatus.PROCESSING }, data: { progress: 10 + Math.floor((completed / total) * 75) } })).catch(() => undefined);
      }, this.controllers.get(id)?.signal, { sourceLanguage: job.sourceLanguage, targetLanguage: job.targetLanguage });
      await progressWrites;
      this.ensureNotCancelled(id);
      await this.prisma.translationJob.updateMany({ where: { id, status: DatabaseJobStatus.PROCESSING }, data: { progress: 90 } });
      const output = await this.translation.patchOOXML(original, translated, selectedSheets);
      this.ensureNotCancelled(id);
      const outputPath = this.outputPath(id);
      await writeFile(`${outputPath}.tmp`, output);
      await rename(`${outputPath}.tmp`, outputPath);
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.translationJob.updateManyAndReturn({ where: { id, status: DatabaseJobStatus.PROCESSING }, data: { status: DatabaseJobStatus.COMPLETED, progress: 100, outputPath, completedAt: new Date(), elapsedMs: Date.now() - startedAt } });
        if (changed.length) await tx.notification.create({ data: { userId: changed[0].ownerId, jobId: id, type: NotificationType.JOB_COMPLETED, title: 'Translation complete', message: 'Your translated workbook is ready to download.' } });
      });
    } catch (error) {
      await progressWrites.catch(() => undefined);
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.translationJob.updateManyAndReturn({ where: { id, status: DatabaseJobStatus.PROCESSING }, data: { status: DatabaseJobStatus.FAILED, error: error instanceof Error ? error.message : 'Translation failed.', completedAt: new Date(), elapsedMs: Date.now() - startedAt } });
        if (changed.length) await tx.notification.create({ data: { userId: changed[0].ownerId, jobId: id, type: NotificationType.JOB_FAILED, title: 'Translation failed', message: `${changed[0].fileName} could not be translated.` } });
      });
    } finally { this.cancelled.delete(id); this.controllers.delete(id); }
  }

  private ensureNotCancelled(id: string): void { if (this.cancelled.has(id)) throw new Error('Job cancelled.'); }
  async cancelJob(id: string, ownerId: string): Promise<Job> {
    await this.owned(id, ownerId);
    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.translationJob.updateManyAndReturn({ where: { id, ownerId, status: { in: [DatabaseJobStatus.PENDING, DatabaseJobStatus.PROCESSING] } }, data: { status: DatabaseJobStatus.CANCELLED, completedAt: new Date() } });
      if (result.length) await tx.notification.create({ data: { userId: ownerId, jobId: id, type: NotificationType.JOB_CANCELLED, title: 'Translation cancelled', message: `${result[0].fileName} was cancelled.` } });
      return result;
    });
    if (!changed.length) throw new BadRequestException('Only pending or processing jobs can be cancelled.');
    if (changed[0].startedAt) {
      this.cancelled.add(id);
      this.controllers.get(id)?.abort();
    }
    return this.toJob(changed[0]);
  }
  async getDownload(id: string, ownerId: string): Promise<{ fileName: string; buffer: Buffer }> { const job = await this.owned(id, ownerId); if (job.status !== DatabaseJobStatus.COMPLETED || !job.outputPath) throw new BadRequestException('The translated workbook is not ready.'); return { fileName: job.fileName.replace(/\.xlsx$/i, '') + '-translated.xlsx', buffer: await readFile(job.outputPath) }; }
}
