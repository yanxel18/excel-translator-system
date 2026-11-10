import { BadRequestException } from '@nestjs/common';
import { posix } from 'node:path';
import JSZip = require('jszip');
import { xmlText } from './xml-text';

export interface WorksheetPart {
  name: string;
  part: string;
}

export async function getWorksheetParts(zip: JSZip): Promise<WorksheetPart[]> {
  const workbookFile = zip.file('xl/workbook.xml');
  const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile) throw new BadRequestException('The archive is missing xl/workbook.xml.');
  if (!relationshipsFile) throw new BadRequestException('The workbook is missing worksheet relationships.');

  const [workbook, relationships] = await Promise.all([
    workbookFile.async('string'),
    relationshipsFile.async('string'),
  ]);
  const targets = new Map<string, string>();
  const relationshipIds = new Set<string>();

  for (const [, attributes] of relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const id = attribute(attributes, 'Id');
    const target = attribute(attributes, 'Target');
    const type = attribute(attributes, 'Type');
    const targetMode = attribute(attributes, 'TargetMode');
    if (!id || relationshipIds.has(id)) throw new BadRequestException('The workbook contains a missing or duplicate relationship ID.');
    relationshipIds.add(id);
    if (target && type?.endsWith('/worksheet') && targetMode !== 'External') {
      targets.set(id, resolvePartTarget('xl/workbook.xml', target));
    }
  }

  const parts: WorksheetPart[] = [];
  const names = new Set<string>();
  for (const [, attributes] of workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const name = attribute(attributes, 'name');
    const relationshipId = attribute(attributes, 'r:id');
    const part = relationshipId ? targets.get(relationshipId) : undefined;
    if (!name || !relationshipId || !part || !zip.file(part)) {
      throw new BadRequestException('The workbook contains a worksheet with a missing relationship or worksheet part.');
    }
    if (names.has(name)) throw new BadRequestException('The workbook contains duplicate worksheet names.');
    names.add(name);
    parts.push({ name, part });
  }

  return parts;
}

export function selectWorksheets(worksheets: WorksheetPart[], selectedSheets?: string[]): WorksheetPart[] {
  if (!selectedSheets?.length) return worksheets;
  const requested = new Set(selectedSheets);
  const availableNames = new Set(worksheets.map(({ name }) => name));
  const unknown = [...requested].filter((name) => !availableNames.has(name));
  if (unknown.length) throw new BadRequestException(`The selected worksheet does not exist: ${unknown.join(', ')}.`);
  return worksheets.filter(({ name }) => requested.has(name));
}

export function resolvePartTarget(sourcePart: string, target: string): string {
  let decodedTarget: string;
  try {
    decodedTarget = decodeURIComponent(target);
  } catch {
    throw new BadRequestException('The workbook contains an invalid relationship target.');
  }
  if (!decodedTarget || decodedTarget.includes('\\') || decodedTarget.includes('\0') || /[?#]/.test(decodedTarget)) {
    throw new BadRequestException('The workbook contains an unsafe relationship target.');
  }

  const targetPath = decodedTarget.startsWith('/') ? decodedTarget.slice(1) : posix.join(posix.dirname(sourcePart), decodedTarget);
  const normalized = posix.normalize(targetPath);
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
    throw new BadRequestException('The workbook contains an unsafe relationship target.');
  }
  return normalized;
}

function attribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(':', '\\:');
  const value = new RegExp(`(?:^|\\s)${escapedName}=(['"])(.*?)\\1`).exec(attributes)?.[2];
  return value === undefined ? undefined : xmlText(value);
}
