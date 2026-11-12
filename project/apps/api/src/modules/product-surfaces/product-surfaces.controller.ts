import { Body, Controller, Delete, Get, Header, Param, Patch, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { ProductSurfacesService } from './product-surfaces.service';
import { strictObject } from '../../common/management-validation';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProductSurfacesController {
  constructor(private readonly service: ProductSurfacesService) {}
  private owner(req: Request): string { return String((req as any).user?.userId); }

  @Get('jobs/history') history(@Req() req: Request, @Query('cursor') cursor?: string, @Query('page') page?: string) { return this.service.history(this.owner(req), cursor, page ? Number(page) : 1); }
  @Get('history') historyList(@Req() req: Request, @Query('cursor') cursor?: string, @Query('page') page?: string) { return this.service.history(this.owner(req), cursor, page ? Number(page) : 1); }
  @Get('jobs/:id/preview') preview(@Param('id') id: string, @Req() req: Request, @Query('version') version = 'translated') { return this.service.preview(id, this.owner(req), version); }
  @Get('jobs/:id/preview-file') @Header('Cache-Control', 'no-store') async previewFile(@Param('id') id: string, @Req() req: Request, @Query('version') version = 'translated') { return new StreamableFile(await this.service.previewFile(id, this.owner(req), version), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'inline' }); }
  @Delete('jobs/:id') deleteJob(@Param('id') id: string, @Req() req: Request) { return this.service.deleteHistoryItem(id, this.owner(req)); }
  @Get('profile') profile(@Req() req: Request) { return this.service.getProfile(this.owner(req), Boolean((req as any).user?.isAdmin)); }
  @Patch('profile') updateProfile(@Req() req: Request, @Body() body: unknown) { return this.service.updateProfile(this.owner(req), strictObject(body, ['fullName', 'email'])); }
  @Get('changelog') changelog(@Query('cursor') cursor?: string) { return this.service.changelog(cursor); }
}
