import { BadRequestException } from '@nestjs/common';
import { posix } from 'node:path';
import JSZip = require('jszip');
import { resolvePartTarget, WorksheetPart } from './worksheet-parts';
import { escapeXml, xmlText } from './xml-text';

export const DRAWING_PARAGRAPH = /<(?:[A-Za-z_][\w.-]*:)?p\b(?![^>]*\/\s*>)[^>]*>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?p\s*>/g;
const attribute = (xml: string, name: string) => xmlText(new RegExp(`(?:^|\\s)${name}=(['"])(.*?)\\1`).exec(xml)?.[2] ?? '');
export interface DrawingReference { sheet: string; relationships: string; id: string; part: string }
export async function drawingReferences(zip: JSZip, worksheets: WorksheetPart[]): Promise<DrawingReference[]> {
  const result: DrawingReference[] = [];
  for (const { part: sheet } of worksheets) {
    const xml = await zip.file(sheet)!.async('string');
    const ids = new Set([...xml.matchAll(/<(?:[\w.-]+:)?drawing\b([^>]*)\/?\s*>/g)].map((m) => attribute(m[1], 'r:id')));
    if (!ids.size) continue;
    const relationships = posix.join(posix.dirname(sheet), '_rels', posix.basename(sheet) + '.rels');
    const file = zip.file(relationships);
    if (!file) throw new BadRequestException('Worksheet drawing relationships are missing.');
    for (const match of (await file.async('string')).matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
      const id = attribute(match[1], 'Id');
      if (!ids.has(id) || attribute(match[1], 'TargetMode') === 'External' || !attribute(match[1], 'Type').endsWith('/drawing')) continue;
      const part = resolvePartTarget(sheet, attribute(match[1], 'Target'));
      if (!zip.file(part)) throw new BadRequestException('Worksheet drawing part is missing.');
      result.push({ sheet, relationships, id, part });
    }
  }
  return result;
}

export async function isolateDrawing(zip: JSZip, part: string, references: DrawingReference[]): Promise<string> {
  let index = 1;
  let target: string;
  do { target = part.replace(/\.xml$/, `-translated-${index++}.xml`); } while (zip.file(target));
  zip.file(target, await zip.file(part)!.async('nodebuffer'));
  const rels = posix.join(posix.dirname(part), '_rels', posix.basename(part) + '.rels');
  if (zip.file(rels)) zip.file(posix.join(posix.dirname(target), '_rels', posix.basename(target) + '.rels'), await zip.file(rels)!.async('nodebuffer'));
  for (const reference of references) {
    let xml = await zip.file(reference.relationships)!.async('string');
    xml = xml.replace(/<Relationship\b([^>]*)\/?\s*>/g, (element, attributes) => attribute(attributes, 'Id') === reference.id
      ? element.replace(/\bTarget=(['"])(.*?)\1/, `Target="${escapeXml(posix.relative(posix.dirname(reference.sheet), target))}"`) : element);
    zip.file(reference.relationships, xml);
  }
  const types = zip.file('[Content_Types].xml');
  if (!types) throw new BadRequestException('Workbook content types are missing.');
  let xml = await types.async('string');
  const override = [...xml.matchAll(/<Override\b[^>]*\/?\s*>/g)].find((m) => attribute(m[0].replace(/^<Override/, ''), 'PartName') === '/' + part)?.[0];
  if (!override) throw new BadRequestException('Drawing content type is missing.');
  xml = xml.replace('</Types>', override.replace(/\bPartName=(['"])(.*?)\1/, `PartName="/${escapeXml(target)}"`) + '</Types>');
  zip.file('[Content_Types].xml', xml);
  return target;
}
