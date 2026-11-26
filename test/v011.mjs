// 0.11: text styles and real fonts, tone, background graphics, barcode, proof/screen PDF,
// page images, carousel, EPUB, file list, collected originals, photo-book layouts, soft proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-011-'));
process.env.BILLERBOOK_DATA = tmp;
const ops = await import('../public/lib/ops.js');
const { resolveStyle, STYLE_PRESETS } = await import('../public/lib/text.js');
const { exportInterior, exportCover } = await import('../lib/pdf.mjs');
const { extraChecks } = await import('../lib/checks.mjs');
const { parseIsbn, barcodeBars } = await import('../public/lib/barcode.js');
const { exportImages, exportCarousel, exportEpub, writeFileList, collectOriginals } = await import('../lib/exports.mjs');
const { softProof } = await import('../lib/imagefx.mjs');
const { buildFrames } = await import('../public/lib/layouts.js');
const { renderSpread } = await import('../lib/preview.mjs');

let n = 0;
const ok = (msg) => { n++; console.log('ok', n, msg); };
const pdfPages = (f) => Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f]).toString())[1]);
const raster = async (pdf, page, res = 30) => {
  const prefix = path.join(tmp, `r${Math.random().toString(36).slice(2)}`);
  execFileSync('pdftoppm', ['-r', String(res), '-f', String(page), '-l', String(page), '-png', pdf, prefix]);
  const f = fs.readdirSync(tmp).map((x) => path.join(tmp, x)).find((x) => x.startsWith(prefix));
  return sharp(f).raw().toBuffer({ resolveWithObject: true });
};

// photos: red-ish landscape, blue portrait
const imgA = path.join(tmp, 'a.jpg'), imgB = path.join(tmp, 'b.jpg');
await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#c8503c' } }).jpeg().toFile(imgA);
await sharp({ create: { width: 1200, height: 1800, channels: 3, background: '#3366aa' } }).jpeg().toFile(imgB);
const pool = new Map([
  ['f:a', { key: 'f:a', name: 'a.jpg', file: imgA, w: 1800, h: 1200, source: 'folder' }],
  ['lr:UUID-B', { key: 'lr:UUID-B', name: 'b.jpg', file: imgB, w: 1200, h: 1800, source: 'lightroom', caption: 'Winter' }],
]);

function book(provider = 'wmd', format = 'hc-a4-quer', pages = 4) {
  const pr = ops.newProject('Test');
  const ed = ops.addEdition(pr, { provider, format });
  ops.insertPages(pr, ed.id, 0, pages, 'leer');
  return { pr, ed };
}

// 1 text styles: role → edition style → named style → own values; presets set the font
{
  const { pr, ed } = book();
  ops.setTextStyle(pr, ed.id, 'caption', { size: 8, italic: true });
  ops.setTextStyle(pr, ed.id, 'quote', { name: 'Quote', family: 'eb-garamond', size: 14 });
  let st = resolveStyle(ed, 'caption', { value: 'x' });
  assert.equal(st.size, 8); assert.equal(st.italic, true);
  st = resolveStyle(ed, 'caption', { value: 'x', style: 'quote', size: 12 });
  assert.equal(st.family, 'eb-garamond'); assert.equal(st.size, 12);
  ops.applyStylePreset(pr, ed.id, 'gallery');
  assert.equal(ed.font, 'jost');
  assert.ok(ed.textStyles.quote, 'own styles survive a preset');
  assert.equal(resolveStyle(ed, 'title', {}).caps, true);
  assert.ok(STYLE_PRESETS.length >= 5);
  ok('text styles resolve in order, presets set font and role styles and keep own styles');
}

// 2 text is outlined in the PDF: no font objects, glyphs drawn as filled paths, umlauts fine
{
  const { pr, ed } = book();
  ops.setLayout(pr, ed.id, 0, 'text');
  ops.setTextProps(pr, ed.id, { page: 0 }, 0, { value: 'Grüße aus Tostedt' });
  ops.setTextProps(pr, ed.id, { page: 0 }, 1, { value: 'Ein Jahr in Bildern – „Winter“ ẞ ő' });
  const f = path.join(tmp, 'text.pdf');
  await exportInterior({ ed, pool, project: pr, file: f, preview: true });
  const raw = fs.readFileSync(f, 'latin1');
  assert.ok(!/\/Type \/Font/.test(raw), 'no fonts embedded');
  const { data, info } = await raster(f, 1, 40);
  let dark = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] < 100) dark++;
  assert.ok(dark > 200, `title glyphs are drawn (${dark} dark px)`);
  ok('text prints as outlines with the chosen font, nothing to embed');
}

// 3 overflow and small text are reported
{
  const { pr, ed } = book();
  ops.setLayout(pr, ed.id, 0, 'bild-text');
  ops.placeImage(pr, ed.id, 0, 0, 'f:a');
  ops.setTextProps(pr, ed.id, { page: 0 }, 0, { value: 'Lorem ipsum dolor sit amet '.repeat(40) });
  ops.setLayout(pr, ed.id, 1, 'text');
  ops.setTextProps(pr, ed.id, { page: 1 }, 0, { value: 'Klein', size: 5 });
  const w = extraChecks(pr, ed, pool);
  assert.ok(w.some((x) => x.code === 'text-overflow' && x.page === 0), 'overflow found');
  assert.ok(w.some((x) => x.code === 'text-small' && x.page === 1), 'small text found');
  ok('preflight finds text that does not fit and text below 6 pt');
}

// 4 tone: black-and-white photo prints neutral, colour photo next to it keeps its colour
{
  const { pr, ed } = book();
  ops.setLayout(pr, ed.id, 0, 'voll'); ops.placeImage(pr, ed.id, 0, 0, 'f:a');
  ops.setTone(pr, ed.id, { page: 0 }, 0, 'bw');
  ops.setLayout(pr, ed.id, 1, 'voll'); ops.placeImage(pr, ed.id, 1, 0, 'f:a');
  const f = path.join(tmp, 'tone.pdf');
  await exportInterior({ ed, pool, project: pr, file: f, preview: true });
  const a = await raster(f, 1), b = await raster(f, 2);
  const mid = (r) => { const i = (Math.floor(r.info.height / 2) * r.info.width + Math.floor(r.info.width / 2)) * r.info.channels; return [...r.data.slice(i, i + 3)]; };
  const [r1, g1, b1] = mid(a), [r2, , b2] = mid(b);
  assert.ok(Math.abs(r1 - g1) < 6 && Math.abs(g1 - b1) < 6, `bw page neutral ${[r1, g1, b1]}`);
  assert.ok(r2 > b2 + 60, `colour page still red ${[r2, b2]}`);
  ok('black-and-white tone in print, the original stays untouched');
}

// 5 background graphic and frame lines end up in the PDF
{
  const { pr, ed } = book();
  ops.setPageProps(pr, ed.id, 0, { bgGraphic: { id: 'kraft' } });
  const f = path.join(tmp, 'gfx.pdf');
  await exportInterior({ ed, pool, project: pr, file: f, preview: true });
  const r = await raster(f, 1);
  const i = (Math.floor(r.info.height / 2) * r.info.width + 20) * r.info.channels;
  const [R, G, B] = r.data.slice(i, i + 3);
  assert.ok(R > B + 30 && R < 230, `kraft colour ${[R, G, B]}`);
  ok('background graphic (kraft paper) is printed under the page');
}

// 6 ISBN and barcode: check digit, ISBN-10 conversion, IngramSpark requires it, bars in the cover PDF
{
  assert.equal(parseIsbn('978-3-16-148410-0').ok, true);
  assert.equal(parseIsbn('978-3-16-148410-1').ok, false);
  assert.equal(parseIsbn('3-16-148410-X').isbn13, '9783161484100');
  const g = barcodeBars('9783161484100', { scale: 1 });
  assert.ok(Math.abs(g.width - 37.29) < 0.01, `EAN-13 width with quiet zones ${g.width}`);
  const p2 = ops.newProject('i');
  const e2 = ops.addEdition(p2, { provider: 'ingramspark' });
  ops.insertPages(p2, e2.id, 0, 24, 'leer');
  assert.ok(extraChecks(p2, e2, pool).some((w) => w.code === 'barcode-required'), 'IngramSpark wants a barcode');
  ops.setCover(p2, e2.id, { barcode: { mode: 'isbn', isbn: '978-3-16-148410-0', addon: '90000' } });
  assert.ok(!extraChecks(p2, e2, pool).some((w) => w.code.startsWith('barcode') || w.code === 'isbn-invalid'));
  const f = path.join(tmp, 'cover.pdf');
  const c = await exportCover({ ed: e2, pool, project: p2, file: f, preview: true });
  assert.equal(c.barcode.isbn13, '9783161484100');
  const raw = fs.readFileSync(f, 'latin1');
  assert.ok((raw.match(/ re/g) || []).length > 30, 'bars drawn as vectors');
  ok('ISBN check, EAN-13 with add-on as vector bars, IngramSpark barcode rule');
}

// 7 proof PDF: summary page + every page, numbered markers; screen PDF: spreads without bleed
{
  const { pr, ed } = book('wmd', 'hc-a4-quer', 4);
  ops.setLayout(pr, ed.id, 0, 'zwei-a'); ops.placeImage(pr, ed.id, 0, 0, 'f:a');
  const warnings = [...ops.preflight(pr, ed.id, pool), ...extraChecks(pr, ed, pool)];
  const f = path.join(tmp, 'proof.pdf');
  await exportInterior({ ed, pool, project: pr, file: f, preview: true, proof: { warnings, lang: 'de' } });
  assert.equal(pdfPages(f), 5);
  const txt = execFileSync('pdfinfo', [f]).toString();
  assert.ok(/Pages/.test(txt));
  const s = path.join(tmp, 'screen.pdf');
  const r = await exportInterior({ ed, pool, project: pr, file: s, screen: true });
  assert.equal(r.size, `${2 * ed.w} × ${ed.h} mm`);
  ok('proof PDF with summary page and markers, screen PDF as trimmed double pages');
}

// 8 page images, carousel and EPUB
{
  const { pr, ed } = book('wmd', 'hc-a4-quer', 4);
  for (let i = 0; i < 4; i++) { ops.setLayout(pr, ed.id, i, 'tafel'); ops.placeImage(pr, ed.id, i, 0, i % 2 ? 'lr:UUID-B' : 'f:a'); }
  const im = await exportImages({ project: pr, ed, pool, dir: tmp, base: 'img', mode: 'pages', width: 1200 });
  assert.equal(im.files, 5);
  const m = await sharp(path.join(im.dir, '001.jpg')).metadata();
  assert.equal(m.width, 1200);
  const car = await exportCarousel({ project: pr, ed, pool, dir: tmp, base: 'c' });
  assert.equal(car.files, 6);
  const cm = await sharp(path.join(car.dir, '001-1.jpg')).metadata();
  assert.deepEqual([cm.width, cm.height], [1080, 1350]);
  const ep = path.join(tmp, 'b.epub');
  await exportEpub({ project: pr, ed, pool, file: ep, title: 'Test', lang: 'de' });
  const head = fs.readFileSync(ep).subarray(0, 60).toString('latin1');
  assert.ok(head.includes('mimetypeapplication/epub+zip'), 'mimetype first and stored');
  const list = execFileSync('unzip', ['-l', ep]).toString();
  assert.ok(list.includes('OEBPS/content.opf') && list.includes('OEBPS/p004.xhtml'));
  ok('page JPEGs from originals, 1080 × 1350 carousel slides, fixed-layout EPUB');
}

// 9 file list and collected originals
{
  const { pr, ed } = book('wmd', 'hc-a4-quer', 2);
  ops.setLayout(pr, ed.id, 0, 'zwei-a'); ops.placeImage(pr, ed.id, 0, 0, 'f:a'); ops.placeImage(pr, ed.id, 0, 1, 'lr:UUID-B');
  ops.setTone(pr, ed.id, { page: 0 }, 1, 'sepia');
  const r = await writeFileList({ ed, pool, dir: tmp, base: 'list' });
  const csv = fs.readFileSync(r.csv, 'utf8');
  assert.ok(csv.includes('"UUID-B"') && csv.includes('"sepia"') && csv.includes(imgA));
  assert.deepEqual(fs.readFileSync(r.paths, 'utf8').trim().split('\n'), [imgA, imgB]);
  const c = await collectOriginals({ ed, pool, dir: tmp, base: 'orig' });
  assert.equal(c.copied, 2);
  assert.ok(fs.readdirSync(c.dir).includes('S001-1_a.jpg'));
  ok('file list as CSV/TXT with paths, Lightroom ids and tone; originals collected by page');
}

// 10 photo-book layouts and monograph auto layout
{
  const { pr, ed } = book('wmd', 'hc-a4-hoch', 0);
  const items = [...pool.values()].map((x, i) => ({ ...x, rating: i === 0 ? 5 : 3 }));
  ops.autoFill(pr, ed.id, [...items, ...items, ...items], { style: 'monograph', rightHand: true });
  assert.ok(ed.pages.every((p, i) => (i % 2 === 1 ? p.layout === 'leer' : true)), 'left pages stay white');
  const plate = ed.pages.findIndex((p) => p.layout === 'tafel');
  const f = buildFrames(ed, plate, (k) => (pool.get(k).w / pool.get(k).h))[0];
  // Canon margins along the photo's short side; across it the plate may grow to narrow margins (0.26: large portrait plates)
  assert.ok(f.x >= ed.w * 0.07 - 0.01 && f.y >= ed.h * 0.06 - 0.01 && f.x + f.w <= ed.w - ed.w * 0.07 + 0.01 && f.y + f.h <= ed.h - ed.h * 0.09 + 0.01, 'plate inside the page margins');
  ok('monograph layouts sit in the canon block; monograph auto layout keeps photos on right pages');
}

// 11 soft proof marks out-of-gamut colours and keeps in-gamut ones
{
  const neon = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#00ff40' } }).jpeg().toBuffer();
  const grey = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#808080' } }).jpeg().toBuffer();
  const a = await softProof(neon, 'cmyk', { gamut: true });
  const b = await softProof(grey, 'cmyk', { gamut: true });
  assert.ok(a.marked > 0.9, `neon green out of gamut ${a.marked}`);
  assert.ok(b.marked < 0.01, `grey in gamut ${b.marked}`);
  const { pr, ed } = book();
  ops.setLayout(pr, ed.id, 0, 'voll'); ops.placeImage(pr, ed.id, 0, 0, 'f:a');
  const jpg = await renderSpread(pr, ed, pool, 0, 800, { proof: { gamut: false } });
  assert.ok((await sharp(jpg).metadata()).width === 800);
  ok('soft proof through the CMYK profile, gamut warning only where colours shift');
}

// 12 page selection, interactive HTML, CBZ
{
  const { subsetEdition, exportHtml, exportCbz } = await import('../lib/exports.mjs');
  const { pr, ed } = book('wmd', 'hc-a4-quer', 6);
  for (let i = 0; i < 6; i++) { ops.setLayout(pr, ed.id, i, 'tafel-legende'); ops.placeImage(pr, ed.id, i, 0, 'f:a'); ops.setTextProps(pr, ed.id, { page: i }, 0, { value: `Bild ${i + 1}` }); }
  ops.setLayout(pr, ed.id, 3, 'dps-voll'); ops.placeImage(pr, ed.id, 3, 0, 'f:a');
  const sub = subsetEdition(ed, '2, 4');
  assert.deepEqual(sub.subset, [2, 4, 5], 'spread partner comes along');
  const h = await exportHtml({ project: pr, ed: sub, pool, dir: tmp, base: 'h', title: 'Test & Buch', lang: 'de' });
  const html = fs.readFileSync(h.file, 'utf8');
  assert.ok(html.includes('Bild 2') && html.includes('Test &amp; Buch') && html.includes('data-billerbook'));
  assert.ok(fs.existsSync(path.join(h.dir, 'embed.html')) && fs.existsSync(path.join(h.dir, 'book.js')));
  // Only one spread is visible at a time (the hidden attribute must win over the CSS display rule)
  assert.ok(fs.readFileSync(path.join(h.dir, 'book.css'), 'utf8').includes('.bb-spread[hidden]{display:none}'));
  const figs = html.match(/<figure class="bb-spread[^>]*>/g) || [];
  assert.equal(figs.filter((f) => !/ hidden>$/.test(f)).length, 1, 'one spread visible at load');
  // Phones get one page at a time, cut from the spread image, and the book reports its height to an embedding page
  const css = fs.readFileSync(path.join(h.dir, 'book.css'), 'utf8'), js = fs.readFileSync(path.join(h.dir, 'book.js'), 'utf8');
  assert.ok(css.includes('.bb-pages .bb-spread.bb-r .bb-clip img{margin-left:-100%}') && js.includes("matchMedia('(max-width: 700px)')") && js.includes("billerbook: 'height'"));
  assert.equal((html.match(/class="bb-full"/g) || []).length, 1, 'one full-screen button');
  assert.ok(figs.every((f) => f.includes('data-label=')) && html.includes('<div class="bb-clip"><img'));
  const cbz = path.join(tmp, 'b.cbz');
  await exportCbz({ project: pr, ed: sub, pool, file: cbz });
  assert.ok(execFileSync('unzip', ['-l', cbz]).toString().includes('003.jpg'));
  ok('page selection keeps spreads whole; interactive HTML book with real text; CBZ');
}

// 13 project file round trip with media, and safe import
{
  const { exportPackage, importPackage } = await import('../lib/package.mjs');
  const { loadProject } = await import('../lib/store.mjs');
  const { pr, ed } = book('wmd', 'hc-a4-quer', 2);
  ops.setLayout(pr, ed.id, 0, 'zwei-a'); ops.placeImage(pr, ed.id, 0, 0, 'f:a'); ops.placeImage(pr, ed.id, 0, 1, 'lr:UUID-B');
  const f = path.join(tmp, 'p.billerbook');
  const r = await exportPackage({ project: pr, pool, file: f, media: true });
  assert.equal(r.photos, 2);
  const im = await importPackage(f);
  const p2 = await loadProject(im.id);
  const keys = p2.editions[0].pages[0].slots.map((x) => x.key);
  assert.ok(keys.every((k) => k.startsWith('f:') && fs.existsSync(k.slice(2))), 'media unpacked and linked');
  // zip-slip attempt
  const evil = path.join(tmp, 'evil.billerbook');
  execFileSync('python3', ['-c', `import zipfile\nz=zipfile.ZipFile(${JSON.stringify(evil)},'w')\nz.writestr('manifest.json','{"format":"billerbook","version":1}')\nz.writestr('media/../../evil.txt','x')\nz.close()`]);
  await assert.rejects(importPackage(evil));
  // Review 22.11.: an imported package keeps none of the sender's paths and no unknown tones
  const crafted = path.join(tmp, 'crafted.billerbook');
  execFileSync('python3', ['-c', `import zipfile,json\nsrc=zipfile.ZipFile(${JSON.stringify(f)})\nz=zipfile.ZipFile(${JSON.stringify(crafted)},'w')\nfor n in src.namelist():\n  d=src.read(n)\n  if n=='project.json':\n    j=json.loads(d); j['sources']={'folders':['/'],'captureone':{'snapshot':[{'id':'x','file':'/etc/x.jpg'}],'exportFolder':'/'}}\n    j['editions'][0]['pages'][0]['slots'][0]['tone']='/../../x'; j['editions'][0]['subset']=['1"/>']\n    d=json.dumps(j)\n  z.writestr(n,d)\nz.close()`]);
  const im2 = await importPackage(crafted);
  const p3 = await loadProject(im2.id);
  assert.deepEqual(p3.sources.folders, [], 'folders of the sender dropped');
  assert.ok(!p3.sources.captureone, 'Capture One source dropped');
  assert.ok(p3.editions[0].pages[0].slots[0].tone == null && p3.editions[0].subset == null, 'unknown tone and stored subset removed');
  ok('.billerbook project file with photos round-trips; entries with ../ are refused');
}

// 14 HTML file import: headings → chapters, figures → plates with captions, paragraphs → text
{
  const { loadHtmlSource, blocksToPages, parseHtml } = await import('../lib/htmlimport.mjs');
  const dir = path.join(tmp, 'site'); fs.mkdirSync(dir);
  fs.copyFileSync(imgA, path.join(dir, 'rose.jpg'));
  fs.writeFileSync(path.join(dir, 'post.html'), '<html><head><title>Rosen</title></head><body><nav>x</nav><article><h1>Die Rose</h1><p>Sie blüht im Juni.</p><figure><img src="rose.jpg" alt="Rose"><figcaption>Rosa canina, Juni</figcaption></figure><script>alert(1)</script></article></body></html>');
  const src = await loadHtmlSource(path.join(dir, 'post.html'), path.join(tmp, 'imp'));
  assert.equal(src.title, 'Rosen');
  const pages = blocksToPages(src.blocks, ops.newPage);
  assert.deepEqual(pages.map((x) => x.layout), ['kapitel', 'text-kanon', 'tafel-legende']);
  assert.equal(pages[2].texts[0].value, 'Rosa canina, Juni');
  assert.ok(!JSON.stringify(parseHtml('<article><script>x</script><p>a b</p></article>', 'https://x').blocks).includes('script'));
  await assert.rejects(loadHtmlSource('http://127.0.0.1:4580/api/projects', path.join(tmp, 'imp2')), /local/);
  // SVG <path> must not be read as a paragraph (it swallowed whole galleries), small <article> teasers lose to <main>
  const g = parseHtml('<article><p>Teaser</p></article><main><p>Intro</p><div><svg><path d="M0 0"/></svg><img src="https://x.de/a.jpg"><img src="https://x.de/b.jpg"></div><p>Ende</p></main>', 'https://x.de/');
  assert.equal(g.blocks.filter((b) => b.kind === 'image').length, 2);
  const g2 = parseHtml('<main><p>Vorher<img src="https://x.de/c.jpg" alt="Schnee">Nachher</p></main>', 'https://x.de/');
  assert.deepEqual(g2.blocks.map((b) => b.kind), ['text', 'image', 'text']);
  ok('web page import: chapters, plates with captions, text; galleries behind SVG icons; local addresses refused');
}

console.log(`\n${n} checks for 0.11 passed`);
