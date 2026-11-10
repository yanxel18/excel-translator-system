import { Module } from '@nestjs/common';
import { JobManagementController } from './job-management.controller';
import { JobManagementService } from './job-management.service';
import { TextExtractionModule } from '../text-extraction/text-extraction.module';
import { TranslationModule } from '../translation/translation.module';
import { AuthenticationModule } from '../authentication/authentication.module';

@Module({
  imports: [TextExtractionModule, TranslationModule, AuthenticationModule],
  controllers: [JobManagementController],
  providers: [JobManagementService],
  exports: [JobManagementService],
})
export class JobManagementModule {}
