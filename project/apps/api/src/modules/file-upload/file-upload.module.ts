import { Module } from "@nestjs/common";
import { FileUploadController } from "./file-upload.controller";
import { FileUploadService } from "./file-upload.service";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JobManagementModule } from "../job-management/job-management.module";
import { TextExtractionModule } from "../text-extraction/text-extraction.module";
import { AuthenticationModule } from "../authentication/authentication.module";
import { ApplicationSettingsModule } from "../application-settings/application-settings.module";
import { UploadAdmissionService } from "./upload-admission.service";
import { UploadAdmissionInterceptor } from "./upload-admission.interceptor";

@Module({
  imports: [
    JobManagementModule,
    TextExtractionModule,
    AuthenticationModule,
    ApplicationSettingsModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    }),
  ],
  controllers: [FileUploadController],
  providers: [
    FileUploadService,
    UploadAdmissionService,
    UploadAdmissionInterceptor,
  ],
  exports: [FileUploadService, UploadAdmissionService],
})
export class FileUploadModule {}
