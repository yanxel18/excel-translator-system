import { BadRequestException } from '@nestjs/common';
import JSZip = require('jszip');
import { selectWorksheets, WorksheetPart } from './worksheet-parts';
import { hasAttribute, sharedStringIndex } from './worksheet-cells';
import { visibleText } from './xml-text';

export interface ExtractedText {
  id: string;
  value: string;
  source: 'shared' | 'inline';
  part: string;
  index: number;
}

export async function extractWorkbookText(zip: JSZip, worksheets: WorksheetPart[], selectedSheets?: string[]): Promise<ExtractedText[]> {
  const chosen = selectWorksheets(worksheets, selectedSheets);
  const sheetXml = new Map<string, string>();
  const sharedIndexes = new Set<number>();

  for (const { part } of chosen) {
    const xml = await zip.file(part)!.async('string');
    sheetXml.set(part, xml);
    for (const cellMatch of xml.matchAll(/<c\b([^>]*)>[\s\S]*?<\/c>/g)) {
      if (!hasAttribute(cellMatch[1], 't', 's')) continue;
      const index = sharedStringIndex(cellMatch[0]);
      if (index === undefined) continue;
      if (!/<f(?:\s[^>]*)?\s*\/?\s*>/.test(cellMatch[0])) sharedIndexes.add(index);
    }
  }

  const sharedFile = zip.file('xl/sharedStrings.xml');
  if (sharedIndexes.size && !sharedFile) throw new BadRequestException('The workbook is missing shared strings referenced by a worksheet.');

  const result: ExtractedText[] = [];
  if (sharedFile) {
    const xml = await sharedFile.async('string');
    const items = [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)];
    for (const index of sharedIndexes) {
      if (!items[index]) throw new BadRequestException('The workbook references an invalid shared string.');
      const value = visibleText(items[index][1]);
      if (value.trim()) result.push({ id: `shared:${index}`, value, source: 'shared', part: 'xl/sharedStrings.xml', index });
    }
  }

  for (const { part } of chosen) {
    const xml = sheetXml.get(part)!;
    let index = 0;
    for (const cell of xml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const inline = /<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/.exec(cell[0]);
      if (!inline) continue;
      const cellIndex = index++;
      if (/<f(?:\s[^>]*)?\s*\/?\s*>/.test(cell[0])) continue;
      const value = visibleText(inline[1]);
      if (value.trim()) result.push({ id: `inline:${part}:${cellIndex}`, value, source: 'inline', part, index: cellIndex });
    }
  }

  return result;
}
