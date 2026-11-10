import { Body, Controller, Delete, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { ProductSurfacesService } from './product-surfaces.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProductSurfacesController {
  constructor(private readonly service: ProductSurfacesService) {}
  private owner(req: Request): string { return String((req as any).user?.userId); }

  @Get('jobs/history') history(@Req() req: Request, @Query('cursor') cursor?: string) { return this.service.history(this.owner(req), cursor); }
  @Get('jobs/:id/preview') preview(@Param('id') id: string, @Req() req: Request, @Query('version') version = 'translated') { return this.service.preview(id, this.owner(req), version); }
  @Delete('jobs/:id') deleteJob(@Param('id') id: string, @Req() req: Request) { return this.service.deleteHistoryItem(id, this.owner(req)); }
  @Get('profile') profile(@Req() req: Request) { return this.service.getProfile(this.owner(req)); }
  @Patch('profile') updateProfile(@Req() req: Request, @Body() body: { fullName?: unknown; email?: unknown }) { return this.service.updateProfile(this.owner(req), body); }
  @Get('changelog') changelog(@Query('cursor') cursor?: string) { return this.service.changelog(cursor); }
}
