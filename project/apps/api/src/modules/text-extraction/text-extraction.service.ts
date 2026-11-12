import { Injectable } from "@nestjs/common";
import JSZip = require("jszip");
import { openWorkbookArchive } from "../workbook-ooxml/archive";
import {
  extractWorkbookText,
  ExtractedText,
} from "../workbook-ooxml/text-extractor";
import {
  getWorksheetParts,
  WorksheetPart,
} from "../workbook-ooxml/worksheet-parts";

export { ExtractedText } from "../workbook-ooxml/text-extractor";

@Injectable()
export class TextExtractionService {
  openWorkbook(buffer: Buffer, verifyCrc32 = false): Promise<JSZip> {
    return openWorkbookArchive(buffer, verifyCrc32);
  }

  getWorksheetParts(zip: JSZip): Promise<WorksheetPart[]> {
    return getWorksheetParts(zip);
  }

  async getSheetNames(fileBuffer: Buffer): Promise<string[]> {
    const zip = await this.openWorkbook(fileBuffer);
    return (await this.getWorksheetParts(zip)).map(({ name }) => name);
  }

  async extractTextFromXlsx(
    fileBuffer: Buffer,
    selectedSheets?: string[],
  ): Promise<ExtractedText[]> {
    const zip = await this.openWorkbook(fileBuffer);
    const worksheets = await this.getWorksheetParts(zip);
    return extractWorkbookText(zip, worksheets, selectedSheets);
  }
}
