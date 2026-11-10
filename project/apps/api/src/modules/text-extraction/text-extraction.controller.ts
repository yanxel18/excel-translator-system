import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TextExtractionService } from './text-extraction.service';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';

@Controller('extract')
@UseGuards(JwtAuthGuard)
export class TextExtractionController {
  constructor(private readonly textExtractionService: TextExtractionService) {}

  @Post()
  async extractText(@Body() payload: { fileBuffer: Buffer }) {
    try {
      const extractedText = await this.textExtractionService.extractTextFromXlsx(payload.fileBuffer);
      return extractedText;
    } catch (error) {
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }
}
