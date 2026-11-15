import { Module } from "@nestjs/common";
import { SystemInfoController } from "./system-info.controller";
import { ApplicationSettingsModule } from "../application-settings/application-settings.module";

@Module({
  imports: [ApplicationSettingsModule],
  controllers: [SystemInfoController],
})
export class SystemInfoModule {}
