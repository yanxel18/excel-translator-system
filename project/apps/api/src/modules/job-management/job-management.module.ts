import { Module } from "@nestjs/common";
import { JobManagementController } from "./job-management.controller";
import { DatabaseJobManagementService } from "./database-job-management.service";
import { TextExtractionModule } from "../text-extraction/text-extraction.module";
import { TranslationModule } from "../translation/translation.module";
import { AuthenticationModule } from "../authentication/authentication.module";
import { ApplicationSettingsModule } from "../application-settings/application-settings.module";

@Module({
  imports: [
    TextExtractionModule,
    TranslationModule,
    AuthenticationModule,
    ApplicationSettingsModule,
  ],
  controllers: [JobManagementController],
  providers: [DatabaseJobManagementService],
  exports: [DatabaseJobManagementService],
})
export class JobManagementModule {}
