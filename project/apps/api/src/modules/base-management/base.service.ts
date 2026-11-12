import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { choice, pageNumber, requiredText, strictObject, uuid } from '../../common/management-validation';
import { PrismaService } from '../persistence/prisma.service';

@Injectable()
export class BaseService {
  constructor(private readonly prisma: PrismaService) {}

  async list(raw: unknown) {
    const input = strictObject(raw, ['q', 'sort', 'direction', 'page', 'pageSize']);
    const q = input.q === undefined || input.q === '' ? '' : requiredText(input.q, 'Search', 100);
    const sort = choice(input.sort ?? 'code', ['code', 'name'] as const, 'sort');
    const direction = choice(input.direction ?? 'asc', ['asc', 'desc'] as const, 'direction');
    const page = pageNumber(input.page, 1, 1000000);
    const pageSize = pageNumber(input.pageSize, 10, 50);
    if (![10, 20, 30, 40, 50].includes(pageSize)) throw new BadRequestException('Invalid page size.');
    const where = q ? { OR: [{ code: { contains: q, mode: 'insensitive' as const } }, { name: { contains: q, mode: 'insensitive' as const } }] } : {};
    const [data, total] = await Promise.all([
      this.prisma.base.findMany({ where, orderBy: [{ [sort]: direction }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.base.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async create(raw: unknown) {
    const input = strictObject(raw, ['code', 'name']);
    const code = this.code(input.code);
    const name = requiredText(input.name, 'Name', 100);
    try { return await this.prisma.base.create({ data: { code, name } }); }
    catch (error) { this.translateError(error); }
  }

  async update(id: unknown, raw: unknown) {
    const input = strictObject(raw, ['code', 'name']);
    if (!Object.keys(input).length) throw new BadRequestException('No changes supplied.');
    const data = {
      ...(input.code !== undefined ? { code: this.code(input.code) } : {}),
      ...(input.name !== undefined ? { name: requiredText(input.name, 'Name', 100) } : {}),
    };
    try { return await this.prisma.base.update({ where: { id: uuid(id) }, data }); }
    catch (error) { this.translateError(error); }
  }

  async remove(id: unknown) {
    try { return await this.prisma.base.delete({ where: { id: uuid(id) } }); }
    catch (error) { this.translateError(error); }
  }

  private code(value: unknown): string {
    const code = requiredText(value, 'Code', 32).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) throw new BadRequestException('Invalid base code.');
    return code;
  }

  private translateError(error: unknown): never {
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') throw new ConflictException('A base with this code already exists.');
    if (code === 'P2003') throw new ConflictException('This base is assigned to users. Reassign them before deleting it.');
    if (code === 'P2025') throw new NotFoundException('Base not found.');
    throw error;
  }
}
