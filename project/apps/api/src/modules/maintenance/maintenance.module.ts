import { Module } from "@nestjs/common";
import { AuthenticationModule } from "../authentication/authentication.module";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import {
  MaintenanceAdminController,
  MaintenanceNoticeController,
} from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";

@Module({
  imports: [AuthenticationModule],
  controllers: [MaintenanceAdminController, MaintenanceNoticeController],
  providers: [AdminAuthGuard, MaintenanceService],
})
export class MaintenanceModule {}
