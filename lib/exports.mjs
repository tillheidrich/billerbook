// Exports besides the print PDFs: page images, Instagram carousel, EPUB, file list, collected originals.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import yazl from 'yazl';
import { spreadsOf, placement } from '../public/lib/geometry.js';
import { buildFrames, pageOwner, coverFrames } from '../public/lib/layouts.js';
import { renderSpread, renderPage, renderCover } from './preview.mjs';

const pad = (n, l = 3) => String(n).padStart(l, '0');

// JPEG or PNG of every page or every double page, rendered from the original files.
export async function exportImages({ project, ed, pool, dir, base, mode = 'spreads', width = 3000, format = 'jpeg', onProgress = () => {} }) {
  const out = path.join(dir, `${base}_${mode === 'pages' ? 'pages' : 'spreads'}`);
  await fsp.mkdir(out, { recursive: true });
  const ext = format === 'png' ? 'png' : 'jpg';
  const files = [];
  const fmt = format === 'png' ? 'png' : 'jpeg-hq';
  if (mode === 'pages') {
    for (let i = 0; i < ed.pages.length; i++) {
      const f = path.join(out, `${pad(i + 1)}.${ext}`);
      await fsp.writeFile(f, await renderPage(project, ed, pool, i, width, { quality: 'original', format: fmt, placeholders: false }));
      files.push(f); onProgress(i + 1, ed.pages.length);
    }
  } else {
    const sps = spreadsOf(ed.pages.length);
    for (let s = 0; s < sps.length; s++) {
      const [l, r] = sps[s];
      const name = [l, r].filter((x) => x != null).map((x) => pad(x + 1)).join('-');
      const f = path.join(out, `${name}.${ext}`);
      await fsp.writeFile(f, await renderSpread(project, ed, pool, s, width, { quality: 'original', format: fmt, placeholders: false, gutterLine: false }));
      files.push(f); onProgress(s + 1, sps.length);
    }
  }
  if (ed.cover?.mode !== 'none') {
    const f = path.join(out, `cover.${ext}`);
    await fsp.writeFile(f, await renderCover(project, ed, pool, width, { guides: false, quality: 'original', format: fmt }));
    files.push(f);
  }
  return { dir: out, files: files.length };
}

// Instagram carousel: every double page split into two 1080 × 1350 slides that join seamlessly.
export async function exportCarousel({ project, ed, pool, dir, base, onProgress = () => {} }) {
  const out = path.join(dir, `${base}_carousel`);
  await fsp.mkdir(out, { recursive: true });
  const sps = spreadsOf(ed.pages.length);
  let n = 0;
  for (let s = 0; s < sps.length; s++) {
    const img = await renderSpread(project, ed, pool, s, 2160, { quality: 'original', format: 'jpeg-hq', placeholders: false, gutterLine: false });
    const m = await sharp(img).metadata();
    // Fit the spread into 2160 × 1350, centred on a light neutral backdrop.
    const canvas = await sharp({ create: { width: 2160, height: 1350, channels: 3, background: '#f2f1ee' } })
      .composite([{ input: await sharp(img).resize(2160, 1350, { fit: 'inside' }).toBuffer(), gravity: 'center' }]).jpeg({ quality: 92 }).toBuffer();
    for (const half of [0, 1]) {
      await sharp(canvas).extract({ left: half * 1080, top: 0, width: 1080, height: 1350 }).jpeg({ quality: 90 }).withIccProfile('srgb').toFile(path.join(out, `${pad(s + 1)}-${half + 1}.jpg`));
      n++;
    }
    void m;
    onProgress(s + 1, sps.length);
  }
  return { dir: out, files: n };
}

// Fixed-layout EPUB 3: one rendered image per page, captions as alternative text.
export async function exportEpub({ project, ed, pool, file, title, lang = 'de', onProgress = () => {} }) {
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from('application/epub+zip'), 'mimetype', { compress: false });
  zip.addBuffer(Buffer.from(`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`), 'META-INF/container.xml');
  const pxW = 1400, pxH = Math.round((pxW * ed.h) / ed.w);
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const manifest = [], spine = [];
  const altOf = (i) => {
    const own = pageOwner(ed, i);
    const p = ed.pages[own.owner];
    const t = (p.texts || []).map((x) => x?.value).filter(Boolean).join(' – ');
    if (t) return t;
    const names = (p.slots || []).filter(Boolean).map((s) => pool.get(s.key)?.caption).filter(Boolean);
    return names.join(' – ') || `${lang === 'de' ? 'Seite' : 'Page'} ${i + 1}`;
  };
  const pageDoc = (img, alt) => `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=${pxW}, height=${pxH}"/><title>${esc(title)}</title><style>html,body{margin:0;padding:0;width:${pxW}px;height:${pxH}px}img{display:block;width:${pxW}px;height:${pxH}px}</style></head><body><img src="${img}" alt="${esc(alt)}"/></body></html>`;
  let coverItem = '';
  if (ed.cover?.mode !== 'none') {
    // Front panel of the cover as the cover image.
    const full = await renderCover(project, ed, pool, 3000, { guides: false, quality: 'original', format: 'jpeg-hq' });
    const { cs } = coverFrames(ed);
    const m = await sharp(full).metadata();
    const k = m.width / cs.W;
    const front = await sharp(full).extract({ left: Math.round(cs.front.x * k), top: Math.round(cs.visible.y * k), width: Math.min(m.width - Math.round(cs.front.x * k), Math.round(cs.front.w * k)), height: Math.round(cs.visible.h * k) }).resize(pxW, pxH, { fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
    zip.addBuffer(front, 'OEBPS/img/cover.jpg');
    zip.addBuffer(Buffer.from(pageDoc('img/cover.jpg', title)), 'OEBPS/cover.xhtml');
    manifest.push('<item id="cover-img" href="img/cover.jpg" media-type="image/jpeg" properties="cover-image"/>', '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover" properties="rendition:page-spread-center"/>');
    coverItem = 'cover.xhtml';
  }
  for (let i = 0; i < ed.pages.length; i++) {
    const img = await renderPage(project, ed, pool, i, pxW, { quality: 'original', format: 'jpeg', placeholders: false });
    zip.addBuffer(img, `OEBPS/img/p${pad(i + 1)}.jpg`);
    zip.addBuffer(Buffer.from(pageDoc(`img/p${pad(i + 1)}.jpg`, altOf(i))), `OEBPS/p${pad(i + 1)}.xhtml`);
    manifest.push(`<item id="i${i}" href="img/p${pad(i + 1)}.jpg" media-type="image/jpeg"/>`, `<item id="p${i}" href="p${pad(i + 1)}.xhtml" media-type="application/xhtml+xml"/>`);
    // Page 1 is a right page in print; keep that in readers that show double pages.
    spine.push(`<itemref idref="p${i}" properties="rendition:page-spread-${i % 2 === 0 ? 'right' : 'left'}"/>`);
    onProgress(i + 1, ed.pages.length);
  }
  const first = coverItem || 'p001.xhtml';
  zip.addBuffer(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}"><head><meta charset="utf-8"/><title>${esc(title)}</title></head><body><nav epub:type="toc"><ol><li><a href="${first}">${esc(title)}</a></li></ol></nav></body></html>`), 'OEBPS/nav.xhtml');
  const id = `urn:uuid:${crypto.randomUUID()}`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta><meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">landscape</meta><meta property="rendition:orientation">auto</meta><meta name="generator" content="Billerbook"/></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest.join('')}</manifest>
<spine page-progression-direction="ltr">${spine.join('')}</spine>
</package>`;
  zip.addBuffer(Buffer.from(opf), 'OEBPS/content.opf');
  zip.end();
  await new Promise((resolve, reject) => zip.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve).on('error', reject));
  return { file, pages: ed.pages.length };
}

// Which files are in this edition: page, frame, file, Lightroom id, effective resolution, tone.
export function usedFiles(ed, pool) {
  const rows = [];
  const aspectOf = (k) => { const it = pool.get(k); return it?.w ? it.w / it.h : null; };
  const add = (where, frameNo, slot, f) => {
    const it = pool.get(slot.key);
    let ppi = null;
    if (it?.w && f) ppi = Math.round(placement(f.w, f.h, it.w, it.h, slot).ppi);
    rows.push({
      page: where, frame: frameNo, name: it?.name || slot.key.replace(/^(f|lr):/, ''), path: it?.file || '',
      lightroomId: slot.key.startsWith('lr:') ? slot.key.slice(3) : '', ppi, tone: slot.tone || '', source: it?.source || '',
    });
  };
  for (let i = 0; i < ed.pages.length; i++) {
    if (pageOwner(ed, i).owner !== i) continue;
    const p = ed.pages[i];
    const frames = buildFrames(ed, i, aspectOf);
    for (const f of frames) if (f.kind === 'image' && p.slots?.[f.slot]?.key) add(String(i + 1), f.slot + 1, p.slots[f.slot], f);
    if (p.bgPhoto?.key) add(String(i + 1), 'bg', { key: p.bgPhoto.key, tone: p.bgPhoto.tone }, null);
  }
  if (ed.cover?.mode !== 'none') {
    const { frames } = coverFrames(ed, aspectOf);
    for (const f of frames) if (f.kind === 'image' && ed.coverDesign?.slots?.[f.slot]?.key) add('cover', f.slot + 1, ed.coverDesign.slots[f.slot], f);
  }
  return rows;
}

export async function writeFileList({ ed, pool, dir, base }) {
  const rows = usedFiles(ed, pool);
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['page', 'frame', 'file', 'path', 'lightroom_id', 'ppi', 'tone', 'source'];
  const csv = '﻿' + [head, ...rows.map((r) => [r.page, r.frame, r.name, r.path, r.lightroomId, r.ppi ?? '', r.tone, r.source])].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const paths = [...new Set(rows.map((r) => r.path).filter(Boolean))];
  const names = [...new Set(rows.map((r) => r.name).filter(Boolean))];
  const fCsv = path.join(dir, `${base}_files.csv`);
  const fTxt = path.join(dir, `${base}_paths.txt`);
  const fNames = path.join(dir, `${base}_filenames.txt`);
  await fsp.writeFile(fCsv, csv);
  await fsp.writeFile(fTxt, paths.join('\n') + '\n');
  await fsp.writeFile(fNames, names.join('\n') + '\n');
  return { csv: fCsv, paths: fTxt, names: fNames, photos: rows.length, uniqueFiles: paths.length, withoutFile: rows.filter((r) => !r.path).length };
}

// Copies every original used in the edition into one folder, named by page and frame.
export async function collectOriginals({ ed, pool, dir, base, onProgress = () => {} }) {
  const rows = usedFiles(ed, pool);
  const out = path.join(dir, `${base}_originals`);
  await fsp.mkdir(out, { recursive: true });
  let copied = 0;
  const skipped = [];
  for (let n = 0; n < rows.length; n++) {
    const r = rows[n];
    if (!r.path || !fs.existsSync(r.path)) { skipped.push(r.name); continue; }
    const tag = r.page === 'cover' ? 'U' : `S${pad(r.page)}`;
    await fsp.copyFile(r.path, path.join(out, `${tag}-${r.frame}_${path.basename(r.path)}`));
    copied++;
    onProgress(n + 1, rows.length);
  }
  return { dir: out, copied, skipped };
}

// ---------- page selection ----------
// "1-4, 8" (1-based) → edition copy with only those pages. A page that belongs to a double-page
// layout brings its partner along, so spreads stay whole.
export function subsetEdition(ed, spec) {
  if (!spec || !String(spec).trim()) return ed;
  const want = new Set();
  for (const part of String(spec).split(',')) {
    const [a, b] = part.trim().split('-').map((x) => parseInt(x, 10));
    if (!Number.isFinite(a)) continue;
    for (let i = a; i <= (Number.isFinite(b) ? b : a); i++) if (i >= 1 && i <= ed.pages.length) want.add(i - 1);
  }
  for (const i of [...want]) {
    const o = pageOwner(ed, i);
    want.add(o.owner);
    if (o.spread) want.add(o.owner + 1);
  }
  const idx = [...want].sort((x, y) => x - y);
  if (!idx.length) throw new Error(`no pages in "${spec}"`);
  return { ...ed, pages: idx.map((i) => ed.pages[i]), subset: idx.map((i) => i + 1) };
}

// ---------- comic book archive (CBZ): one JPEG per page, read by most e-book apps ----------
export async function exportCbz({ project, ed, pool, file, onProgress = () => {} }) {
  const zip = new yazl.ZipFile();
  if (ed.cover?.mode !== 'none') {
    const full = await renderCover(project, ed, pool, 2400, { guides: false, quality: 'original', format: 'jpeg-hq' });
    zip.addBuffer(full, '000-cover.jpg');
  }
  for (let i = 0; i < ed.pages.length; i++) {
    zip.addBuffer(await renderPage(project, ed, pool, i, 1800, { quality: 'original', format: 'jpeg', placeholders: false }), `${pad(i + 1)}.jpg`);
    onProgress(i + 1, ed.pages.length);
  }
  zip.end();
  await new Promise((resolve, reject) => zip.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve).on('error', reject));
  return { file, pages: ed.pages.length };
}

// ---------- interactive HTML book ----------
// A folder with index.html (works alone and as an iframe), book.js, book.css, the spreads as
// images in two sizes and book.json. Text of every page is in the HTML as real text, so search
// engines and screen readers can read it. embed.html shows the snippet for Astro or any site.
export async function exportHtml({ project, ed, pool, dir, base, title, lang = 'de', onProgress = () => {} }) {
  const out = path.join(dir, `${base}_html`);
  await fsp.mkdir(path.join(out, 'img'), { recursive: true });
  const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const sps = spreadsOf(ed.pages.length);
  const spreads = [];
  const textOf = (i) => {
    if (i == null) return [];
    const own = pageOwner(ed, i);
    if (own.owner !== i && own.spread) return [];
    const p = ed.pages[own.owner];
    const texts = (p.texts || []).map((x) => x?.value).filter(Boolean);
    const caps = (p.slots || []).filter(Boolean).map((s) => pool.get(s.key)?.caption).filter(Boolean);
    return [...texts, ...caps];
  };
  if (ed.cover?.mode !== 'none') {
    const { cs } = coverFrames(ed);
    const full = await renderCover(project, ed, pool, 3000, { guides: false, quality: 'original', format: 'jpeg-hq' });
    const m = await sharp(full).metadata();
    const k = m.width / cs.W;
    const ext = { left: Math.round(cs.front.x * k), top: Math.round(cs.visible.y * k), width: Math.min(m.width - Math.round(cs.front.x * k), Math.round(cs.front.w * k)), height: Math.round(cs.visible.h * k) };
    const front = sharp(full).extract(ext);
    await front.clone().resize(1200).jpeg({ quality: 84 }).toFile(path.join(out, 'img', 'cover-1200.jpg'));
    await front.clone().resize(600).jpeg({ quality: 80 }).toFile(path.join(out, 'img', 'cover-600.jpg'));
    spreads.push({ id: 'cover', label: lang === 'de' ? 'Umschlag' : 'Cover', single: true, img: 'img/cover', w: 1200, h: Math.round((1200 * ext.height) / ext.width), text: (ed.coverDesign?.texts || []).map((x) => x?.value).filter(Boolean) });
  }
  for (let s = 0; s < sps.length; s++) {
    const [l, r] = sps[s];
    const big = await renderSpread(project, ed, pool, s, 2400, { quality: 'original', format: 'jpeg-hq', placeholders: false, gutterLine: true });
    const name = `s${pad(s + 1)}`;
    const label = [l, r].filter((x) => x != null).map((x) => (ed.subset ? ed.subset[x] : x + 1)).join('–');
    if (l == null || r == null) {
      // First or last page on its own: show that page alone, not next to an empty white half.
      const m = await sharp(big).metadata();
      const half = sharp(big).extract({ left: l == null ? Math.round(m.width / 2) : 0, top: 0, width: Math.floor(m.width / 2), height: m.height });
      const buf = await half.toBuffer();
      await sharp(buf).resize(1200).jpeg({ quality: 84 }).toFile(path.join(out, 'img', `${name}-1200.jpg`));
      await sharp(buf).resize(600).jpeg({ quality: 80 }).toFile(path.join(out, 'img', `${name}-600.jpg`));
      spreads.push({ id: name, label, single: true, img: `img/${name}`, w: 1200, h: Math.round((1200 * ed.h) / ed.w), text: [...textOf(l), ...textOf(r)] });
      onProgress(s + 1, sps.length);
      continue;
    }
    await sharp(big).jpeg({ quality: 84 }).toFile(path.join(out, 'img', `${name}-2400.jpg`));
    await sharp(big).resize(1200).jpeg({ quality: 80 }).toFile(path.join(out, 'img', `${name}-1200.jpg`));
    spreads.push({ id: name, label, img: `img/${name}`, w: 2400, h: Math.round((2400 * ed.h) / (2 * ed.w)), text: [...textOf(l), ...textOf(r)] });
    onProgress(s + 1, sps.length);
  }
  const book = { title, generator: 'Billerbook', lang, format: { w: ed.w, h: ed.h }, spreads };
  await fsp.writeFile(path.join(out, 'book.json'), JSON.stringify(book, null, 2));
  await fsp.writeFile(path.join(out, 'book.css'), HTML_CSS);
  await fsp.writeFile(path.join(out, 'book.js'), HTML_JS);
  const slides = spreads.map((sp, i) => {
    const big = sp.single ? `${sp.img}-1200.jpg 1200w, ${sp.img}-600.jpg 600w` : `${sp.img}-2400.jpg 2400w, ${sp.img}-1200.jpg 1200w`;
    const alt = sp.text.join(' – ') || `${title} ${sp.label}`;
    return `<figure class="bb-spread${sp.single ? ' single' : ''}" data-i="${i}" data-label="${esc(sp.label)}"${i ? ' hidden' : ''}><div class="bb-clip"><img src="${sp.img}-1200.jpg" srcset="${big}" sizes="${sp.single ? '(max-width: 700px) 100vw, 600px' : '(max-width: 700px) 200vw, (min-width: 1200px) 1200px, 100vw'}" width="${sp.w}" height="${sp.h}" alt="${esc(alt)}"${i > 1 ? ' loading="lazy"' : ''}></div><figcaption>${esc(sp.label)}</figcaption></figure>`;
  }).join('\n');
  const transcript = spreads.filter((sp) => sp.text.length).map((sp) => `<section><h3>${esc(sp.label)}</h3>${sp.text.map((x) => `<p>${esc(x)}</p>`).join('')}</section>`).join('\n');
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(`${title} – ${spreads.length} ${lang === 'de' ? 'Doppelseiten' : 'spreads'}`)}">
<meta name="generator" content="Billerbook">
<link rel="stylesheet" href="book.css">
</head>
<body>
<div class="bb-book" data-billerbook>
  <div class="bb-stage">
${slides}
  </div>
  <nav class="bb-nav" aria-label="${lang === 'de' ? 'Blättern' : 'Page through'}">
    <button type="button" class="bb-prev" aria-label="${lang === 'de' ? 'Zurück' : 'Back'}">&#8249;</button>
    <span class="bb-count" aria-live="polite">1 / ${spreads.length}</span>
    <button type="button" class="bb-next" aria-label="${lang === 'de' ? 'Weiter' : 'Next'}">&#8250;</button>
    <button type="button" class="bb-full" aria-label="${lang === 'de' ? 'Vollbild' : 'Full screen'}">&#9974;</button>
  </nav>
</div>
<details class="bb-text"><summary>${lang === 'de' ? 'Texte im Buch' : 'Text in the book'}</summary>
${transcript}
</details>
<script src="book.js" defer></script>
</body>
</html>
`;
  await fsp.writeFile(path.join(out, 'index.html'), html);
  const ratio = (spreads[1] || spreads[0]).h / (spreads[1] || spreads[0]).w;
  const embed = `<!-- Billerbook: embed the book folder as /book/ on your site, then use one of these. -->

<!-- 1. iframe (any site, also Astro): -->
<iframe src="/book/index.html" title="${esc(title)}" loading="lazy" style="width:100%;aspect-ratio:${(1 / ratio).toFixed(4)};border:0" allowfullscreen></iframe>
<!-- Optional: let the iframe take the book's height (fits phones, where the book shows one page at a time). -->
<script>addEventListener('message', (e) => { const f = [...document.querySelectorAll('iframe')].find((x) => x.contentWindow === e.source); if (f && e.data && e.data.billerbook === 'height' && e.data.h > 0) { f.style.aspectRatio = 'auto'; f.style.height = e.data.h + 'px'; } });</script>

<!-- 2. Astro component, e.g. src/components/Book.astro (put the folder into public/book/): -->
---
const book = await fetch(new URL('/book/book.json', Astro.url)).then((r) => r.json()).catch(() => null);
---
<iframe src="/book/index.html" title={book?.title ?? 'Photo book'} loading="lazy" style={\`width:100%;aspect-ratio:${(1 / ratio).toFixed(4)};border:0\`} allowfullscreen></iframe>
`;
  await fsp.writeFile(path.join(out, 'embed.html'), embed);
  return { dir: out, file: path.join(out, 'index.html'), spreads: spreads.length };
}

const HTML_CSS = `:root{color-scheme:light dark;--bb-bg:#efede8;--bb-ink:#24221f}
@media (prefers-color-scheme:dark){:root{--bb-bg:#1b1a18;--bb-ink:#ece9e3}}
html,body{margin:0;background:var(--bb-bg);color:var(--bb-ink);font:15px/1.5 -apple-system,system-ui,sans-serif}
.bb-book{position:relative;max-width:1400px;margin:0 auto;padding:16px;outline:none}
.bb-book:focus-visible{outline:2px solid currentColor;outline-offset:-2px}
.bb-stage{position:relative;display:grid;place-items:center;min-height:120px;touch-action:pan-y pinch-zoom}
.bb-spread[hidden]{display:none}
.bb-spread{margin:0;width:100%;display:grid;justify-items:center;animation:bb-in .35s cubic-bezier(.16,1,.3,1)}
.bb-clip{width:100%;max-height:82dvh;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.18);background:#fff;display:flex}
.bb-clip img{display:block;width:100%;height:auto;max-height:82dvh;object-fit:contain}
.bb-spread.single .bb-clip{width:auto;max-width:60%}
.bb-spread.single .bb-clip img{width:auto;max-width:100%}
.bb-spread figcaption{font-size:12px;opacity:.6;margin-top:8px;font-variant-numeric:tabular-nums}
/* Page mode (narrow screens, e.g. phones in portrait): one page at a time, cut from the spread image. */
.bb-pages .bb-book{padding:8px 0 12px}
.bb-pages .bb-spread:not(.single) .bb-clip{width:100%;max-height:none}
.bb-pages .bb-spread:not(.single) .bb-clip img{width:200%;max-width:none;max-height:none;flex:none}
.bb-pages .bb-spread.bb-r .bb-clip img{margin-left:-100%}
.bb-pages .bb-spread.single .bb-clip{max-width:100%;width:100%}
.bb-pages .bb-spread.single .bb-clip img{width:100%}
.bb-nav{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:8px}
.bb-nav button{width:44px;height:44px;border-radius:50%;border:1px solid currentColor;background:none;color:inherit;font-size:20px;cursor:pointer;opacity:.75;touch-action:manipulation}
.bb-nav button:hover{opacity:1}.bb-nav button:disabled{opacity:.25;cursor:default}
.bb-count{font-variant-numeric:tabular-nums;min-width:64px;text-align:center}
.bb-text{max-width:70ch;margin:24px auto;padding:0 16px}.bb-text h3{font-size:13px;margin:16px 0 4px;opacity:.7}
@keyframes bb-in{from{opacity:0;transform:translateX(var(--bb-dir,0))}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.bb-spread{animation:none}}
.bb-book:fullscreen{background:var(--bb-bg);display:grid;align-content:center}
`;

const HTML_JS = `(() => {
  const narrow = matchMedia('(max-width: 700px)');
  // Tell an embedding page how tall the book is, so its iframe can fit without empty space.
  const report = () => { if (parent !== window) { const b = document.querySelector('[data-billerbook]'); if (b) parent.postMessage({ billerbook: 'height', h: Math.ceil(b.getBoundingClientRect().height) }, '*'); } };
  for (const book of document.querySelectorAll('[data-billerbook]')) {
    const slides = [...book.querySelectorAll('.bb-spread')];
    const count = book.querySelector('.bb-count');
    const prev = book.querySelector('.bb-prev'), next = book.querySelector('.bb-next');
    let views = [], v = 0;
    const build = () => {
      views = [];
      slides.forEach((s, k) => {
        if (narrow.matches && !s.classList.contains('single')) { views.push([k, 'l']); views.push([k, 'r']); }
        else views.push([k, null]);
      });
    };
    const show = (n, dir = 0) => {
      v = Math.max(0, Math.min(views.length - 1, n));
      const [k, side] = views[v];
      slides.forEach((s, j) => { s.hidden = j !== k; s.classList.toggle('bb-l', j === k && side === 'l'); s.classList.toggle('bb-r', j === k && side === 'r'); });
      const s = slides[k], cap = s.querySelector('figcaption'), lab = s.dataset.label || cap.textContent;
      cap.textContent = side ? (lab.split('–')[side === 'l' ? 0 : 1] || lab) : lab;
      s.style.setProperty('--bb-dir', dir * 24 + 'px');
      count.textContent = (v + 1) + ' / ' + views.length;
      prev.disabled = v === 0; next.disabled = v === views.length - 1;
      if (history.replaceState) history.replaceState(null, '', '#' + (k + 1));
      const pre = slides[k + 1]?.querySelector('img'); if (pre) pre.loading = 'eager';
      requestAnimationFrame(report);
    };
    const toSpread = (k) => views.findIndex(([j]) => j === k);
    const apply = () => {
      const k = views.length ? views[v][0] : Math.max(0, Math.min(slides.length - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
      document.documentElement.classList.toggle('bb-pages', narrow.matches);
      build(); show(Math.max(0, toSpread(k)));
    };
    prev.onclick = () => show(v - 1, -1); next.onclick = () => show(v + 1, 1);
    const full = book.querySelector('.bb-full');
    full.onclick = () => {
      if (document.fullscreenElement) return document.exitFullscreen();
      if (book.requestFullscreen && document.fullscreenEnabled) return book.requestFullscreen();
      // iPhone Safari has no element full screen: open the book on its own page instead.
      if (parent !== window) window.open(location.href, '_blank', 'noopener');
    };
    book.tabIndex = 0;
    book.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(v + 1, 1); if (e.key === 'ArrowLeft') show(v - 1, -1); });
    let x0 = null, y0 = null;
    book.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
    book.addEventListener('pointerup', (e) => { if (x0 == null) return; const d = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(d) > 50 && Math.abs(d) > Math.abs(dy)) show(v + (d < 0 ? 1 : -1), d < 0 ? 1 : -1); });
    narrow.addEventListener('change', apply);
    addEventListener('resize', report);
    book.querySelectorAll('img').forEach((im) => im.addEventListener('load', report));
    apply();
  }
})();
`;
