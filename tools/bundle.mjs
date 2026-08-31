/* Fold a page and everything it loads into one self-contained HTML file.
 *
 *   node tools/bundle.mjs index.html > dist/portfolio.html
 *   node tools/bundle.mjs cv.html --fragment > dist/cv-fragment.html
 *
 * Why this exists: "send me your portfolio" is sometimes answered with a link
 * and sometimes with a file. This produces the file — one document, no folder
 * to keep together, opens off a memory stick or an email attachment with the
 * right typefaces and the screenshots in it.
 *
 * Stylesheets, the script, the fonts, the images and the linked PDF all go in:
 * binaries as data: URIs, everything else as text. Nothing is minified, because
 * the point is a page somebody can still read the source of.
 *
 * --fragment drops <!doctype>, <html>, <head> and <body> and emits the contents
 * of the body preceded by the <title> and <style> blocks, for hosts that inject
 * a page into a document they already have. It carries its own <meta charset>
 * first: served as plain text/html with no declaration, a browser falls back to
 * windows-1252 and every curly apostrophe on the page becomes mojibake.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const MIME = {
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
};
const mimeOf = p => MIME[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream';

async function dataURI(file) {
  const bytes = await readFile(file);
  return `data:${mimeOf(file)};base64,${bytes.toString('base64')}`;
}

/* Resolve a href written in a document against that document's own folder, the
   way the browser would, and refuse to leave the project. */
function resolveRef(fromFile, ref) {
  const p = resolve(dirname(fromFile), ref.split('?')[0].split('#')[0]);
  if (!p.startsWith(ROOT)) throw new Error(`refuses to leave the project: ${ref}`);
  return p;
}

/* Inline every url() a stylesheet names. A data: URI must keep its query
   string off — a `?v=` on one is part of the data, not a cache key, and
   Chromium rejects the whole URL. */
async function inlineCSS(file) {
  let css = await readFile(file, 'utf8');
  const refs = [...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)]
    .map(m => m[2])
    .filter(u => !u.startsWith('data:') && !/^https?:/.test(u));

  for (const ref of [...new Set(refs)]) {
    const uri = await dataURI(resolveRef(file, ref));
    css = css.split(`url(${ref})`).join(`url(${uri})`);
    css = css.split(`url('${ref}')`).join(`url('${uri}')`);
    css = css.split(`url("${ref}")`).join(`url("${uri}")`);
  }
  return css;
}

const [pageArg, ...flags] = process.argv.slice(2);
const fragment = flags.includes('--fragment');
const pageFile = join(ROOT, pageArg || 'index.html');
let html = await readFile(pageFile, 'utf8');

/* stylesheets -> <style> */
for (const m of [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]) {
  const href = /href="([^"]+)"/.exec(m[0])?.[1];
  if (!href || /^https?:/.test(href)) continue;
  html = html.replace(m[0], `<style>\n${await inlineCSS(resolveRef(pageFile, href))}\n</style>`);
}

/* scripts -> <script> */
for (const m of [...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)]) {
  if (/^https?:/.test(m[1])) continue;
  const js = await readFile(resolveRef(pageFile, m[1]), 'utf8');
  /* A literal </script> inside the source would close this tag early. */
  html = html.replace(m[0], `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
}

/* images and linked documents -> data: URIs.
   Each replacement is made INSIDE the matched tag and the whole tag is swapped
   back in. Replacing the bare path across the document instead hits the first
   occurrence anywhere — and the og:image meta ends with the same path as the
   <img> it describes, so the meta was rewritten and the image left alone. */
const swapAttr = async (tag, attr) => {
  const ref = new RegExp(`${attr}="([^"]+)"`).exec(tag)?.[1];
  if (!ref || ref.startsWith('data:') || /^https?:/.test(ref)) return null;
  return tag.replace(`${attr}="${ref}"`, `${attr}="${await dataURI(resolveRef(pageFile, ref))}"`);
};

for (const m of [...html.matchAll(/<img[^>]+>/g)]) {
  const swapped = await swapAttr(m[0], 'src');
  if (swapped) html = html.replace(m[0], swapped);
}

/* A link to a file that lives beside the page — the CV — has to travel with it
   or the single-file copy is a portfolio with a broken download on it. */
for (const m of [...html.matchAll(/<a[^>]+href="[^"]+\.pdf"[^>]*>/g)]) {
  const swapped = await swapAttr(m[0], 'href');
  if (swapped) html = html.split(m[0]).join(swapped);
}

if (fragment) {
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '';
  const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map(m => m[0]).join('\n');
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  html = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    styles,
    body.trim(),
  ].join('\n');
}

process.stdout.write(html);
process.stderr.write(`bundled ${pageArg || 'index.html'}: ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB\n`);
