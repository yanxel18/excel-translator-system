import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../authentication/admin-auth.guard';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { BaseService } from './base.service';

@Controller('admin/bases')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class BaseController {
  constructor(private readonly service: BaseService) {}
  @Get() list(@Query() query: unknown) { return this.service.list(query); }
  @Post() create(@Body() body: unknown) { return this.service.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.service.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
