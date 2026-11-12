import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { strictObject } from '../../common/management-validation';
import { extractedBatch, translationRows, workbookBuffer } from '../../common/workbook-input-validation';
import { TranslationService } from './translation.service';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';

@Controller('translate')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post('send')
  async sendTextForTranslation(@Body() payload: unknown) {
    const input = strictObject(payload, ['textBatch']);
    return this.translationService.sendTextForTranslation(extractedBatch(input.textBatch));
  }

  @Post('validate')
  async validateTranslation(@Body() payload: unknown) {
    const input = strictObject(payload, ['translationResult']);
    return { valid: await this.translationService.validateTranslation(translationRows(input.translationResult)) };
  }

  @Post('patch')
  async patchOOXML(@Body() payload: unknown) {
    const input = strictObject(payload, ['originalFileBuffer', 'translations']);
    return { patchedFile: await this.translationService.patchOOXML(workbookBuffer(input.originalFileBuffer), translationRows(input.translations)) };
  }
}
