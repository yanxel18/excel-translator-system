import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import { AuthenticatedUser } from "../authentication/authentication.service";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import { BaseService } from "./base.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller("v2/bases")
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class BaseV2Controller {
  constructor(private readonly service: BaseService) {}

  @Get() list(@Query() query: unknown) {
    return this.service.listV2(query);
  }
  @Get(":acronym") get(@Param("acronym") acronym: string) {
    return this.service.getV2(acronym);
  }
  @Post() create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.service.createV2(body, request.user.userId);
  }
  @Patch(":acronym") update(
    @Param("acronym") acronym: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateV2(acronym, body, request.user.userId);
  }
  @Delete(":acronym") remove(@Param("acronym") acronym: string, @Req() request: AuthenticatedRequest) {
    return this.service.removeV2(acronym, request.user.userId);
  }
}
