import { BadRequestException } from '@nestjs/common';
import type { ExtractedText } from '../modules/text-extraction/text-extraction.service';
import type { Translation } from '../modules/translation/translation.service';
import { strictObject } from './management-validation';

const MAX_ITEMS = 10000;
const MAX_ITEM_BYTES = 64 * 1024;
const MAX_TRANSLATED_BYTES = 4 * 32767;
const MAX_TOTAL_BYTES = 1024 * 1024;

function rows(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS || Buffer.byteLength(JSON.stringify(value)) > MAX_TOTAL_BYTES) {
    throw new BadRequestException('Invalid or oversized workbook data.');
  }
  return value;
}

function text(value: unknown, maxBytes: number, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.length > 0) && Buffer.byteLength(value) <= maxBytes;
}

export function extractedBatch(value: unknown): ExtractedText[] {
  const ids = new Set<string>();
  return rows(value).map((row) => {
    const item = strictObject(row, ['id', 'value', 'source', 'part', 'index']);
    if (!text(item.id, 1024) || !text(item.value, MAX_ITEM_BYTES, true) || ids.has(item.id)
      || (item.source !== undefined && !['shared', 'inline', 'drawing'].includes(item.source as string))
      || (item.part !== undefined && !text(item.part, 1024))
      || (item.index !== undefined && (!Number.isSafeInteger(item.index) || (item.index as number) < 0))) {
      throw new BadRequestException('Invalid extracted text.');
    }
    ids.add(item.id);
    return item as unknown as ExtractedText;
  });
}

export function translationRows(value: unknown): Translation[] {
  const ids = new Set<string>();
  return rows(value).map((row) => {
    const item = strictObject(row, ['id', 'translated']);
    if (!text(item.id, 1024) || !text(item.translated, MAX_TRANSLATED_BYTES, true) || ids.has(item.id)) throw new BadRequestException('Invalid translation.');
    ids.add(item.id);
    return item as unknown as Translation;
  });
}

export function workbookBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    if (value.length > 50 * 1024 * 1024) throw new BadRequestException('Workbook is too large.');
    return value;
  }
  const input = strictObject(value, ['type', 'data']);
  if (input.type !== 'Buffer' || !Array.isArray(input.data) || input.data.length > 50 * 1024 * 1024
    || input.data.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new BadRequestException('Invalid workbook buffer.');
  return Buffer.from(input.data);
}
