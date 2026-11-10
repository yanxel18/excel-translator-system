import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { VocabularyService } from './vocabulary.service';

@Controller('vocabulary')
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(private readonly service: VocabularyService) {}
  private owner(req: Request): string { return String((req as any).user?.userId ?? 'local-user'); }

  @Get() list(@Req() req: Request) { return this.service.list(this.owner(req)); }
  @Post() createGroup(@Req() req: Request, @Body() body: Record<string, unknown>) { return this.service.createGroup(this.owner(req), body); }
  @Patch(':id') updateGroup(@Param('id') id: string, @Req() req: Request, @Body() body: Record<string, unknown>) { return this.service.updateGroup(id, this.owner(req), body); }
  @Delete(':id') deleteGroup(@Param('id') id: string, @Req() req: Request) { return this.service.deleteGroup(id, this.owner(req)); }
  @Post(':id/entries') createEntry(@Param('id') id: string, @Req() req: Request, @Body() body: Record<string, unknown>) { return this.service.createEntry(id, this.owner(req), body); }
  @Patch(':id/entries/:entryId') updateEntry(@Param('id') id: string, @Param('entryId') entryId: string, @Req() req: Request, @Body() body: Record<string, unknown>) { return this.service.updateEntry(id, entryId, this.owner(req), body); }
  @Delete(':id/entries/:entryId') deleteEntry(@Param('id') id: string, @Param('entryId') entryId: string, @Req() req: Request) { return this.service.deleteEntry(id, entryId, this.owner(req)); }
}
