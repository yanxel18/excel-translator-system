import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { escapeXml, ExtractedText, TextExtractionService } from '../text-extraction/text-extraction.service';

export interface Translation { id: string; translated: string; }

@Injectable()
export class TranslationService {
  constructor(private readonly extraction: TextExtractionService) {}

  async sendTextForTranslation(textBatch: ExtractedText[], onProgress?: (completed: number, total: number) => void, signal?: AbortSignal): Promise<Translation[]> {
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
    for (const [batchIndex, batch] of batches.entries()) {
      const model = process.env.OLLAMA_MODEL || 'gemma4:latest';
      const endpoint = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '') + '/api/chat';
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, stream: false, format: 'json',
            messages: [
              { role: 'system', content: 'Translate each Japanese string to English. Return only JSON as {"translations":[{"id":"...","translated":"..."}]}. Preserve IDs exactly. Keep non-Japanese text unchanged.' },
              { role: 'user', content: JSON.stringify({ translations: batch.map(({ id, value }) => ({ id, text: value })) }) },
            ], options: { temperature: 0 } }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
        });
      } catch {
        throw new ServiceUnavailableException(`Cannot reach Ollama at ${endpoint}. Start Ollama and pull ${model}.`);
      }
      if (!response.ok) throw new ServiceUnavailableException(`Ollama returned HTTP ${response.status}. Check the configured model.`);
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
      translations.push(...batch.map(({ id }) => ({ id, translated: returned.get(id)! })));
      onProgress?.(batchIndex + 1, batches.length);
    }
    return translations;
  }

  async validateTranslation(result: any): Promise<boolean> {
    return Array.isArray(result) && result.every((row) => typeof row?.id === 'string' && typeof row?.translated === 'string')
      && new Set(result.map((row) => row.id)).size === result.length;
  }

  async patchOOXML(originalFileBuffer: Buffer, translations: Translation[]): Promise<Buffer> {
    if (!(await this.validateTranslation(translations))) throw new Error('Translation result is invalid.');
    const values = new Map(translations.map(({ id, translated }) => [id, translated]));
    const zip = await this.extraction.openWorkbook(originalFileBuffer);
    const shared = zip.file('xl/sharedStrings.xml');
    if (shared) {
      let xml = await shared.async('string');
      let index = 0;
      xml = xml.replace(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g, (item) => {
        const id = `shared:${index++}`;
        if (!values.has(id)) return item;
        let replaced = false;
        return item.replace(/(<t(?:\s[^>]*)?>)[\s\S]*?(<\/t>)/, (_all, open, close) => { replaced = true; return open + escapeXml(values.get(id)!) + close; });
      });
      if ([...values.keys()].some((id) => id.startsWith('shared:') && !xml)) throw new Error('Shared strings could not be patched.');
      zip.file('xl/sharedStrings.xml', xml);
    }
    const sheets = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name));
    for (const part of sheets) {
      let xml = await zip.file(part)!.async('string');
      let inlineIndex = 0;
      xml = xml.replace(/<c\b[^>]*>[\s\S]*?<\/c>/g, (cell) => {
        if (!/<is(?:\s[^>]*)?>/.test(cell)) return cell;
        const id = `inline:${part}:${inlineIndex++}`;
        if (!values.has(id)) return cell;
        return cell.replace(/(<is(?:\s[^>]*)?>\s*<t(?:\s[^>]*)?>)[\s\S]*?(<\/t>\s*<\/is>)/, (_all, open, close) => open + escapeXml(values.get(id)!) + close);
      });
      zip.file(part, xml);
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
}
