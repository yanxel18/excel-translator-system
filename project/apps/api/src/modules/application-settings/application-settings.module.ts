import { Module } from "@nestjs/common";
import { AuthenticationModule } from "../authentication/authentication.module";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import { ApplicationSettingsController } from "./application-settings.controller";
import { ApplicationSettingsService } from "./application-settings.service";

@Module({
  imports: [AuthenticationModule],
  controllers: [ApplicationSettingsController],
  providers: [AdminAuthGuard, ApplicationSettingsService],
  exports: [ApplicationSettingsService],
})
export class ApplicationSettingsModule {}
