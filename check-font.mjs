#!/usr/bin/env node
/**
 * Does this Arabic font survive Chrome's "Save as PDF"?
 *
 * Renders a short Arabic test document with each font you pass, prints it to PDF
 * with headless Chrome (the same engine as Puppeteer, Playwright and most
 * HTML-to-PDF services), then reads the text back with pdf.js and reports:
 *
 *   1. presentation forms  - did the PDF store real Arabic letters (U+0600-U+06FF),
 *                            or shaped glyph codes (U+FB50-FDFF, U+FE70-FEFF)?
 *   2. lam-alef order      - do the words الأمر / الآن / لإدارة come back in the
 *                            right order, or as alef+lam reversed?
 *   3. searchable words    - how many whole words of the test text can be found
 *                            by a plain text search in the PDF.
 *
 * None of this is visible on screen: a broken PDF looks perfect and only fails
 * when someone copies, searches, or feeds it to an ATS.
 *
 * Usage:
 *   npm install
 *   node check-font.mjs path/to/Amiri-Regular.ttf path/to/Other.ttf ...
 *   CHROME_PATH=/usr/bin/google-chrome node check-font.mjs font.ttf
 *   node check-font.mjs --json fonts/*.ttf      machine-readable output
 *
 * MIT licence. https://github.com/mahmoudQq2023/arabic-pdf-fonts
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const fonts = args.filter((a) => a !== '--json');
if (!fonts.length) {
  console.error('usage: node check-font.mjs [--json] font1.ttf [font2.otf ...]');
  process.exit(2);
}

const PRESENTATION_FORMS = /[\uFB50-\uFDFF\uFE70-\uFEFF]/;
const TITLE = 'خطاب تعريف';
const BODY = 'إلى من يهمه الأمر، أفيدكم بأن الموظف يعمل لدينا منذ عام 2019.';
const MIXED = 'التقرير النهائي عن مشروع Atlas لسنة 2026 جاهز الآن.';
// لا / لأ / لإ / لآ is a single ligature glyph; reversing it is the quiet failure.
const LAM_ALEF = ['الأمر', 'الآن', 'لإدارة'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const strip = (s) => s.replace(/[\u0000\u064B-\u0652\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim();

function html(fontFile) {
  const ext = path.extname(fontFile).slice(1).toLowerCase();
  const format = ext === 'otf' ? 'opentype' : ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : 'truetype';
  const b64 = fs.readFileSync(fontFile).toString('base64');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:'UnderTest';src:url(data:font/${ext};base64,${b64}) format('${format}');font-display:block;}
body{font-family:'UnderTest';font-size:14pt;line-height:1.8;margin:0;}
h1{font-size:22pt;margin:0 0 12pt;}
</style></head><body><h1>${esc(TITLE)}</h1><p>${esc(BODY)}</p><p>${esc(MIXED)}</p><p>${esc(LAM_ALEF.join(' '))}</p></body></html>`;
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const results = [];
for (const f of fonts) {
  const name = path.basename(f);
  try {
    const page = await browser.newPage();
    await page.setContent(html(f), { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    const loaded = await page.evaluate(() => document.fonts.check("14pt 'UnderTest'"));
    const pdf = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
    await page.close();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise;
    const raw = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join('');
    const words = [...new Set(`${TITLE} ${BODY} ${MIXED}`.split(/\s+/).map(strip).filter((w) => w.length > 2 && /[\u0600-\u06FF]/.test(w)))];
    const found = words.filter((w) => raw.includes(w));
    const lamAlef = LAM_ALEF.filter((w) => raw.includes(w));
    const forms = PRESENTATION_FORMS.test(raw);
    const verdict = !loaded ? 'FONT DID NOT LOAD'
      : forms ? 'BROKEN: presentation forms (text not searchable)'
      : lamAlef.length < LAM_ALEF.length ? 'PARTLY BROKEN: lam-alef reversed'
      : 'OK: real letters, lam-alef in order';
    results.push({ font: name, loaded, presentationForms: forms, lamAlefOk: lamAlef.length === LAM_ALEF.length,
      wordsFound: found.length, wordsTotal: words.length, verdict });
  } catch (e) {
    results.push({ font: name, verdict: 'ERROR: ' + e.message });
  }
}
await browser.close();

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    console.log(`${r.font.padEnd(34)} ${r.verdict}` + (r.wordsTotal ? `  (${r.wordsFound}/${r.wordsTotal} words searchable)` : ''));
  }
}
process.exit(results.some((r) => !String(r.verdict).startsWith('OK')) ? 1 : 0);
