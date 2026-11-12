import { Body, Controller, Delete, Get, Header, Param, Patch, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { ProductSurfacesService } from './product-surfaces.service';
import { choice, pageNumber, requiredText, strictObject, uuid } from '../../common/management-validation';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProductSurfacesController {
  constructor(private readonly service: ProductSurfacesService) {}
  private owner(req: Request): string { return String((req as any).user?.userId); }

  @Get('jobs/history') history(@Req() req: Request, @Query() query: unknown) { const input = strictObject(query, ['cursor', 'page']); return this.service.history(this.owner(req), input.cursor === undefined ? undefined : uuid(input.cursor), pageNumber(input.page, 1, 100000)); }
  @Get('history') historyList(@Req() req: Request, @Query() query: unknown) { const input = strictObject(query, ['cursor', 'page']); return this.service.history(this.owner(req), input.cursor === undefined ? undefined : uuid(input.cursor), pageNumber(input.page, 1, 100000)); }
  @Get('jobs/:id/preview') preview(@Param('id') id: string, @Req() req: Request, @Query() query: unknown) { const { version = 'translated' } = strictObject(query, ['version']); return this.service.preview(uuid(id), this.owner(req), choice(version, ['source', 'translated'] as const, 'preview version')); }
  @Get('jobs/:id/preview-file') @Header('Cache-Control', 'no-store') async previewFile(@Param('id') id: string, @Req() req: Request, @Query() query: unknown) { const { version = 'translated' } = strictObject(query, ['version']); return new StreamableFile(await this.service.previewFile(uuid(id), this.owner(req), choice(version, ['source', 'translated'] as const, 'preview version')), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'inline' }); }
  @Delete('jobs/:id') deleteJob(@Param('id') id: string, @Req() req: Request) { return this.service.deleteHistoryItem(uuid(id), this.owner(req)); }
  @Get('profile') profile(@Req() req: Request) { return this.service.getProfile(this.owner(req), Boolean((req as any).user?.isAdmin)); }
  @Patch('profile') updateProfile(@Req() req: Request, @Body() body: unknown) { return this.service.updateProfile(this.owner(req), strictObject(body, ['fullName', 'email'])); }
  @Get('changelog') changelog(@Query() query: unknown) { const { cursor } = strictObject(query, ['cursor']); return this.service.changelog(cursor === undefined ? undefined : requiredText(cursor, 'Cursor', 128)); }
}
