import { BadRequestException, Injectable } from "@nestjs/common";
import { TextExtractionService } from "../text-extraction/text-extraction.service";
import { ApplicationSettingsService } from "../application-settings/application-settings.service";

@Injectable()
export class FileUploadService {
  constructor(
    private readonly extraction: TextExtractionService,
    private readonly settings: ApplicationSettingsService,
  ) {}

  async validateFile(file?: Express.Multer.File): Promise<boolean> {
    const { maxUploadSizeMb } = await this.settings.getSettings();
    return this.validateFileWithLimit(file, maxUploadSizeMb);
  }

  private async validateFileWithLimit(
    file: Express.Multer.File | undefined,
    maxUploadSizeMb: number,
  ): Promise<boolean> {
    if (
      !file ||
      !Buffer.isBuffer(file.buffer) ||
      !file.originalname?.toLowerCase().endsWith(".xlsx")
    )
      return false;
    if (file.size > maxUploadSizeMb * 1024 * 1024) return false;
    await this.extraction.openWorkbook(file.buffer, true);
    return true;
  }

  async uploadFile(file: Express.Multer.File) {
    const { maxUploadSizeMb } = await this.settings.getSettings();
    if (!(await this.validateFileWithLimit(file, maxUploadSizeMb)))
      throw new BadRequestException(
        `Upload must be a valid XLSX workbook no larger than ${maxUploadSizeMb} MB.`,
      );
    return {
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
      uploadedAt: new Date(),
    };
  }
}
