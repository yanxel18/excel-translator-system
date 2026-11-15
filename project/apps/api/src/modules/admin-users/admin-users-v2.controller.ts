import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import { AuthenticatedUser } from "../authentication/authentication.service";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import { AdminUsersService } from "./admin-users.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller("v2/admin/users")
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminUsersV2Controller {
  constructor(private readonly users: AdminUsersService) {}

  @Get(":id") get(@Param("id") id: string) {
    return this.users.getV2(id);
  }
  @Post() create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.users.createV2(body, request.user.userId);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.updateV2(id, body, request.user.userId);
  }
}
