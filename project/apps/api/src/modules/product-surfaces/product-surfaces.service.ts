import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { readFile, unlink } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { normalizeBasePath, pathAtBase } from '../../config/base-path';

const PAGE_SIZE = 20;

@Injectable()
export class ProductSurfacesService {
  constructor(private readonly prisma: PrismaService) {}

  async history(ownerId: string, cursor?: string) {
    if (cursor && !(await this.prisma.translationJob.findFirst({ where: { id: cursor, ownerId }, select: { id: true } }))) {
      throw new BadRequestException('Invalid history cursor.');
    }
    const rows = await this.prisma.translationJob.findMany({
      where: { ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PAGE_SIZE + 1,
      select: { id: true, status: true, fileName: true, fileSize: true, progress: true, createdAt: true, updatedAt: true, completedAt: true, elapsedMs: true, error: true, textCount: true, selectedSheets: true, sourceLanguage: true, targetLanguage: true, vocabularyGroupId: true },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > PAGE_SIZE;
    const data = rows.slice(0, PAGE_SIZE);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async preview(id: string, ownerId: string, version: string) {
    if (version !== 'source' && version !== 'translated') throw new BadRequestException('Preview version must be source or translated.');
    const job = await this.prisma.translationJob.findFirst({ where: { id, ownerId } });
    if (!job) throw new NotFoundException('Job not found.');
    const path = version === 'source' ? job.sourcePath : job.outputPath;
    if (!path || (version === 'translated' && job.status !== 'COMPLETED')) throw new BadRequestException('The requested workbook is not ready to preview.');
    let workbook: XLSX.WorkBook;
    try { workbook = XLSX.read(await readFile(path), { type: 'buffer', cellDates: false }); }
    catch { throw new BadRequestException('The workbook preview is unavailable.'); }
    return {
      fileName: job.fileName,
      version,
      sheets: workbook.SheetNames.map((name) => ({
        name,
        rows: (XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false }) as unknown[][])
          .slice(0, 50).map((row) => row.slice(0, 20).map((cell) => cell == null ? '' : String(cell))),
      })),
    };
  }

  async downloadUrl(id: string, ownerId: string) {
    const job = await this.prisma.translationJob.findFirst({ where: { id, ownerId }, select: { id: true, status: true, outputPath: true } });
    if (!job) throw new NotFoundException('Job not found.');
    if (job.status !== 'COMPLETED' || !job.outputPath) throw new BadRequestException('The translated workbook is not ready.');
    const basePath = normalizeBasePath(process.env.BASE_PATH);
    return pathAtBase(basePath, `jobs/${encodeURIComponent(id)}/download`);
  }

  async deleteHistoryItem(id: string, ownerId: string) {
    const job = await this.prisma.translationJob.findFirst({ where: { id, ownerId } });
    if (!job) throw new NotFoundException('Job not found.');
    if (job.status === 'PROCESSING') throw new BadRequestException('A processing job cannot be deleted.');
    await this.prisma.translationJob.delete({ where: { id } });
    await Promise.all([unlink(job.sourcePath).catch(() => undefined), job.outputPath ? unlink(job.outputPath).catch(() => undefined) : Promise.resolve()]);
    return { ok: true };
  }

  async getProfile(ownerId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, username: true, email: true, fullName: true, createdAt: true } });
    if (!user) throw new NotFoundException('Profile not found.');
    return user;
  }

  async updateProfile(ownerId: string, input: { fullName?: unknown; email?: unknown }) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Profile details are required.');
    const data: { fullName?: string | null; email?: string | null } = {};
    if (input.fullName !== undefined) {
      if (input.fullName !== null && (typeof input.fullName !== 'string' || input.fullName.trim().length > 120)) throw new BadRequestException('Name must be 120 characters or fewer.');
      data.fullName = typeof input.fullName === 'string' ? input.fullName.trim() || null : null;
    }
    if (input.email !== undefined) {
      if (input.email !== null && (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) throw new BadRequestException('Enter a valid email address.');
      data.email = typeof input.email === 'string' ? input.email.trim().toLowerCase() || null : null;
    }
    try {
      return await this.prisma.user.update({ where: { id: ownerId }, data, select: { id: true, username: true, email: true, fullName: true, createdAt: true } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new BadRequestException('That email address is already in use.');
      throw error;
    }
  }

  async changelog(cursor?: string) {
    if (cursor && !(await this.prisma.changelogEntry.findUnique({ where: { id: cursor }, select: { id: true } }))) throw new BadRequestException('Invalid changelog cursor.');
    const rows = await this.prisma.changelogEntry.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > PAGE_SIZE;
    const data = rows.slice(0, PAGE_SIZE);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }
}
