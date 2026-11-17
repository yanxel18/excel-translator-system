import { Module } from "@nestjs/common";
import { FileUploadController } from "./file-upload.controller";
import { FileUploadService } from "./file-upload.service";
import { MulterModule } from "@nestjs/platform-express";
import { JobManagementModule } from "../job-management/job-management.module";
import { TextExtractionModule } from "../text-extraction/text-extraction.module";
import { AuthenticationModule } from "../authentication/authentication.module";
import { ApplicationSettingsModule } from "../application-settings/application-settings.module";
import { UploadAdmissionService } from "./upload-admission.service";
import { UploadAdmissionInterceptor } from "./upload-admission.interceptor";
import { UploadSessionService } from "./upload-session.service";
import { UploadSessionController } from "./upload-session.controller";
import { MAX_MAX_UPLOAD_SIZE_MB } from "../application-settings/application-settings.constants";

@Module({
  imports: [
    JobManagementModule,
    TextExtractionModule,
    AuthenticationModule,
    ApplicationSettingsModule,
    MulterModule.register({
      limits: { fileSize: MAX_MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1 },
    }),
  ],
  controllers: [FileUploadController, UploadSessionController],
  providers: [
    FileUploadService,
    UploadAdmissionService,
    UploadAdmissionInterceptor,
    UploadSessionService,
  ],
  exports: [FileUploadService, UploadAdmissionService, UploadSessionService],
})
export class FileUploadModule {}
