import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  private owner(req: Request): string { return String((req as any).user?.userId); }

  @Get() list(@Req() req: Request, @Query('cursor') cursor?: string) {
    return this.service.list(this.owner(req), cursor);
  }

  @Patch(':id/read') markRead(@Req() req: Request, @Param('id') id: string) {
    return this.service.markRead(this.owner(req), id);
  }
}
