import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';

const PAGE_SIZE = 20;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, cursor?: string) {
    if (cursor && !(await this.prisma.notification.findFirst({ where: { id: cursor, userId: ownerId }, select: { id: true } }))) {
      throw new BadRequestException('Invalid notification cursor.');
    }
    const items = await this.prisma.notification.findMany({
      where: { userId: ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, jobId: true, type: true, title: true, message: true, isRead: true, createdAt: true },
    });
    const hasMore = items.length > PAGE_SIZE;
    const data = items.slice(0, PAGE_SIZE);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async markRead(ownerId: string, id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, userId: ownerId }, data: { isRead: true } });
    if (!result.count) throw new NotFoundException('Notification not found.');
    return { ok: true };
  }
}
