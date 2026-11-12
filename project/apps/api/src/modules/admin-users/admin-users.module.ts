import { Module } from "@nestjs/common";
import { AuthenticationModule } from "../authentication/authentication.module";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";

@Module({
  imports: [AuthenticationModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, AdminAuthGuard],
})
export class AdminUsersModule {}
