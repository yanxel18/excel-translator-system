import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import { AdminUsersService } from "./admin-users.service";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get() list(@Query() query: unknown) {
    return this.users.list(query);
  }
  @Get(":id") get(@Param("id") id: string) {
    return this.users.get(id);
  }
  @Post() create(@Body() body: unknown, @Req() request: Request) {
    return this.users.create(body, (request as any).user?.userId);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.users.update(id, body, (request as any).user?.userId);
  }
  @Patch(":id/password") resetPassword(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.users.resetPassword(id, body, (request as any).user?.userId);
  }
  @Patch(":id/base") assignBase(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.users.assignBase(id, body, (request as any).user?.userId);
  }
}
