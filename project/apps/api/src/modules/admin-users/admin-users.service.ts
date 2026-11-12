import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { choice, pageNumber, requiredEmail, requiredText, strictObject, uuid } from '../../common/management-validation';
import { hashPassword } from '../authentication/passwords';
import { PrismaService } from '../persistence/prisma.service';

const userSelect = { id: true, gid: true, username: true, email: true, baseId: true, enabled: true, base: { select: { id: true, code: true, name: true } } };
const pageSizes = ['10', '20', '30', '40', '50'] as const;
const sortFields = ['gid', 'username', 'email', 'base', 'enabled'] as const;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(value: unknown) {
    const input = strictObject(value, ['gid', 'username', 'email', 'baseId', 'password']);
    if (typeof input.gid === 'string' && /[\u0000-\u001f\u007f-\u009f]/.test(input.gid)) throw new BadRequestException('GID cannot contain control characters.');
    const gid = requiredText(input.gid, 'GID', 64);
    const username = requiredText(input.username, 'Username', 100);
    const email = requiredEmail(input.email);
    const baseId = uuid(input.baseId);
    const password = input.password;
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new BadRequestException('Password must contain 12 to 128 characters.');
    if ((process.env.ADMIN_USERNAMES || '').split(',').some((name) => name.trim().toLowerCase() === username.toLowerCase())) {
      throw new BadRequestException('This username is reserved for configured administrators.');
    }
    const passwordHash = await hashPassword(password);
    try {
      return await this.prisma.$transaction(async (client) => {
        // The case-insensitive GID database constraint is required to enforce this check under concurrency.
        const tx = client as any;
        if (!await tx.base.findUnique({ where: { id: baseId }, select: { id: true } })) throw new BadRequestException('Choose an existing Base.');
        if (await tx.user.findFirst({ where: { OR: [{ gid: { equals: gid, mode: 'insensitive' } }, { username }, { email: { equals: email, mode: 'insensitive' } }] }, select: { id: true } })) {
          throw new ConflictException('GID, username or email is already in use.');
        }
        const user = await tx.user.create({ data: { gid, username, email, baseId, passwordHash, identities: { create: { provider: 'LOCAL', subject: username } } }, select: userSelect });
        return { id: user.id, gid: user.gid, username: user.username, email: user.email, baseId: user.baseId, enabled: user.enabled, base: user.base };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (['P2002', 'P2034'].includes((error as { code?: string }).code || '')) throw new ConflictException('GID, username or email is already in use, or registration conflicted. Please retry.');
      if ((error as { code?: string }).code === 'P2003') throw new BadRequestException('Choose an existing Base.');
      throw error;
    }
  }

  async assignBase(id: unknown, value: unknown) {
    const input = strictObject(value, ['baseId']);
    const userId = uuid(id);
    const baseId = uuid(input.baseId);
    try {
      return await this.prisma.user.update({ where: { id: userId }, data: { baseId }, select: userSelect });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2003') throw new BadRequestException('Choose an existing Base.');
      if (code === 'P2025') throw new NotFoundException('User not found.');
      throw error;
    }
  }

  async list(value: unknown) {
    const query = strictObject(value, ['q', 'baseId', 'enabled', 'sort', 'direction', 'page', 'pageSize']);
    const q = query.q === undefined || query.q === '' ? '' : requiredText(query.q, 'Search', 120);
    const baseId = query.baseId === undefined || query.baseId === '' ? undefined : uuid(query.baseId);
    const enabled = query.enabled === undefined || query.enabled === '' ? undefined : choice(query.enabled, ['true', 'false'] as const, 'enabled filter') === 'true';
    const sort = choice(query.sort ?? 'username', sortFields, 'sort');
    const direction = choice(query.direction ?? 'asc', ['asc', 'desc'] as const, 'direction');
    const page = pageNumber(query.page, 1, 100000);
    const pageSize = Number(choice(query.pageSize ?? '10', pageSizes, 'page size'));
    const where: any = { ...(baseId ? { baseId } : {}), ...(enabled === undefined ? {} : { enabled }) };
    if (q) where.OR = [
      { gid: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } }, { base: { is: { code: { contains: q, mode: 'insensitive' } } } },
      { base: { is: { name: { contains: q, mode: 'insensitive' } } } },
      ...(['enabled', 'disabled'].includes(q.toLowerCase()) ? [{ enabled: q.toLowerCase() === 'enabled' }] : []),
    ];
    const orderBy: any = [sort === 'base' ? { base: { name: direction } } : { [sort]: direction }, { id: 'asc' }];
    const users = this.prisma.user as any;
    const [data, total] = await Promise.all([users.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: userSelect }), users.count({ where })]);
    return { data, total, page, pageSize };
  }
}
