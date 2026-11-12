import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { uuid } from "../../common/management-validation";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import { PrismaService } from "../persistence/prisma.service";
import { ProgressTrackingService } from "./progress-tracking.service";

@Controller("progress")
@UseGuards(JwtAuthGuard)
export class ProgressTrackingController {
  constructor(
    private readonly progressTrackingService: ProgressTrackingService,
    private readonly prisma: PrismaService,
  ) {}

  private async ownedJob(id: string, req: Request): Promise<string> {
    const jobId = uuid(id);
    const ownerId = String((req as any).user?.userId);
    const job = await this.prisma.translationJob.findFirst({
      where: { id: jobId, ownerId },
      select: { id: true },
    });
    if (!job) throw new NotFoundException("Job not found.");
    return jobId;
  }

  @Post(":jobId/save")
  async saveProgress(
    @Param("jobId") id: string,
    @Req() req: Request,
    @Body() progressData: unknown,
  ) {
    const jobId = await this.ownedJob(id, req);
    if (
      !progressData ||
      typeof progressData !== "object" ||
      Array.isArray(progressData) ||
      Buffer.byteLength(JSON.stringify(progressData)) > 65536
    ) {
      throw new BadRequestException(
        "Progress must be an object no larger than 64 KB.",
      );
    }
    this.progressTrackingService.saveProgress(jobId, progressData);
    return { success: true, message: "Progress saved" };
  }

  @Get(":jobId")
  async getProgress(@Param("jobId") id: string, @Req() req: Request) {
    const jobId = await this.ownedJob(id, req);
    return (
      this.progressTrackingService.getProgress(jobId) || {
        message: "No progress found",
      }
    );
  }

  @Post(":jobId/recover")
  async recoverProgress(@Param("jobId") id: string, @Req() req: Request) {
    const jobId = await this.ownedJob(id, req);
    return (
      this.progressTrackingService.recoverProgress(jobId) || {
        message: "No progress to recover",
      }
    );
  }
}
