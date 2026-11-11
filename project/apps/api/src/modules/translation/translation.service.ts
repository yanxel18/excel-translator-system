import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Language } from '../../generated/prisma/client';
import { ExtractedText, TextExtractionService } from '../text-extraction/text-extraction.service';
import { patchWorkbook } from '../workbook-ooxml/patcher';
import { validateWorkbookOutput } from '../workbook-ooxml/validator';

export interface Translation { id: string; translated: string; }
export interface ProtectedTerm { source: string; target: string; }
const LANGUAGE_NAMES: Record<Language, string> = { ENGLISH: 'English', JAPANESE: 'Japanese', CHINESE: 'Chinese' };

function createVocabularyProtector(terms: ProtectedTerm[]): (value: string) => { text: string; markers: Map<string, string> } {
  const normalized = terms.filter(({ source, target }) => source && target).slice()
    .sort((left, right) => right.source.length - left.source.length);
  if (!normalized.length) return (value) => ({ text: value, markers: new Map() });
  const bySource = new Map(normalized.map(({ source, target }) => [source, target]));
  const pattern = new RegExp(normalized.map(({ source }) => source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');
  return (value) => {
    let nonce = randomUUID().replace(/-/g, '');
    while (value.includes(nonce) || normalized.some(({ target }) => target.includes(nonce))) nonce = randomUUID().replace(/-/g, '');
    const markers = new Map<string, string>();
    let index = 0;
    pattern.lastIndex = 0;
    const text = value.replace(pattern, (source) => {
      const marker = `XLT_PROTECTED_${nonce}_${index++}_ENDXLT`;
      markers.set(marker, bySource.get(source)!);
      return marker;
    });
    return { text, markers };
  };
}

function restoreVocabulary(value: string, markers: Map<string, string>): string {
  let result = value;
  for (const [marker, target] of markers) {
    if (result.split(marker).length - 1 !== 1) throw new ServiceUnavailableException('Ollama did not preserve protected vocabulary markers.');
    result = result.replace(marker, target);
  }
  return result;
}

@Injectable()
export class TranslationService {
  constructor(private readonly extraction: TextExtractionService) {}

  async sendTextForTranslation(textBatch: ExtractedText[], onProgress?: (completed: number, total: number) => void, signal?: AbortSignal, languages: { sourceLanguage: Language; targetLanguage: Language } = { sourceLanguage: Language.JAPANESE, targetLanguage: Language.ENGLISH }, vocabulary: ProtectedTerm[] = []): Promise<Translation[]> {
    if (!Array.isArray(textBatch)) throw new Error('textBatch must be an array.');
    const maxBatchItems = 32;
    const maxBatchBytes = 64 * 1024;
    const batches: ExtractedText[][] = [];
    let current: ExtractedText[] = [];
    let currentBytes = 0;
    for (const item of textBatch) {
      const itemBytes = Buffer.byteLength(JSON.stringify({ id: item.id, text: item.value }));
      if (itemBytes > maxBatchBytes) throw new BadRequestException(`Text item ${item.id} is too large to translate in a bounded request.`);
      if (current.length && (current.length >= maxBatchItems || currentBytes + itemBytes > maxBatchBytes)) {
        batches.push(current); current = []; currentBytes = 0;
      }
      current.push(item); currentBytes += itemBytes;
    }
    if (current.length) batches.push(current);
    const translations: Translation[] = [];
    const protect = createVocabularyProtector(vocabulary);
    for (const [batchIndex, batch] of batches.entries()) {
      const protectedItems = batch.map(({ id, value }) => ({ id, ...protect(value) }));
      const model = process.env.OLLAMA_MODEL || 'gemma4:latest';
      const endpoint = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '') + '/api/chat';
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, stream: false, format: 'json',
            messages: [
              { role: 'system', content: `Translate each ${LANGUAGE_NAMES[languages.sourceLanguage]} string to ${LANGUAGE_NAMES[languages.targetLanguage]}. Return only JSON as {"translations":[{"id":"...","translated":"..."}]}. Preserve IDs exactly. Keep text that is not in the source language unchanged. Preserve each XLT_PROTECTED token exactly once; the application will replace those tokens with protected vocabulary.` },
              { role: 'user', content: JSON.stringify({ translations: protectedItems.map(({ id, text }) => ({ id, text })) }) },
            ], options: { temperature: 0 } }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof Error && error.name === 'TimeoutError') throw new ServiceUnavailableException('Ollama timed out while translating. Check the model and available system resources.');
        throw new ServiceUnavailableException(`Cannot reach Ollama at ${endpoint}. Start Ollama and pull ${model}.`);
      }
      if (!response.ok) {
        let detail = '';
        try { const body = await response.json(); if (typeof body?.error === 'string') detail = body.error; } catch { /* error response may not be JSON */ }
        if (/cuda|gpu|vulkan|rocm/i.test(detail)) throw new ServiceUnavailableException(`Ollama could not initialize ${model} on the GPU. Check Ollama logs and GPU configuration, or select another installed model.`);
        if (response.status === 404) throw new ServiceUnavailableException(`Ollama could not find ${model}. Pull the model or select an installed model.`);
        throw new ServiceUnavailableException(`Ollama returned HTTP ${response.status} while running ${model}. Check Ollama logs for details.`);
      }
      let body: any;
      try { body = await response.json(); } catch { throw new ServiceUnavailableException('Ollama returned invalid JSON.'); }
      let parsed: any;
      try { parsed = JSON.parse(body?.message?.content ?? ''); } catch { throw new ServiceUnavailableException('Ollama returned a response that could not be parsed as JSON.'); }
      const rows = Array.isArray(parsed) ? parsed : parsed?.translations;
      if (!Array.isArray(rows)) throw new ServiceUnavailableException('Ollama response is missing translations.');
      const expected = new Set(batch.map((entry) => entry.id));
      const returned = new Map<string, string>();
      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || typeof row.translated !== 'string' || !expected.has(row.id) || returned.has(row.id)) {
          throw new ServiceUnavailableException('Ollama returned missing, duplicate, or unknown translation IDs.');
        }
        returned.set(row.id, row.translated);
      }
      if (returned.size !== expected.size) throw new ServiceUnavailableException('Ollama omitted one or more translation IDs.');
      translations.push(...protectedItems.map(({ id, markers }) => ({ id, translated: restoreVocabulary(returned.get(id)!, markers) })));
      onProgress?.(batchIndex + 1, batches.length);
    }
    return translations;
  }

  async validateTranslation(result: any): Promise<boolean> {
    return Array.isArray(result) && result.every((row) => typeof row?.id === 'string' && typeof row?.translated === 'string')
      && new Set(result.map((row) => row.id)).size === result.length;
  }

  async patchOOXML(originalFileBuffer: Buffer, translations: Translation[], selectedSheets?: string[]): Promise<Buffer> {
    if (!(await this.validateTranslation(translations))) throw new Error('Translation result is invalid.');
    const zip = await this.extraction.openWorkbook(originalFileBuffer);
    const worksheets = await this.extraction.getWorksheetParts(zip);
    const output = await patchWorkbook(zip, worksheets, translations, selectedSheets);
    await validateWorkbookOutput(originalFileBuffer, output, selectedSheets);
    return output;
  }
}
