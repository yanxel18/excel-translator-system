import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';

const INITIAL_PAGE_SIZE = 10;
const NEXT_PAGE_SIZE = 5;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, cursor?: string) {
    const pageSize = cursor ? NEXT_PAGE_SIZE : INITIAL_PAGE_SIZE;
    if (cursor && !(await this.prisma.notification.findFirst({ where: { id: cursor, userId: ownerId }, select: { id: true } }))) {
      throw new BadRequestException('Invalid notification cursor.');
    }
    const items = await this.prisma.notification.findMany({
      where: { userId: ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, jobId: true, type: true, title: true, message: true, isRead: true, createdAt: true },
    });
    const hasMore = items.length > pageSize;
    const data = items.slice(0, pageSize);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async countUnread(ownerId: string) {
    return { count: await this.prisma.notification.count({ where: { userId: ownerId, isRead: false } }) };
  }

  async markRead(ownerId: string, id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, userId: ownerId }, data: { isRead: true } });
    if (!result.count) throw new NotFoundException('Notification not found.');
    return { ok: true };
  }
}
