import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JobStatus as DatabaseJobStatus, Language } from '../../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { TextExtractionService } from '../text-extraction/text-extraction.service';
import { TranslationService } from '../translation/translation.service';
import { normalizeUploadFilename } from '../../utils/filename';

export enum JobStatus { PENDING = 'PENDING', PROCESSING = 'PROCESSING', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED', FAILED = 'FAILED' }
export interface Job { id: string; ownerId: string; status: JobStatus; fileName: string; fileSize: number; progress: number; createdAt: Date; updatedAt: Date; error?: string; textCount?: number; sourceLanguage: Language; targetLanguage: Language; }

@Injectable()
export class DatabaseJobManagementService {
  private readonly dataDir = resolve(process.env.DATA_DIR || join(process.cwd(), 'data'));
  private readonly cancelled = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly prisma: PrismaService, private readonly extraction: TextExtractionService, private readonly translation: TranslationService) {}

  private toJob(job: any): Job { return { ...job, status: job.status as JobStatus }; }
  private sourcePath(id: string): string { return join(this.dataDir, `${id}.source.xlsx`); }
  private outputPath(id: string): string { return join(this.dataDir, `${id}.translated.xlsx`); }

  async createJob(fileName: string, ownerId: string, file?: Buffer): Promise<Job> {
    if (!file) throw new BadRequestException('An uploaded workbook is required.');
    const id = randomUUID();
    await mkdir(this.dataDir, { recursive: true });
    const sourcePath = this.sourcePath(id);
    await writeFile(sourcePath, file, { flag: 'wx' });
    const job = await this.prisma.translationJob.create({ data: { id, ownerId, fileName: normalizeUploadFilename(fileName), fileSize: file.length, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sourceLanguage: Language.JAPANESE, targetLanguage: Language.ENGLISH, selectedSheets: [], sourcePath } });
    return this.toJob(job);
  }

  private async owned(id: string, ownerId: string) {
    const job = await this.prisma.translationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found.');
    if (job.ownerId !== ownerId) throw new ForbiddenException('You do not own this job.');
    return job;
  }

  async getJob(id: string, ownerId: string): Promise<Job> { return this.toJob(await this.owned(id, ownerId)); }
  async getJobList(ownerId: string): Promise<Job[]> { return (await this.prisma.translationJob.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } })).map((job) => this.toJob(job)); }

  async startJob(id: string, ownerId: string): Promise<Job> {
    const job = await this.owned(id, ownerId);
    if (job.status !== DatabaseJobStatus.PENDING) throw new BadRequestException('Only pending jobs can be started.');
    this.controllers.set(id, new AbortController());
    const started = await this.prisma.translationJob.update({ where: { id }, data: { status: DatabaseJobStatus.PROCESSING, progress: 1, startedAt: new Date(), error: null } });
    void this.process(id);
    return this.toJob(started);
  }

  async retryJob(id: string, ownerId: string): Promise<Job> {
    const job = await this.owned(id, ownerId);
    if (job.status !== DatabaseJobStatus.FAILED) throw new BadRequestException('Only failed jobs can be retried.');
    await this.prisma.translationJob.update({ where: { id }, data: { status: DatabaseJobStatus.PENDING, progress: 0, error: null, completedAt: null, elapsedMs: null } });
    return this.startJob(id, ownerId);
  }

  private async process(id: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const original = await readFile(this.sourcePath(id));
      const extracted = await this.extraction.extractTextFromXlsx(original);
      this.ensureNotCancelled(id);
      await this.prisma.translationJob.update({ where: { id }, data: { textCount: extracted.length, progress: 10 } });
      const translated = await this.translation.sendTextForTranslation(extracted, (completed, total) => void this.prisma.translationJob.update({ where: { id }, data: { progress: 10 + Math.floor((completed / total) * 75) } }), this.controllers.get(id)?.signal);
      this.ensureNotCancelled(id);
      await this.prisma.translationJob.update({ where: { id }, data: { progress: 90 } });
      const output = await this.translation.patchOOXML(original, translated);
      this.ensureNotCancelled(id);
      const outputPath = this.outputPath(id);
      await writeFile(`${outputPath}.tmp`, output);
      await rename(`${outputPath}.tmp`, outputPath);
      await this.prisma.translationJob.update({ where: { id }, data: { status: DatabaseJobStatus.COMPLETED, progress: 100, outputPath, completedAt: new Date(), elapsedMs: Date.now() - startedAt } });
    } catch (error) {
      const cancelled = this.cancelled.has(id);
      await this.prisma.translationJob.update({ where: { id }, data: { status: cancelled ? DatabaseJobStatus.CANCELLED : DatabaseJobStatus.FAILED, error: cancelled ? null : error instanceof Error ? error.message : 'Translation failed.', completedAt: new Date(), elapsedMs: Date.now() - startedAt } });
    } finally { this.cancelled.delete(id); this.controllers.delete(id); }
  }

  private ensureNotCancelled(id: string): void { if (this.cancelled.has(id)) throw new Error('Job cancelled.'); }
  async cancelJob(id: string, ownerId: string): Promise<Job> { const job = await this.owned(id, ownerId); if (job.status === DatabaseJobStatus.PENDING) return this.toJob(await this.prisma.translationJob.update({ where: { id }, data: { status: DatabaseJobStatus.CANCELLED } })); if (job.status !== DatabaseJobStatus.PROCESSING) throw new BadRequestException('Only pending or processing jobs can be cancelled.'); this.cancelled.add(id); this.controllers.get(id)?.abort(); return this.toJob(job); }
  async getDownload(id: string, ownerId: string): Promise<{ fileName: string; buffer: Buffer }> { const job = await this.owned(id, ownerId); if (job.status !== DatabaseJobStatus.COMPLETED || !job.outputPath) throw new BadRequestException('The translated workbook is not ready.'); return { fileName: job.fileName.replace(/\.xlsx$/i, '') + '-translated.xlsx', buffer: await readFile(job.outputPath) }; }
}
