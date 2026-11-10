import { Module } from '@nestjs/common';
import { TextExtractionController } from './text-extraction.controller';
import { TextExtractionService } from './text-extraction.service';
import { AuthenticationModule } from '../authentication/authentication.module';

@Module({
  imports: [AuthenticationModule],
  controllers: [TextExtractionController],
  providers: [TextExtractionService],
  exports: [TextExtractionService],
})
export class TextExtractionModule {}
