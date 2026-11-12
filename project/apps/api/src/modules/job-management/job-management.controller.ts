import { Body, Controller, Post, Get, Param, Put, Patch, Req, Res, HttpStatus, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { DatabaseJobManagementService } from './database-job-management.service';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { strictObject, uuid } from '../../common/management-validation';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobManagementController {
  constructor(private readonly service: DatabaseJobManagementService) {}
  private owner(req: Request): string { return String((req as any).user?.userId ?? 'local-user'); }

  @Post(':id/start') start(@Param('id') id: string, @Req() req: Request) { return this.service.startJob(uuid(id), this.owner(req)); }
  @Post(':id/retry') retry(@Param('id') id: string, @Req() req: Request) { return this.service.retryJob(uuid(id), this.owner(req)); }
  @Get(':id') get(@Param('id') id: string, @Req() req: Request) { return this.service.getJob(uuid(id), this.owner(req)); }
  @Patch(':id/settings') updateSettings(@Param('id') id: string, @Req() req: Request, @Body() body: { selectedSheets?: unknown; sourceLanguage?: unknown; targetLanguage?: unknown; vocabularyGroupId?: unknown }) { return this.service.updateJobSettings(uuid(id), this.owner(req), strictObject(body, ['selectedSheets', 'sourceLanguage', 'targetLanguage', 'vocabularyGroupId'])); }
  @Get() list(@Req() req: Request) { return this.service.getJobList(this.owner(req)); }
  @Put(':id/cancel') cancel(@Param('id') id: string, @Req() req: Request) { return this.service.cancelJob(uuid(id), this.owner(req)); }

  @Get(':id/download') async download(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const file = await this.service.getDownload(uuid(id), this.owner(req));
    res.status(HttpStatus.OK).set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      'Content-Length': file.buffer.length,
    }).send(file.buffer);
  }
}
