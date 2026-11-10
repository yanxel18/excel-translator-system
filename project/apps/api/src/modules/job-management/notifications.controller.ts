import { BadRequestException, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { PrismaService } from '../persistence/prisma.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: Request, @Query('cursor') cursor?: string) {
    const userId = String((req as any).user.userId);
    if (cursor && !(await this.prisma.notification.findFirst({ where: { id: cursor, userId }, select: { id: true } }))) {
      throw new BadRequestException('Invalid notification cursor.');
    }
    const items = await this.prisma.notification.findMany({
      where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, jobId: true, type: true, title: true, message: true, isRead: true, createdAt: true },
    });
    const hasMore = items.length > 20;
    const data = items.slice(0, 20);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  @Patch(':id/read')
  async markRead(@Req() req: Request, @Param('id') id: string) {
    const userId = String((req as any).user.userId);
    const result = await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    if (!result.count) throw new BadRequestException('Notification not found.');
    return { ok: true };
  }
}
