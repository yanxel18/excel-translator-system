import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TextExtractionService } from './text-extraction.service';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';
import { strictObject } from '../../common/management-validation';
import { workbookBuffer } from '../../common/workbook-input-validation';

@Controller('extract')
@UseGuards(JwtAuthGuard)
export class TextExtractionController {
  constructor(private readonly textExtractionService: TextExtractionService) {}

  @Post()
  async extractText(@Body() payload: unknown) {
    const input = strictObject(payload, ['fileBuffer']);
    return this.textExtractionService.extractTextFromXlsx(workbookBuffer(input.fileBuffer));
  }
}
