import { BadRequestException } from '@nestjs/common';
import JSZip = require('jszip');
import { hasAttribute, sharedStringIndex } from './worksheet-cells';
import { selectWorksheets, WorksheetPart } from './worksheet-parts';
import { replaceVisibleText } from './xml-text';

export interface WorkbookTranslation {
  id: string;
  translated: string;
}

export async function patchWorkbook(zip: JSZip, worksheets: WorksheetPart[], translations: WorkbookTranslation[], selectedSheets?: string[]): Promise<Buffer> {
  const selected = selectWorksheets(worksheets, selectedSheets);
  const selectedParts = new Set(selected.map(({ part }) => part));
  const translatedValues = new Map(translations.map(({ id, translated }) => [id, translated]));
  const selectedShared = new Set<number>();
  const preservedShared = new Set<number>();

  for (const { name, part } of worksheets) {
    const xml = await zip.file(part)!.async('string');
    const isSelected = selected.some((sheet) => sheet.name === name);
    for (const match of xml.matchAll(/<c\b([^>]*)>[\s\S]*?<\/c>/g)) {
      if (!hasAttribute(match[1], 't', 's')) continue;
      const index = sharedStringIndex(match[0]);
      if (index === undefined) throw new BadRequestException('The workbook contains an invalid shared string reference.');
      if (/<f(?:\s[^>]*)?\s*\/?\s*>/.test(match[0])) {
        preservedShared.add(index);
      } else if (isSelected) {
        selectedShared.add(index);
      } else {
        preservedShared.add(index);
      }
    }
  }

  const clonedShared = new Map<number, number>();
  const sharedFile = zip.file('xl/sharedStrings.xml');
  if (sharedFile) {
    let xml = await sharedFile.async('string');
    const items = [...xml.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)];
    const clones: string[] = [];
    let sharedIndex = 0;
    xml = xml.replace(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g, (item) => {
      const index = sharedIndex++;
      const translated = translatedValues.get(`shared:${index}`);
      if (translated === undefined || !selectedShared.has(index)) return item;
      if (preservedShared.has(index)) {
        const nextIndex = items.length + clones.length;
        clonedShared.set(index, nextIndex);
        clones.push(replaceVisibleText(item, translated));
        return item;
      }
      return replaceVisibleText(item, translated);
    });

    if (clones.length) {
      const closeTag = /<\/(?:[A-Za-z_][\w.-]*:)?sst\s*>/.exec(xml);
      if (!closeTag) throw new BadRequestException('The workbook shared strings part is malformed.');
      xml = xml.slice(0, closeTag.index) + clones.join('') + xml.slice(closeTag.index);
      xml = xml.replace(/\buniqueCount=(['"])(\d+)\1/, (_all, quote) => `uniqueCount=${quote}${items.length + clones.length}${quote}`);
    }
    zip.file('xl/sharedStrings.xml', xml);
  } else if (selectedShared.size) {
    throw new BadRequestException('The workbook is missing shared strings referenced by a selected worksheet.');
  }

  for (const part of selectedParts) {
    let xml = await zip.file(part)!.async('string');
    if (clonedShared.size) {
      xml = xml.replace(/<c\b([^>]*)>[\s\S]*?<\/c>/g, (cell, attributes) => {
        if (!hasAttribute(attributes, 't', 's') || /<f(?:\s[^>]*)?\s*\/?\s*>/.test(cell)) return cell;
        const index = sharedStringIndex(cell);
        const replacement = index === undefined ? undefined : clonedShared.get(index);
        return replacement === undefined ? cell : cell.replace(/<v(?:\s[^>]*)?>\d+<\/v>/, (value) => value.replace(/>\d+</, `>${replacement}<`));
      });
    }

    let inlineIndex = 0;
    xml = xml.replace(/<c\b[^>]*>[\s\S]*?<\/c>/g, (cell) => {
      const inlineIndexForCell = /<is(?:\s[^>]*)?>/.test(cell) ? inlineIndex++ : undefined;
      if (inlineIndexForCell === undefined || /<f(?:\s[^>]*)?\s*\/?\s*>/.test(cell)) return cell;
      const id = `inline:${part}:${inlineIndexForCell}`;
      const translated = translatedValues.get(id);
      if (translated === undefined) return cell;
      return cell.replace(/(<is(?:\s[^>]*)?>)([\s\S]*?)(<\/is>)/, (_all, open, content, close) => open + replaceVisibleText(content, translated) + close);
    });
    zip.file(part, xml);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
