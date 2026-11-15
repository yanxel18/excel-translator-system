import { Module } from "@nestjs/common";
import { AuthenticationModule } from "../authentication/authentication.module";
import { BaseController } from "./base.controller";
import { BaseV2Controller } from "./base-v2.controller";
import { BaseService } from "./base.service";

@Module({
  imports: [AuthenticationModule],
  controllers: [BaseController, BaseV2Controller],
  providers: [BaseService],
})
export class BaseModule {}
