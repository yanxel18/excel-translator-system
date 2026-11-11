import { drawingReferences } from './drawing-text';
import { XMLValidator } from 'fast-xml-parser';
import JSZip = require('jszip');
import { openWorkbookArchive } from './archive';
import { hasAttribute, sharedStringIndex } from './worksheet-cells';
import { getWorksheetParts, resolvePartTarget, selectWorksheets, WorksheetPart } from './worksheet-parts';
import { xmlText } from './xml-text';

const REQUIRED_PACKAGE_PARTS = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels'];

export async function validateWorkbookOutput(originalBuffer: Buffer, outputBuffer: Buffer, selectedSheets?: string[]): Promise<void> {
  try {
    const [originalZip, outputZip] = await Promise.all([
      openWorkbookArchive(originalBuffer),
      openWorkbookArchive(outputBuffer, true),
    ]);
    await validatePackage(outputZip);

    const originalWorksheets = await getWorksheetParts(originalZip);
    const outputWorksheets = await getWorksheetParts(outputZip);
    assert(JSON.stringify(originalWorksheets) === JSON.stringify(outputWorksheets), 'worksheet parts changed');
    const selectedParts = new Set(selectWorksheets(outputWorksheets, selectedSheets).map(({ part }) => part));
    const originalNames = fileNames(originalZip);
    const outputNames = fileNames(outputZip);
    const originalDrawings = await drawingReferences(originalZip, originalWorksheets);
    const outputDrawings = await drawingReferences(outputZip, outputWorksheets);
    assert(outputDrawings.length === originalDrawings.length, 'drawing references changed');
    const allowedChanges = new Set<string>();
    const addedParts = new Set<string>();
    for (const original of originalDrawings) {
      const output = outputDrawings.find((reference) => reference.sheet === original.sheet && reference.id === original.id);
      assert(output, 'drawing reference removed');
      if (!selectedParts.has(original.sheet)) {
        assert(output.part === original.part, 'unselected drawing reference changed');
        continue;
      }
      allowedChanges.add(output.part);
      allowedChanges.add(original.relationships);
      const before = await originalZip.file(original.part)!.async('string');
      const after = await outputZip.file(output.part)!.async('string');
      const stripText = (xml: string) => xml.replace(/(<(?:[\w.-]+:)?t(?:\s[^>]*)?>)[\s\S]*?(<\/(?:[\w.-]+:)?t\s*>)/g, '$1$2').replace(/ xml:space="preserve"/g, '');
      assert(stripText(before) === stripText(after), 'drawing geometry or formatting changed');
      if (output.part !== original.part) {
        assert(!originalZip.file(output.part), 'drawing clone overwrote a package part');
        addedParts.add(output.part);
        const sourceRelationships = original.part.replace(/([^/]+)$/, '_rels/$1.rels');
        const clonedRelationships = output.part.replace(/([^/]+)$/, '_rels/$1.rels');
        if (originalZip.file(sourceRelationships)) {
          assert(Boolean(outputZip.file(clonedRelationships)), 'drawing clone relationships missing');
          assert((await originalZip.file(sourceRelationships)!.async('string')) === (await outputZip.file(clonedRelationships)!.async('string')), 'drawing clone relationships changed');
          addedParts.add(clonedRelationships);
        }
        allowedChanges.add('[Content_Types].xml');
      }
    }
    assert(originalNames.every((part) => outputNames.includes(part)) && outputNames.every((part) => originalNames.includes(part) || addedParts.has(part)), 'package parts changed');

    for (const part of originalNames) {
      if (part === 'xl/sharedStrings.xml' || selectedParts.has(part) || allowedChanges.has(part)) continue;
      const [originalContent, outputContent] = await Promise.all([
        originalZip.file(part)!.async('nodebuffer'),
        outputZip.file(part)!.async('nodebuffer'),
      ]);
      assert(originalContent.equals(outputContent), `unexpected changes in ${part}`);
    }

    for (const { part } of outputWorksheets) {
      const [originalXml, outputXml] = await Promise.all([
        originalZip.file(part)!.async('string'),
        outputZip.file(part)!.async('string'),
      ]);
      assert(formulaSignature(originalXml) === formulaSignature(outputXml), `formulas changed in ${part}`);
      assert(styleSignature(originalXml) === styleSignature(outputXml), `cell number formats changed in ${part}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown validation error';
    throw new Error(`Generated workbook failed OOXML validation: ${detail}`);
  }
}

async function validatePackage(zip: JSZip): Promise<void> {
  for (const part of REQUIRED_PACKAGE_PARTS) assert(Boolean(zip.file(part)), `missing package part ${part}`);

  for (const [part, entry] of Object.entries(zip.files)) {
    if (entry.dir || !isXmlPart(part)) continue;
    const xml = await entry.async('string');
    assert(!/<!DOCTYPE\b/i.test(xml), `DTD declarations are not allowed in ${part}`);
    const result = XMLValidator.validate(xml, { allowBooleanAttributes: false });
    assert(result === true, `${part} is not well-formed XML${result === true ? '' : `: ${result.err.msg}`}`);
  }

  const contentTypes = await zip.file('[Content_Types].xml')!.async('string');
  const packageRelationships = await zip.file('_rels/.rels')!.async('string');
  const officeDocument = relationshipEntries(packageRelationships).find(({ type, targetMode }) => type.endsWith('/officeDocument') && targetMode !== 'External');
  assert(Boolean(officeDocument), 'package relationships do not contain an internal officeDocument target');
  assert(resolvePartTarget('', officeDocument!.target) === 'xl/workbook.xml', 'officeDocument relationship does not target xl/workbook.xml');

  const worksheets = await getWorksheetParts(zip);
  assert(worksheets.length > 0, 'workbook has no worksheets');
  const packageParts = fileNames(zip).filter((part) => part !== '[Content_Types].xml');
  for (const part of packageParts) assert(hasContentType(contentTypes, part), `missing content type for ${part}`);

  await validateWorkbookRelationships(zip);

  await validateWorksheetReferences(zip, worksheets);
}

async function validateWorkbookRelationships(zip: JSZip): Promise<void> {
  const relationships = relationshipEntries(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'));
  for (const [relationshipType, part] of [
    ['sharedStrings', 'xl/sharedStrings.xml'],
    ['styles', 'xl/styles.xml'],
  ]) {
    const relationship = relationships.find(({ type }) => type.endsWith(`/${relationshipType}`));
    if (zip.file(part)) {
      assert(Boolean(relationship && relationship.targetMode !== 'External'), `workbook is missing its ${relationshipType} relationship`);
      assert(resolvePartTarget('xl/workbook.xml', relationship!.target) === part, `workbook ${relationshipType} relationship targets the wrong part`);
    } else {
      assert(!relationship || relationship.targetMode === 'External', `workbook relationship points to missing ${relationshipType}`);
    }
  }
}

async function validateWorksheetReferences(zip: JSZip, worksheets: WorksheetPart[]): Promise<void> {
  const stylesFile = zip.file('xl/styles.xml');
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  const stylesXml = stylesFile ? await stylesFile.async('string') : '';
  const sharedStringsXml = sharedStringsFile ? await sharedStringsFile.async('string') : '';
  const sharedStringCount = [...sharedStringsXml.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)].length;
  const styleCount = cellFormatCount(stylesXml);
  const customNumberFormats = new Set([...stylesXml.matchAll(/<numFmt\b([^>]*)\/?\s*>/g)]
    .map(([, attributes]) => Number(attribute(attributes, 'numFmtId'))));

  for (const { part } of worksheets) {
    const xml = await zip.file(part)!.async('string');
    for (const [, attributes, cellContent = ''] of xml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const styleIndex = attribute(attributes, 's');
      if (styleIndex !== undefined) {
        const index = Number(styleIndex);
        assert(Number.isInteger(index) && index >= 0 && index < styleCount, `${part} refers to a missing cell style`);
      }

      if (hasAttribute(attributes, 't', 's')) {
        const index = sharedStringIndex(cellContent);
        assert(sharedStringsFile && index !== undefined && index < sharedStringCount, `${part} refers to a missing shared string`);
      }
    }
  }

  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  for (const [, attributes] of cellXfs.matchAll(/<xf\b([^>]*)\/?\s*>/g)) {
    const numberFormatId = Number(attribute(attributes, 'numFmtId') ?? '0');
    assert(Number.isInteger(numberFormatId) && numberFormatId >= 0, 'cell style has an invalid number format ID');
    assert(numberFormatId <= 163 || customNumberFormats.has(numberFormatId), `cell style refers to missing number format ${numberFormatId}`);
  }
}

function cellFormatCount(stylesXml: string): number {
  const body = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1];
  return body ? [...body.matchAll(/<xf\b[^>]*\/?\s*>/g)].length : 0;
}

function formulaSignature(xml: string): string {
  return JSON.stringify([...xml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)]
    .flatMap(([, attributes, cell = '']) => {
      const formulas = [...cell.matchAll(/<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>)/g)].map(([formula]) => formula);
      return formulas.length ? [[attribute(attributes, 'r'), attribute(attributes, 's'), attribute(attributes, 't'), formulas]] : [];
    }));
}

function styleSignature(xml: string): string {
  return JSON.stringify([...xml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)]
    .map(([, attributes]) => [attribute(attributes, 'r'), attribute(attributes, 's') ?? '0']));
}

function relationshipEntries(xml: string): Array<{ type: string; target: string; targetMode?: string }> {
  return [...xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].flatMap(([, attributes]) => {
    const type = attribute(attributes, 'Type');
    const target = attribute(attributes, 'Target');
    return type && target ? [{ type, target, targetMode: attribute(attributes, 'TargetMode') }] : [];
  });
}

function hasContentType(xml: string, part: string): boolean {
  const override = [...xml.matchAll(/<Override\b([^>]*)\/?\s*>/g)]
    .some(([, attributes]) => attribute(attributes, 'PartName') === `/${part}` && Boolean(attribute(attributes, 'ContentType')));
  if (override) return true;
  const extension = part.split('.').pop()?.toLowerCase();
  return [...xml.matchAll(/<Default\b([^>]*)\/?\s*>/g)]
    .some(([, attributes]) => attribute(attributes, 'Extension')?.toLowerCase() === extension && Boolean(attribute(attributes, 'ContentType')));
}

function attribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(':', '\\:');
  const value = new RegExp(`(?:^|\\s)${escapedName}=(['"])(.*?)\\1`).exec(attributes)?.[2];
  return value === undefined ? undefined : xmlText(value);
}

function fileNames(zip: JSZip): string[] {
  return Object.entries(zip.files).filter(([, entry]) => !entry.dir).map(([name]) => name).sort();
}

function isXmlPart(part: string): boolean {
  return part === '[Content_Types].xml' || part.endsWith('.xml') || part.endsWith('.rels') || part.endsWith('.vml');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
