import { Module } from "@nestjs/common";
import { AuthenticationModule } from "../authentication/authentication.module";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { AdminUsersV2Controller } from "./admin-users-v2.controller";

@Module({
  imports: [AuthenticationModule],
  controllers: [AdminUsersController, AdminUsersV2Controller],
  providers: [AdminUsersService, AdminAuthGuard],
})
export class AdminUsersModule {}
