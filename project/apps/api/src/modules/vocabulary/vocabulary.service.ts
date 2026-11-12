import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Language } from '../../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { isSupportedLanguagePair } from '../job-management/language-pairs';
import { requiredText } from '../../common/management-validation';

const MAX_GROUP_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_TERM_LENGTH = 200;
const MAX_ENTRIES_PER_GROUP = 500;

interface GroupInput {
  name?: unknown;
  description?: unknown;
  sourceLanguage?: unknown;
  targetLanguage?: unknown;
}

interface EntryInput {
  source?: unknown;
  target?: unknown;
}

@Injectable()
export class VocabularyService {
  constructor(private readonly prisma: PrismaService) {}

  private async group(id: string, ownerId: string) {
    const group = await this.prisma.vocabularyGroup.findFirst({ where: { id, ownerId } });
    if (!group) throw new NotFoundException('Vocabulary group not found.');
    return group;
  }

  private languagePair(source: unknown, target: unknown): asserts source is Language {
    if (!isSupportedLanguagePair(source, target)) {
      throw new BadRequestException('Choose two different supported languages.');
    }
  }

  private async unique<T>(operation: Promise<T>): Promise<T> {
    try { return await operation; }
    catch (error) {
      if ((error as { code?: string })?.code === 'P2002') throw new ConflictException('A vocabulary group or term with that value already exists.');
      throw error;
    }
  }

  list(ownerId: string) {
    return this.prisma.vocabularyGroup.findMany({
      where: { ownerId }, include: { entries: { orderBy: { source: 'asc' } } }, orderBy: { name: 'asc' },
    });
  }

  async createGroup(ownerId: string, input: GroupInput) {
    if (!input || typeof input !== 'object') throw new BadRequestException('Vocabulary group details are required.');
    const name = requiredText(input.name, 'Name', MAX_GROUP_NAME_LENGTH);
    const description = input.description === undefined || input.description === null
      ? null : requiredText(input.description, 'Description', MAX_DESCRIPTION_LENGTH);
    this.languagePair(input.sourceLanguage, input.targetLanguage);
    return this.unique(this.prisma.vocabularyGroup.create({
      data: { ownerId, name, description, sourceLanguage: input.sourceLanguage as Language, targetLanguage: input.targetLanguage as Language },
      include: { entries: true },
    }));
  }

  async updateGroup(id: string, ownerId: string, input: GroupInput) {
    if (!input || typeof input !== 'object') throw new BadRequestException('Vocabulary group details are required.');
    const group = await this.group(id, ownerId);
    const sourceLanguage = input.sourceLanguage === undefined ? group.sourceLanguage : input.sourceLanguage;
    const targetLanguage = input.targetLanguage === undefined ? group.targetLanguage : input.targetLanguage;
    this.languagePair(sourceLanguage, targetLanguage);
    if (sourceLanguage !== group.sourceLanguage || targetLanguage !== group.targetLanguage) {
      const activeJob = await this.prisma.translationJob.findFirst({
        where: { vocabularyGroupId: id, status: 'PROCESSING' }, select: { id: true },
      });
      if (activeJob) throw new BadRequestException('A vocabulary group cannot change languages while a job is processing.');
    }
    const data: Record<string, unknown> = { sourceLanguage, targetLanguage };
    if (input.name !== undefined) data.name = requiredText(input.name, 'Name', MAX_GROUP_NAME_LENGTH);
    if (input.description !== undefined) data.description = input.description === null
      ? null : requiredText(input.description, 'Description', MAX_DESCRIPTION_LENGTH);
    return this.unique(this.prisma.vocabularyGroup.update({ where: { id }, data, include: { entries: true } }));
  }

  async deleteGroup(id: string, ownerId: string) {
    await this.group(id, ownerId);
    await this.prisma.vocabularyGroup.delete({ where: { id } });
    return { ok: true };
  }

  async createEntry(groupId: string, ownerId: string, input: EntryInput) {
    await this.group(groupId, ownerId);
    const source = requiredText(input?.source, 'Source term', MAX_TERM_LENGTH);
    const target = requiredText(input?.target, 'Target term', MAX_TERM_LENGTH);
    const count = await this.prisma.vocabularyEntry.count({ where: { groupId } });
    if (count >= MAX_ENTRIES_PER_GROUP) throw new BadRequestException(`A vocabulary group can contain at most ${MAX_ENTRIES_PER_GROUP} terms.`);
    return this.unique(this.prisma.vocabularyEntry.create({ data: { groupId, source, target } }));
  }

  async updateEntry(groupId: string, entryId: string, ownerId: string, input: EntryInput) {
    await this.group(groupId, ownerId);
    const entry = await this.prisma.vocabularyEntry.findFirst({ where: { id: entryId, groupId } });
    if (!entry) throw new NotFoundException('Vocabulary term not found.');
    const data: Record<string, string> = {};
    if (input?.source !== undefined) data.source = requiredText(input.source, 'Source term', MAX_TERM_LENGTH);
    if (input?.target !== undefined) data.target = requiredText(input.target, 'Target term', MAX_TERM_LENGTH);
    if (!Object.keys(data).length) throw new BadRequestException('Provide a source or target term to update.');
    return this.unique(this.prisma.vocabularyEntry.update({ where: { id: entryId }, data }));
  }

  async deleteEntry(groupId: string, entryId: string, ownerId: string) {
    await this.group(groupId, ownerId);
    const entry = await this.prisma.vocabularyEntry.findFirst({ where: { id: entryId, groupId }, select: { id: true } });
    if (!entry) throw new NotFoundException('Vocabulary term not found.');
    await this.prisma.vocabularyEntry.delete({ where: { id: entryId } });
    return { ok: true };
  }
}
