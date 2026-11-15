import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { FileUploadService } from "./file-upload.service";
import { DatabaseJobManagementService } from "../job-management/database-job-management.service";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import { UploadAdmissionInterceptor } from "./upload-admission.interceptor";

@Controller("upload")
@UseGuards(JwtAuthGuard)
export class FileUploadController {
  constructor(
    private readonly uploads: FileUploadService,
    private readonly jobs: DatabaseJobManagementService,
  ) {}

  @Post()
  @UseInterceptors(UploadAdmissionInterceptor)
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    await this.uploads.uploadFile(file);
    return this.jobs.createJob(
      file.originalname,
      String((req as any).user?.userId ?? "local-user"),
      file.buffer,
    );
  }
}
