import { Controller, Post, UploadedFile, UseInterceptors, Req, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { FileUploadService } from './file-upload.service';
import { JobManagementService } from '../job-management/job-management.service';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class FileUploadController {
  constructor(private readonly uploads: FileUploadService, private readonly jobs: JobManagementService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    await this.uploads.uploadFile(file);
    return this.jobs.createJob(file.originalname, String((req as any).user?.userId ?? 'local-user'), file.buffer);
  }
}
