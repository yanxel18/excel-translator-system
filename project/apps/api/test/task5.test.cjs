const assert = require('node:assert/strict');
const test = require('node:test');
const JSZip = require('jszip');
const { TextExtractionService } = require('../dist/modules/text-extraction/text-extraction.service');
const { TranslationService } = require('../dist/modules/translation/translation.service');

const contentTypes = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const workbook = `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Selected" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets>
</workbook>`;

const workbookRelationships = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const sharedStrings = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="2">
  <si><r><rPr><b/></rPr><t>Rich</t></r><r><rPr><i/></rPr><t xml:space="preserve"> text</t></r></si>
  <si><t>Formula cached result</t></si>
</sst>`;

const styles = `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
  <fonts count="1"><font><sz val="11"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;

const selectedSheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">
  <c r="A1" s="0" t="s"><v>0</v></c>
  <c r="B1" s="0" t="s"><f>CONCAT("Rich"," text")</f><v>0</v></c>
  <c r="F1" t="s"><f>"Formula cached result"</f><v>1</v></c>
  <c r="C1" s="0" t="inlineStr"><is><r><rPr><b/></rPr><t>Inline</t></r><r><rPr><i/></rPr><t xml:space="preserve"> text</t></r></is></c>
  <c r="D1" s="0"><v>42</v></c>
  <c r="E1" s="0"><f>SUM(D1,1)</f><v>43</v></c>
</row></sheetData></worksheet>`;

const otherSheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`;

async function makeWorkbook({ includePackageRelationships = true } = {}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  if (includePackageRelationships) {
    zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  }
  zip.file('xl/workbook.xml', workbook);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelationships);
  zip.file('xl/sharedStrings.xml', sharedStrings);
  zip.file('xl/styles.xml', styles);
  zip.file('xl/worksheets/sheet1.xml', selectedSheet);
  zip.file('xl/worksheets/sheet2.xml', otherSheet);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function services() {
  const extraction = new TextExtractionService();
  return { extraction, translation: new TranslationService(extraction) };
}

async function readZip(buffer) {
  return JSZip.loadAsync(buffer);
}

test('extracts visible rich text but skips formula results and unselected worksheets', async () => {
  const { extraction } = services();
  const result = await extraction.extractTextFromXlsx(await makeWorkbook(), ['Selected']);

  assert.deepEqual(result.map(({ id, value }) => ({ id, value })), [
    { id: 'shared:0', value: 'Rich text' },
    { id: 'inline:xl/worksheets/sheet1.xml:0', value: 'Inline text' },
  ]);
});

test('patches selected text while preserving rich runs, formulas, number formats, and other sheets', async () => {
  const { translation } = services();
  const source = await makeWorkbook();
  const original = await readZip(source);
  const originalOtherSheet = await original.file('xl/worksheets/sheet2.xml').async('string');
  const originalStyles = await original.file('xl/styles.xml').async('string');
  const result = await translation.patchOOXML(source, [
    { id: 'shared:0', translated: 'Translated' },
    { id: 'inline:xl/worksheets/sheet1.xml:0', translated: 'Revised text' },
  ], ['Selected']);
  const output = await readZip(result);
  const outputShared = await output.file('xl/sharedStrings.xml').async('string');
  const outputSelectedSheet = await output.file('xl/worksheets/sheet1.xml').async('string');

  assert.match(outputShared, /<t>Rich<\/t>/);
  assert.match(outputShared, /<t>Translated<\/t>/);
  assert.match(outputSelectedSheet, /<c r="A1" s="0" t="s"><v>2<\/v><\/c>/);
  assert.match(outputSelectedSheet, /<f>CONCAT\("Rich"," text"\)<\/f><v>0<\/v>/);
  assert.match(outputSelectedSheet, /<f>"Formula cached result"<\/f><v>1<\/v>/);
  assert.match(outputSelectedSheet, /<f>SUM\(D1,1\)<\/f><v>43<\/v>/);
  assert.match(outputSelectedSheet, /<rPr><b\/><\/rPr><t>Revised text<\/t>/);
  assert.match(outputSelectedSheet, /<rPr><i\/><\/rPr><t xml:space="preserve"><\/t>/);
  assert.equal(await output.file('xl/worksheets/sheet2.xml').async('string'), originalOtherSheet);
  assert.equal(await output.file('xl/styles.xml').async('string'), originalStyles);
});

test('rejects selected worksheets that do not exist in the workbook', async () => {
  const { translation } = services();

  await assert.rejects(
    translation.patchOOXML(await makeWorkbook(), [], ['Missing']),
    /selected worksheet/i,
  );
});

test('does not return an archive when a translation makes worksheet XML invalid', async () => {
  const { translation } = services();

  await assert.rejects(
    translation.patchOOXML(await makeWorkbook(), [
      { id: 'inline:xl/worksheets/sheet1.xml:0', translated: 'Invalid\u0001XML' },
    ], ['Selected']),
    /OOXML|XML/i,
  );
});

test('rejects a generated workbook missing its package relationships', async () => {
  const { translation } = services();

  await assert.rejects(
    translation.patchOOXML(await makeWorkbook({ includePackageRelationships: false }), [], ['Selected']),
    /OOXML|relationship/i,
  );
});


test('preserves empty cells and places cloned shared strings before extension lists', async () => {
  const sourceZip = await readZip(await makeWorkbook());
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheet = await sourceZip.file(sheetPath).async('string');
  sourceZip.file(sheetPath, sheet.replace('<c r="A1"', '<c r="Z1" s="0"/><c r="A1"'));
  const shared = await sourceZip.file('xl/sharedStrings.xml').async('string');
  sourceZip.file('xl/sharedStrings.xml', shared.replace('</sst>', '<extLst></extLst></sst>'));
  const source = await sourceZip.generateAsync({ type: 'nodebuffer' });
  const { extraction, translation } = services();
  const extracted = await extraction.extractTextFromXlsx(source, ['Selected']);
  assert.ok(extracted.some((item) => item.id === 'shared:0'));
  const result = await translation.patchOOXML(source, [{ id: 'shared:0', translated: 'Translated' }], ['Selected']);
  const output = await readZip(result);
  const outputSheet = await output.file(sheetPath).async('string');
  const outputShared = await output.file('xl/sharedStrings.xml').async('string');
  assert.match(outputSheet, /<c r="Z1" s="0"\/><c r="A1" s="0" t="s"><v>2<\/v><\/c>/);
  assert.ok(outputShared.indexOf('Translated') < outputShared.indexOf('<extLst>'));
});


test('translates grouped shape paragraphs while isolating drawings shared with unselected sheets', async () => {
  const zip = await readZip(await makeWorkbook());
  const drawing = `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:grpSp><xdr:sp><xdr:spPr><a:xfrm rot="120"><a:off x="100" y="200"/></a:xfrm><a:prstGeom prst="rightArrow"/></xdr:spPr><xdr:txBody><a:bodyPr/><a:lstStyle/><a:p/><a:p><a:r><a:rPr b="1"/><a:t>Shape</a:t></a:r><a:r><a:rPr i="1"/><a:t> text</a:t></a:r></a:p><a:p><a:r><a:t>Second paragraph</a:t></a:r></a:p></xdr:txBody></xdr:sp></xdr:grpSp><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
  zip.file('xl/drawings/drawing1.xml', drawing);
  for (const index of [1, 2]) {
    const path = `xl/worksheets/sheet${index}.xml`;
    zip.file(path, (await zip.file(path).async('string')).replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ').replace('</worksheet>', '<drawing r:id="draw1"/></worksheet>'));
    zip.file(`xl/worksheets/_rels/sheet${index}.xml.rels`, '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="draw1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  }
  zip.file('[Content_Types].xml', contentTypes.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'));
  const source = await zip.generateAsync({ type: 'nodebuffer' });
  const { extraction, translation } = services();
  const texts = (await extraction.extractTextFromXlsx(source, ['Selected'])).filter((item) => item.source === 'drawing');
  assert.deepEqual(texts.map((item) => item.value), ['Shape text', 'Second paragraph']);
  const result = await translation.patchOOXML(source, texts.map((item, index) => ({ id: item.id, translated: `Translated ${index}` })), ['Selected']);
  const output = await readZip(result);
  assert.equal(await output.file('xl/drawings/drawing1.xml').async('string'), drawing);
  const revised = await output.file('xl/drawings/drawing1-translated-1.xml').async('string');
  assert.match(revised, /Translated 0/);
  assert.match(revised, /Translated 1/);
  assert.match(revised, /<a:rPr b="1"\/>/);
  assert.match(revised, /<a:xfrm rot="120"><a:off x="100" y="200"\/><\/a:xfrm>/);
  assert.match(await output.file('xl/worksheets/_rels/sheet1.xml.rels').async('string'), /drawing1-translated-1.xml/);
  assert.doesNotMatch(await output.file('xl/worksheets/_rels/sheet2.xml.rels').async('string'), /translated/);
});
