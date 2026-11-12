import { Module } from "@nestjs/common";
import { TranslationController } from "./translation.controller";
import { TranslationService } from "./translation.service";
import { TextExtractionModule } from "../text-extraction/text-extraction.module";
import { AuthenticationModule } from "../authentication/authentication.module";

@Module({
  imports: [TextExtractionModule, AuthenticationModule],
  controllers: [TranslationController],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}
