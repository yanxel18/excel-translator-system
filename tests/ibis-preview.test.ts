import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

test('preview bridge rejects foreign origins and transfers workbook bytes without credentials', async ({ page }) => {
  const bridge = readFileSync('deployment/ibis-preview/bridge.html');
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/bridge.html')) { res.setHeader('Content-Type', 'text/html'); res.end(bridge); }
    else if (req.url === '/main.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(`window.result = await (await fetch(new URLSearchParams(location.search).get('open'))).text();`); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<iframe src="/bridge.html"></iframe>'); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: {} }));
    await page.goto(`http://127.0.0.1:${address.port}`);
    const child = page.frames()[1];
    await child.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://foreign.example', source: parent, data: { source: 'excel-translator', type: 'workbook', name: 'book.xlsx', bytes: new ArrayBuffer(3) } })));
    expect(await child.evaluate(() => location.search)).toBe('');
    await page.evaluate(() => { const bytes = new TextEncoder().encode('private workbook bytes').buffer; document.querySelector('iframe')!.contentWindow!.postMessage({ source: 'excel-translator', type: 'workbook', name: 'book.xlsx', bytes }, location.origin, [bytes]); });
    await expect.poll(() => child.evaluate(() => (window as any).result)).toBe('private workbook bytes');
    expect(await child.evaluate(() => location.search)).not.toContain('Bearer');
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
