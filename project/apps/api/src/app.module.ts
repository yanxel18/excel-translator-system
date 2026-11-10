import { Module } from '@nestjs/common';
import { FileUploadModule } from './modules/file-upload/file-upload.module';
import { TextExtractionModule } from './modules/text-extraction/text-extraction.module';
import { TranslationModule } from './modules/translation/translation.module';
import { JobManagementModule } from './modules/job-management/job-management.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { ProgressTrackingModule } from './modules/progress-tracking/progress-tracking.module';
import { PersistenceModule } from './modules/persistence/persistence.module';

@Module({
  imports: [
    PersistenceModule,
    FileUploadModule,
    TextExtractionModule,
    TranslationModule,
    JobManagementModule,
    AuthenticationModule,
    ProgressTrackingModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
