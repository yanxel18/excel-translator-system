import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { uuid } from '../../common/management-validation';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  private owner(req: Request): string { return String((req as any).user?.userId); }

  @Get() list(@Req() req: Request, @Query('cursor') cursor?: string) {
    return this.service.list(this.owner(req), cursor === undefined ? undefined : uuid(cursor));
  }

  @Get('unread-count') countUnread(@Req() req: Request) {
    return this.service.countUnread(this.owner(req));
  }

  @Patch(':id/read') markRead(@Req() req: Request, @Param('id') id: string) {
    return this.service.markRead(this.owner(req), uuid(id));
  }
}
