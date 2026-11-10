import { BadRequestException, Injectable } from '@nestjs/common';
import JSZip = require('jszip');

export interface ExtractedText {
  id: string;
  value: string;
  source: 'shared' | 'inline';
  part: string;
  index: number;
}

const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10000;

function xmlText(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function visibleTextNodes(fragment: string): string[] {
  return [...fragment.matchAll(/<rPh\b[^>]*>[\s\S]*?<\/rPh>|<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g)]
    .map(([element]) => element)
    .filter((element) => element.startsWith('<t'));
}

export function visibleText(fragment: string): string {
  return visibleTextNodes(fragment).map((element) => {
    const match = /^<t(?:\s[^>]*)?>([\s\S]*?)<\/t>$/.exec(element);
    return match ? xmlText(match[1]) : '';
  }).join('');
}

export function replaceVisibleText(fragment: string, value: string): string {
  const nodes = visibleTextNodes(fragment);
  if (!nodes.length) return fragment;

  const nonEmptyIndex = nodes.findIndex((element) => {
    const match = /^<t(?:\s[^>]*)?>([\s\S]*?)<\/t>$/.exec(element);
    return match ? xmlText(match[1]).length > 0 : false;
  });
  const targetIndex = nonEmptyIndex < 0 ? 0 : nonEmptyIndex;
  let textIndex = 0;
  return fragment.replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>|<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g, (element) => {
    if (element.startsWith('<rPh')) return element;
    const index = textIndex++;
    const match = /^(<t(?:\s[^>]*)?>)[\s\S]*?(<\/t>)$/.exec(element);
    if (!match) return element;
    let openTag = match[1];
    const text = index === targetIndex ? escapeXml(value) : '';
    if (index === targetIndex && /^\s|\s$/.test(value)) {
      if (/\bxml:space\s*=/.test(openTag)) {
        openTag = openTag.replace(/\bxml:space\s*=\s*(["'])[^"']*\1/, 'xml:space="preserve"');
      } else {
        openTag = openTag.replace(/>$/, ' xml:space="preserve">');
      }
    }
    return openTag + text + match[2];
  });
}

@Injectable()
export class TextExtractionService {
  async openWorkbook(buffer: Buffer): Promise<JSZip> {
    if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
      throw new BadRequestException('The upload is not a valid XLSX ZIP archive.');
    }
    this.enforceZipLimits(buffer);
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(buffer, { checkCRC32: false }); }
    catch { throw new BadRequestException('The XLSX archive is malformed or corrupt.'); }
    if (!zip.file('xl/workbook.xml')) throw new BadRequestException('The archive is missing xl/workbook.xml.');
    return zip;
  }

  private enforceZipLimits(buffer: Buffer): void {
    let offset = -1;
    const min = Math.max(0, buffer.length - 65557);
    for (let i = buffer.length - 22; i >= min; i--) if (buffer.readUInt32LE(i) === 0x06054b50) { offset = i; break; }
    if (offset < 0) throw new BadRequestException('The XLSX ZIP directory is missing.');
    const count = buffer.readUInt16LE(offset + 10);
    const directoryOffset = buffer.readUInt32LE(offset + 16);
    if (count > MAX_ZIP_ENTRIES || directoryOffset >= buffer.length) throw new BadRequestException('The XLSX archive exceeds ZIP safety limits.');
    let total = 0;
    let cursor = directoryOffset;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new BadRequestException('The XLSX ZIP directory is malformed.');
      const compressed = buffer.readUInt32LE(cursor + 20);
      const uncompressed = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
      if (name.split('/').includes('..') || name.startsWith('/') || name.includes('\\')) throw new BadRequestException('The XLSX archive contains an unsafe path.');
      total += uncompressed;
      if (total > MAX_UNCOMPRESSED_BYTES || (uncompressed > 1024 * 1024 && uncompressed / Math.max(compressed, 1) > 200)) {
        throw new BadRequestException('The XLSX archive exceeds the allowed expansion limit.');
      }
      cursor += 46 + nameLength + extraLength + commentLength;
    }
  }

  async extractTextFromXlsx(fileBuffer: Buffer): Promise<ExtractedText[]> {
    const zip = await this.openWorkbook(fileBuffer);
    const result: ExtractedText[] = [];
    const sharedFile = zip.file('xl/sharedStrings.xml');
    if (sharedFile) {
      const xml = await sharedFile.async('string');
      const items = [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)];
      items.forEach((match, index) => {
        const value = visibleText(match[1]);
        if (value.trim()) result.push({ id: `shared:${index}`, value, source: 'shared', part: 'xl/sharedStrings.xml', index });
      });
    }
    const sheets = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name));
    for (const part of sheets) {
      const xml = await zip.file(part)!.async('string');
      let index = 0;
      for (const cell of xml.matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)) {
        const inline = /<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/.exec(cell[1]);
        if (!inline) continue;
        const value = visibleText(inline[1]);
        if (value.trim()) result.push({ id: `inline:${part}:${index}`, value, source: 'inline', part, index });
        index++;
      }
    }
    return result;
  }
}
