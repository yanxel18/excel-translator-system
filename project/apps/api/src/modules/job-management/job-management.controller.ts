import { Controller, Post, Get, Param, Put, Req, Res, HttpStatus, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JobManagementService } from './job-management.service';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobManagementController {
  constructor(private readonly service: JobManagementService) {}
  private owner(req: Request): string { return String((req as any).user?.userId ?? 'local-user'); }

  @Post(':id/start') start(@Param('id') id: string, @Req() req: Request) { return this.service.startJob(id, this.owner(req)); }
  @Post(':id/retry') retry(@Param('id') id: string, @Req() req: Request) { return this.service.retryJob(id, this.owner(req)); }
  @Get(':id') get(@Param('id') id: string, @Req() req: Request) { return this.service.getJob(id, this.owner(req)); }
  @Get() list(@Req() req: Request) { return this.service.getJobList(this.owner(req)); }
  @Put(':id/cancel') cancel(@Param('id') id: string, @Req() req: Request) { return this.service.cancelJob(id, this.owner(req)); }

  @Get(':id/download') async download(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const file = await this.service.getDownload(id, this.owner(req));
    res.status(HttpStatus.OK).set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      'Content-Length': file.buffer.length,
    }).send(file.buffer);
  }
}
