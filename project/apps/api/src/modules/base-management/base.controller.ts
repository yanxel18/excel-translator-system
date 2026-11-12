import {
  Body,
  Controller,
  Delete,
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
import { BaseService } from "./base.service";

@Controller("admin/bases")
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class BaseController {
  constructor(private readonly service: BaseService) {}
  @Get() list(@Query() query: unknown) {
    return this.service.list(query);
  }
  @Post() create(@Body() body: unknown, @Req() request: Request) {
    return this.service.create(body, (request as any).user?.userId);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.service.update(id, body, (request as any).user?.userId);
  }
  @Delete(":id") remove(@Param("id") id: string, @Req() request: Request) {
    return this.service.remove(id, (request as any).user?.userId);
  }
}
