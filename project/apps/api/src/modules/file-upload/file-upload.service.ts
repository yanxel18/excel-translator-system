import { BadRequestException, Injectable } from '@nestjs/common';
import { TextExtractionService } from '../text-extraction/text-extraction.service';

@Injectable()
export class FileUploadService {
  constructor(private readonly extraction: TextExtractionService) {}

  async validateFile(file?: Express.Multer.File): Promise<boolean> {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.originalname?.toLowerCase().endsWith('.xlsx')) return false;
    if (file.size > 50 * 1024 * 1024) return false;
    await this.extraction.openWorkbook(file.buffer);
    return true;
  }

  async uploadFile(file: Express.Multer.File) {
    if (!(await this.validateFile(file))) throw new BadRequestException('Upload must be a valid XLSX workbook under 50 MB.');
    return { fileName: file.originalname, fileSize: file.size, fileType: file.mimetype, uploadedAt: new Date() };
  }
}
