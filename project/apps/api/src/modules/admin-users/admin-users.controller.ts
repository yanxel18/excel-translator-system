import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../authentication/admin-auth.guard';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { AdminUsersService } from './admin-users.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get() list(@Query() query: unknown) { return this.users.list(query); }
  @Post() create(@Body() body: unknown) { return this.users.create(body); }
}
