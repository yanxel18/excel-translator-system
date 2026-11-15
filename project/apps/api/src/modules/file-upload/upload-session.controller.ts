import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthenticatedUser } from "../authentication/authentication.service";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import { UploadSessionService } from "./upload-session.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller("upload-sessions")
@UseGuards(JwtAuthGuard)
export class UploadSessionController {
  constructor(private readonly sessions: UploadSessionService) {}

  @Post()
  async create(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.withRetryHeader(response, async () =>
      this.sessions.toPublicResponse(await this.sessions.create(request.user.userId, body)),
    );
  }

  @Get(":id")
  getStatus(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.sessions.getStatus(request.user.userId, id);
  }

  @Delete(":id")
  async cancel(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.withRetryHeader(response, () => this.sessions.cancel(request.user.userId, id));
  }

  private async withRetryHeader<T>(response: Response, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) {
        const body = error.getResponse();
        if (
          typeof body === "object" &&
          body !== null &&
          "code" in body &&
          (body.code === "UPLOAD_BUSY" || body.code === "UPLOAD_CAPACITY_BUSY")
        )
          response.setHeader("Retry-After", "1");
      }
      throw error;
    }
  }
}
