const JSZip = require("jszip");

async function main() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
  );
  zip.file(
    "xl/sharedStrings.xml",
    '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>こんにちは</t></si></sst>',
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>おはよう</t></is></c></row></sheetData></worksheet>',
  );
  const workbook = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  const base = "http://localhost:3000";
  const loginResponse = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "user", password: "password" }),
  });
  if (!loginResponse.ok)
    throw new Error(
      `Login failed: ${loginResponse.status} ${await loginResponse.text()}`,
    );
  const { access_token: token } = await loginResponse.json();
  const form = new FormData();
  form.append("file", new Blob([workbook]), "smoke.xlsx");
  const upload = await fetch(`${base}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!upload.ok)
    throw new Error(`Upload failed: ${upload.status} ${await upload.text()}`);
  const job = await upload.json();
  const start = await fetch(`${base}/jobs/${job.id}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!start.ok)
    throw new Error(`Start failed: ${start.status} ${await start.text()}`);
  let current;
  const deadline = Date.now() + 300000;
  do {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(`${base}/jobs/${job.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    current = await response.json();
    console.log(`job=${current.status} progress=${current.progress}%`);
    if (current.status === "FAILED")
      throw new Error(current.error || "Translation failed.");
  } while (current.status === "PROCESSING" && Date.now() < deadline);
  if (current.status !== "COMPLETED") throw new Error("Translation timed out.");
  const download = await fetch(`${base}/jobs/${job.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!download.ok) throw new Error(`Download failed: ${download.status}`);
  const translatedZip = await JSZip.loadAsync(
    Buffer.from(await download.arrayBuffer()),
  );
  const strings = await translatedZip
    .file("xl/sharedStrings.xml")
    .async("string");
  const sheet = await translatedZip
    .file("xl/worksheets/sheet1.xml")
    .async("string");
  console.log(
    `download=${download.status} bytes=${download.headers.get("content-length")}`,
  );
  console.log(`sharedStrings=${strings}`);
  console.log(`sheet=${sheet}`);
  if (/こんにちは|おはよう/.test(strings + sheet))
    throw new Error("Source Japanese text remains in output.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
