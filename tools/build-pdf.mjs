/* Print cv.html to assets/Grant-van-Zyl-CV.pdf.
 *
 * The CV exists once, as a web page. This prints it rather than maintaining a
 * second copy in a word processor, which is how the two versions of a CV end up
 * disagreeing about a date.
 *
 *   node tools/build-pdf.mjs
 *
 * Needs playwright and its browser:
 *
 *   npm i -D playwright && npx playwright install chromium
 *
 * Set CHROMIUM_PATH to use a Chromium you already have instead. It serves the
 * folder itself, because a `file://` page cannot load the webfonts the way a
 * served one does, and a PDF set in fallback fonts is not the document.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'assets', 'Grant-van-Zyl-CV.pdf');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

/* Deliberately a few lines rather than a dependency: it serves one folder to
   one browser on localhost for about two seconds. */
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = join(ROOT, normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/cv.html`;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage();
const problems = [];
page.on('pageerror', e => problems.push(String(e.message)));
page.on('requestfailed', r => problems.push('could not load ' + r.url()));

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

/* The whole point of serving it: prove the real faces are in before printing,
   rather than shipping a PDF quietly set in Times. */
const fonts = await page.evaluate(() => ({
  display: document.fonts.check('700 16px Archivo'),
  body: document.fonts.check('16px Newsreader'),
  mono: document.fonts.check('16px "IBM Plex Mono"'),
}));
for (const [role, ok] of Object.entries(fonts)) {
  if (!ok) problems.push(`the ${role} face did not load`);
}

/* preferCSSPageSize, so the paper and the margins are the ones declared in
   cv.css. Passing them here as well is how they drift. */
await page.pdf({ path: OUT, printBackground: true, preferCSSPageSize: true });

await browser.close();
server.close();

const { size } = await import('node:fs').then(fs => fs.promises.stat(OUT));
const bytes = await readFile(OUT);
const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

console.log(`${OUT}\n  ${(size / 1024).toFixed(0)}KB, ${pages} page${pages === 1 ? '' : 's'}`);
if (problems.length) {
  console.error('\nproblems:\n  ' + problems.join('\n  '));
  process.exit(1);
}
