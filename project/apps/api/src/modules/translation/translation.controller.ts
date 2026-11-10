import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';

@Controller('translate')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post('send')
  async sendTextForTranslation(@Body() payload: { textBatch: any[] }) {
    try {
      const result = await this.translationService.sendTextForTranslation(payload.textBatch);
      return result;
    } catch (error) {
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  @Post('validate')
  async validateTranslation(@Body() payload: { translationResult: any }) {
    try {
      const isValid = await this.translationService.validateTranslation(payload.translationResult);
      return { valid: isValid };
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  @Post('patch')
  async patchOOXML(@Body() payload: { originalFileBuffer: Buffer; translations: any[] }) {
    try {
      const patchedFile = await this.translationService.patchOOXML(payload.originalFileBuffer, payload.translations);
      return { patchedFile };
    } catch (error) {
      throw new Error(`OOXML patching failed: ${error.message}`);
    }
  }
}
