// Streaming PDF writer + print export. Pages are written one by one, so a 500-page
// book never has to sit in memory. Images are cropped and resampled to the target
// resolution with sharp and embedded as JPEG (RGB or CMYK).

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Encodings } from '@pdf-lib/standard-fonts';
import { PT_PER_MM, placement, bleedExtend, intersect, coverSpec, spreadsOf, hexToRgb, luminance } from '../public/lib/geometry.js';
import { buildFrames, pageOwner, coverFrames, pageNumberFor } from '../public/lib/layouts.js';
import { resolveStyle, PT_TO_MM } from '../public/lib/text.js';
import { STRINGS } from '../public/lib/i18n.js';
import { textFrameCommands, pdfPath, layoutText, linePath } from './fonts.mjs';
import { applyTone, renderGraphic } from './imagefx.mjs';
import { pageGraphic } from '../public/lib/graphics.js';
import { barcodeBars, parseIsbn, parseAddon, isbnLabel, defaultBarcodeBox, KDP_BOX } from '../public/lib/barcode.js';

// ---------- Writer ----------
export class PdfWriter {
  constructor(file) {
    this.fd = fs.openSync(file, 'w');
    this.pos = 0; this.offsets = []; this.next = 1; this.kids = []; this.fontIds = {};
    this.write(Buffer.from('%PDF-1.6\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
    this.catalogId = this.alloc(); this.pagesId = this.alloc();
  }
  write(b) { if (typeof b === 'string') b = Buffer.from(b, 'latin1'); fs.writeSync(this.fd, b); this.pos += b.length; }
  alloc() { return this.next++; }
  obj(id, dict) { this.offsets[id] = this.pos; this.write(`${id} 0 obj\n${dict}\nendobj\n`); }
  stream(id, dict, data) {
    this.offsets[id] = this.pos;
    this.write(`${id} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`);
    this.write(data);
    this.write('\nendstream\nendobj\n');
  }
  font(base) {
    if (!this.fontIds[base]) {
      const id = this.alloc();
      this.obj(id, `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
      this.fontIds[base] = id;
    }
    return this.fontIds[base];
  }
  image(jpeg, w, h, cmyk) {
    const id = this.alloc();
    // libvips writes Adobe-style (inverted) CMYK JPEGs.
    const decode = cmyk ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
    this.stream(id, `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /${cmyk ? 'DeviceCMYK' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode${decode}`, jpeg);
    return id;
  }
  page({ wPt, hPt, trim, content, images, fonts }) {
    const cid = this.alloc();
    this.stream(cid, '', Buffer.from(content, 'latin1'));
    const pid = this.alloc();
    const xo = Object.entries(images).map(([n, id]) => `/${n} ${id} 0 R`).join(' ');
    const fo = Object.entries(fonts).map(([n, id]) => `/${n} ${id} 0 R`).join(' ');
    const box = (b) => `[${b.map((v) => v.toFixed(3)).join(' ')}]`;
    this.obj(pid, `<< /Type /Page /Parent ${this.pagesId} 0 R /MediaBox ${box([0, 0, wPt, hPt])} /BleedBox ${box([0, 0, wPt, hPt])} /TrimBox ${box(trim)} /Contents ${cid} 0 R /Resources << /XObject << ${xo} >> /Font << ${fo} >> >> >>`);
    this.kids.push(pid);
  }
  // PDF/X-4 identification: output intent with an ICC profile, GTS_PDFXVersion in Info and XMP,
  // trailer ID, trim and bleed boxes on every page (written by page()). Text is outlined and
  // nothing uses transparency, so there are no font or blending problems to declare.
  finish({ title = 'Photo book', icc = null, iccName = 'CMYK', channels = 4, pdfx = true } = {}) {
    this.obj(this.pagesId, `<< /Type /Pages /Count ${this.kids.length} /Kids [${this.kids.map((k) => `${k} 0 R`).join(' ')}] >>`);
    const info = this.alloc();
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const date = `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}Z`;
    const iso = d.toISOString().replace(/\.\d+Z$/, 'Z');
    const x4 = pdfx && icc;
    this.obj(info, `<< /Title ${pdfString(title)} /Creator (Billerbook) /Producer (Billerbook) /CreationDate (${date}) /ModDate (${date}) /Trapped /False${x4 ? ' /GTS_PDFXVersion (PDF/X-4)' : ''} >>`);
    let oi = '', meta = '';
    if (icc) {
      const iccId = this.alloc();
      this.stream(iccId, `/N ${channels}`, icc);
      oi = ` /OutputIntents [<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier ${pdfString(iccName)} /Info ${pdfString(iccName)} /RegistryName (http://www.color.org) /DestOutputProfile ${iccId} 0 R >>]`;
    }
    if (x4) {
      const xmlEsc = (v) => String(v).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const xmp = `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title><xmp:CreateDate>${iso}</xmp:CreateDate><xmp:ModifyDate>${iso}</xmp:ModifyDate><xmp:MetadataDate>${iso}</xmp:MetadataDate><xmp:CreatorTool>Billerbook</xmp:CreatorTool><pdf:Producer>Billerbook</pdf:Producer><pdf:Trapped>False</pdf:Trapped><pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion><xmpMM:DocumentID>uuid:${crypto.randomUUID()}</xmpMM:DocumentID><xmpMM:InstanceID>uuid:${crypto.randomUUID()}</xmpMM:InstanceID><xmpMM:RenditionClass>default</xmpMM:RenditionClass><xmpMM:VersionID>1</xmpMM:VersionID></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
      const mid = this.alloc();
      this.stream(mid, '/Type /Metadata /Subtype /XML', Buffer.from(xmp, 'utf8'));
      meta = ` /Metadata ${mid} 0 R`;
    }
    this.obj(this.catalogId, `<< /Type /Catalog /Pages ${this.pagesId} 0 R${oi}${meta} >>`);
    this.fileId = crypto.randomBytes(16).toString('hex');
    const xref = this.pos;
    let x = `xref\n0 ${this.next}\n0000000000 65535 f \n`;
    for (let i = 1; i < this.next; i++) x += `${String(this.offsets[i] || 0).padStart(10, '0')} 00000 n \n`;
    this.write(x);
    this.write(`trailer\n<< /Size ${this.next} /Root ${this.catalogId} 0 R /Info ${info} 0 R /ID [<${this.fileId}> <${this.fileId}>] >>\nstartxref\n${xref}\n%%EOF\n`);
    fs.closeSync(this.fd);
  }
}

// ---------- Background graphics as pseudo photos ----------
// Graphics are rendered once per size and colour into a temp file and then drawn like any photo,
// so cropping to the bleed window and colour conversion work the same way.
import os from 'node:os';
import crypto from 'node:crypto';
function graphicPool(pool) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billerbook-gfx-'));
  const extra = new Map();
  const gpool = { get: (k) => extra.get(k) || pool.get(k) };
  async function graphicKey(gfx, w, h, o) {
    const key = 'gfx:' + crypto.createHash('sha1').update(JSON.stringify([gfx, w, h, o])).digest('hex').slice(0, 16);
    if (!extra.has(key)) {
      const buf = await renderGraphic(gfx, w, h, o);
      const file = path.join(dir, `${key.slice(4)}.png`);
      fs.writeFileSync(file, buf);
      const m = await sharp(buf).metadata();
      extra.set(key, { key, file, w: m.width, h: m.height });
    }
    return key;
  }
  return { gpool, graphicKey, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// ---------- Strings in PDF syntax (WinAnsi; used for metadata) ----------
const enc = Encodings.WinAnsi;
function encodeGlyphs(str) {
  const out = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    out.push(enc.canEncodeUnicodeCodePoint(cp) ? enc.encodeUnicodeCodePoint(cp) : { code: 63, name: 'question' });
  }
  return out;
}
function pdfBytes(str) {
  let s = '';
  for (const g of encodeGlyphs(str)) {
    const c = g.code;
    if (c === 40 || c === 41 || c === 92) s += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) s += '\\' + c.toString(8).padStart(3, '0');
    else s += String.fromCharCode(c);
  }
  return `(${s})`;
}
const pdfString = (s) => pdfBytes(String(s));

// ---------- Colours ----------
function colorOps(hex, cmyk, fill = true) {
  const [r, g, b] = hexToRgb(hex);
  if (!cmyk) return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${fill ? 'rg' : 'RG'}`;
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999) return `0 0 0 1 ${fill ? 'k' : 'K'}`; // pure black text
  const c = (1 - r - k) / (1 - k), m = (1 - g - k) / (1 - k), y = (1 - b - k) / (1 - k);
  return `${c.toFixed(3)} ${m.toFixed(3)} ${y.toFixed(3)} ${k.toFixed(3)} ${fill ? 'k' : 'K'}`;
}

// ---------- Image rendering ----------
async function renderImage(file, src, tw, th, opts) {
  let s = sharp(file, { limitInputPixels: false, failOn: 'none' }).rotate()
    .extract({ left: src.x, top: src.y, width: src.w, height: src.h });
  if (tw !== src.w || th !== src.h) s = s.resize(tw, th, { fit: 'fill', kernel: 'lanczos3' });
  if (opts.tone) s = applyTone(s, opts.tone, opts.toneStrength);
  // Background photo with opacity (Lightroom "graphic" page background): blend onto the page colour.
  if (opts.opacity != null && opts.opacity < 1) {
    const buf = await s.removeAlpha().ensureAlpha(Math.max(0, Math.min(1, opts.opacity))).png().toBuffer();
    const [r, g, b] = hexToRgb(opts.under || '#ffffff').map((v) => Math.round(v * 255));
    s = sharp(buf).flatten({ background: { r, g, b } });
  }
  // Output sharpening for print (paper softens detail), like Lightroom's print sharpening.
  if (opts.sharpen === 'low') s = s.sharpen({ sigma: 0.5, m1: 0.5, m2: 1.5 });
  else if (opts.sharpen === 'standard') s = s.sharpen({ sigma: 0.7, m1: 0.8, m2: 2 });
  else if (opts.sharpen === 'high') s = s.sharpen({ sigma: 1, m1: 1, m2: 2.5 });
  if (opts.cmyk) {
    s = s.toColourspace('cmyk');
    s = s.withIccProfile(opts.icc || 'cmyk');
  } else s = s.toColourspace('srgb').withIccProfile('srgb');
  return s.jpeg({ quality: opts.quality, chromaSubsampling: '4:4:4', mozjpeg: false }).toBuffer();
}

// Draw everything that is visible inside `win` (mm, owner coordinates).
async function drawFrames({ frames, slots, texts, pool, win, H, bleed, mediaH, opts, writer, ctx, ownerW, ownerH, extendBleed = true }) {
  const ops = [];
  const jobs = [];
  for (const f of frames) {
    if (f.kind !== 'image') continue;
    const slot = slots[f.slot];
    const it = slot && pool.get(slot.key);
    if (!it?.file || !it.w) continue;
    const base = slot.fit === 'contain' || !extendBleed ? f : bleedExtend(f, ownerW, ownerH, bleed);
    const pl = placement(base.w, base.h, it.w, it.h, slot, it.focal);
    const drawn = { x: base.x + pl.dx, y: base.y + pl.dy, w: pl.dw, h: pl.dh };
    const vis = intersect(drawn, win);
    if (!vis) continue;
    const sx = pl.sx + (vis.x - drawn.x) / pl.s, sy = pl.sy + (vis.y - drawn.y) / pl.s;
    const src = { x: Math.max(0, Math.floor(sx)), y: Math.max(0, Math.floor(sy)), w: Math.round(vis.w / pl.s), h: Math.round(vis.h / pl.s) };
    src.w = Math.max(1, Math.min(src.w, it.w - src.x)); src.h = Math.max(1, Math.min(src.h, it.h - src.y));
    const tw = Math.max(1, Math.min(src.w, Math.round((vis.w / 25.4) * opts.ppi)));
    const th = Math.max(1, Math.round((tw * src.h) / src.w));
    const o = { ...opts, tone: slot.tone || null, toneStrength: slot.toneStrength };
    if (slot.opacity != null) Object.assign(o, { opacity: slot.opacity, under: slot.under });
    jobs.push(renderImage(it.file, src, tw, th, o).then((jpg) => ({ jpg, tw, th, vis })));
  }
  const imgs = await Promise.all(jobs);
  for (const { jpg, tw, th, vis } of imgs) {
    const id = writer.image(jpg, tw, th, opts.cmyk);
    const name = `Im${ctx.n++}`;
    ctx.images[name] = id;
    const x = (vis.x - win.x) * PT_PER_MM, y = (mediaH - (vis.y - win.y) - vis.h) * PT_PER_MM;
    ops.push(`q ${(vis.w * PT_PER_MM).toFixed(3)} 0 0 ${(vis.h * PT_PER_MM).toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /${name} Do Q`);
  }
  // Text, written as glyph outlines (any font prints exactly as set, nothing to embed).
  for (const f of frames) {
    if (f.kind !== 'text') continue;
    const tx = texts?.[f.text] || {};
    const value = tx.value;
    if (!value || !String(value).trim()) continue;
    if (f.x < win.x - 0.01 || f.x >= win.x + win.w) continue; // text belongs to the page it starts on
    const st = resolveStyle(opts.ed, f.role || 'body', tx);
    const color = st.color || opts.textColor;
    const frame = { x: f.x - win.x, y: f.y - win.y, w: f.w, h: f.h };
    const { cmds } = textFrameCommands(opts.project, st, value, frame, { rotate: f.role === 'spine' });
    const path = pdfPath(cmds, (x, y) => [x * PT_PER_MM, (mediaH - y) * PT_PER_MM]);
    if (path) ops.push(`q ${colorOps(color, opts.cmyk)} ${path} Q`);
  }
  return ops;
}

function fontsResource(ctx) {
  const out = {};
  for (const [font, name] of Object.entries(ctx.fontNames)) out[name] = ctx.fonts[font];
  return out;
}

// ICC bytes for the output intent: the edition's profile, otherwise libvips' built-in CMYK or sRGB.
const iccCache = {};
async function intentProfile(opts) {
  if (opts.icc) return { icc: fs.readFileSync(opts.icc), name: path.basename(opts.icc, path.extname(opts.icc)), channels: 4 };
  const key = opts.cmyk ? 'cmyk' : 'srgb';
  if (!iccCache[key]) {
    const probe = sharp({ create: { width: 1, height: 1, channels: 3, background: '#808080' } });
    const buf = await (opts.cmyk ? probe.toColourspace('cmyk').withIccProfile('cmyk') : probe.withIccProfile('srgb')).jpeg().toBuffer();
    iccCache[key] = (await sharp(buf).metadata()).icc;
  }
  return { icc: iccCache[key], name: opts.cmyk ? 'Generic CMYK (libvips)' : 'sRGB IEC61966-2.1', channels: opts.cmyk ? 4 : 3 };
}

export function exportOptions(ed, { preview = false } = {}) {
  const cmyk = !preview && ed.colorMode === 'cmyk';
  let icc = null;
  if (cmyk && ed.icc && fs.existsSync(ed.icc)) icc = ed.icc;
  return {
    ppi: preview ? 110 : Number(ed.ppi) || 300,
    quality: preview ? 78 : 92,
    cmyk, icc, font: ed.font || 'sans', sharpen: preview ? 'none' : (ed.sharpen || 'standard'),
  };
}

export async function exportInterior({ ed, pool, file, preview = false, onProgress = () => {}, title, project = null, proof = null, screen = false }) {
  const opts = exportOptions(ed, { preview: preview || screen });
  const { gpool, graphicKey, cleanup } = graphicPool(pool);
  const writer = new PdfWriter(file);
  const W = ed.w, H = ed.h, b = screen ? 0 : (ed.bleed ?? 3);
  const spreads = screen ? true : ed.interior === 'spreads';
  const mediaW = spreads ? 2 * W + 2 * b : W + 2 * b, mediaH = H + 2 * b;
  const aspectOf = (k) => { const it = pool.get(k); return it?.w ? it.w / it.h : null; };
  const frameCache = new Map();
  const PT = PT_PER_MM;

  // Draws book page i into the window `win` (owner coordinates), shifted dx mm to the right on the PDF page.
  async function half(i, win, dx, fillW, ctx) {
    const own = pageOwner(ed, i);
    const owner = ed.pages[own.owner];
    if (!frameCache.has(own.owner)) frameCache.set(own.owner, buildFrames(ed, own.owner, aspectOf));
    const frames = frameCache.get(own.owner);
    const bg = owner.bg || ed.bg || '#ffffff';
    const textColor = luminance(bg) < 0.45 ? '#ffffff' : '#000000';
    let content = '';
    if (bg.toLowerCase() !== '#ffffff') content += `q ${colorOps(bg, opts.cmyk)} 0 0 ${(fillW * PT).toFixed(3)} ${(mediaH * PT).toFixed(3)} re f Q\n`;
    const ownerW = own.spread ? 2 * W : W;
    let allFrames = frames, allSlots = owner.slots;
    const under = [];
    const gfx = pageGraphic(ed, owner);
    if (gfx) {
      const key = await graphicKey(gfx, ownerW, H, { bg, inset: ed.safety ?? 8, bleed: b, ppi: Math.min(opts.ppi, 300) });
      under.push({ key, opacity: 1 });
    }
    if (owner.bgPhoto?.key) under.push({ key: owner.bgPhoto.key, opacity: owner.bgPhoto.opacity ?? 0.35, under: bg, tone: owner.bgPhoto.tone });
    if (under.length) {
      allSlots = [...owner.slots, ...under];
      allFrames = [...under.map((u, n) => ({ kind: 'image', x: 0, y: 0, w: ownerW, h: H, slot: owner.slots.length + n })), ...frames];
    }
    const ops = await drawFrames({
      frames: allFrames, slots: allSlots, texts: owner.texts, pool: gpool, win, H, bleed: b, mediaH, opts: { ...opts, textColor, ed, project }, writer, ctx,
      ownerW, ownerH: H,
    });
    content += ops.join('\n');
    const pn = pageNumberFor(ed, i);
    if (pn) {
      const st = resolveStyle(ed, 'caption', { size: 8, italic: false, caps: false, tracking: 0, ...(ed.textStyles?.pagenum || {}) });
      const L = layoutText(project, st, pn.text, { x: 0, y: 0, w: 1000, h: 100 });
      const ln = L.lines[0];
      const sizeMm = L.sizeMm;
      const x0 = pn.x - win.x - (pn.align === 'right' ? ln.w : pn.align === 'center' ? ln.w / 2 : 0);
      const cmds = linePath(L.chain, { ...ln, x: x0, y: pn.y - win.y }, sizeMm, st.tracking);
      content += `\nq ${colorOps(st.color || textColor, opts.cmyk)} ${pdfPath(cmds, (x, y) => [x * PT, (mediaH - y) * PT])} Q`;
    }
    if (proof) content += proofOverlay({ ed, i, own, win, frames, mediaH, proof, project });
    return dx ? `q 1 0 0 1 ${(dx * PT).toFixed(3)} 0 cm\n${content}\nQ` : content;
  }

  const finishPage = (content, ctx) => writer.page({
    wPt: mediaW * PT, hPt: mediaH * PT,
    trim: [b * PT, b * PT, (mediaW - b) * PT, (b + H) * PT],
    content, images: ctx.images, fonts: fontsResource(ctx),
  });

  let done = 0, pdfPages = 0;
  if (proof) { proofSummaryPage({ writer, ed, proof, project, mediaW, mediaH, title }); pdfPages++; }
  if (!spreads) {
    for (let i = 0; i < ed.pages.length; i++) {
      const own = pageOwner(ed, i);
      const ctx = { n: 0, images: {}, fonts: {}, fontNames: {} };
      finishPage(await half(i, { x: own.offsetX - b, y: -b, w: mediaW, h: mediaH }, 0, mediaW, ctx), ctx);
      pdfPages++;
      onProgress(++done, ed.pages.length);
    }
  } else {
    // One PDF page per double page: [left, right]. Page 0 is a right page, so the first spread
    // starts with an empty left half (that is what printers like Saal Digital expect).
    for (const [l, r] of spreadsOf(ed.pages.length)) {
      const ctx = { n: 0, images: {}, fonts: {}, fontNames: {} };
      let content = '';
      const ownL = l != null ? pageOwner(ed, l) : null;
      const ownR = r != null ? pageOwner(ed, r) : null;
      if (ownL && ownR && ownL.owner === ownR.owner && ownL.spread) {
        content = await half(l, { x: -b, y: -b, w: mediaW, h: mediaH }, 0, mediaW, ctx);
      } else {
        if (ownL) content += await half(l, { x: ownL.offsetX - b, y: -b, w: W + b, h: mediaH }, 0, W + b, ctx) + '\n';
        if (ownR) content += await half(r, { x: ownR.offsetX, y: -b, w: W + b, h: mediaH }, W + b, W + b, ctx);
      }
      finishPage(content, ctx);
      pdfPages++;
      done += (l != null) + (r != null);
      onProgress(done, ed.pages.length);
    }
  }
  const ip = await intentProfile(opts);
  writer.finish({ title, icc: ip.icc, iccName: ip.name, channels: ip.channels, pdfx: !preview && !screen && !proof });
  cleanup();
  return { file, pages: ed.pages.length, pdfPages, layout: spreads ? 'spreads' : 'single', size: `${mediaW} × ${mediaH} mm`, colorMode: opts.cmyk ? 'CMYK' : 'RGB', icc: opts.icc };
}

export async function exportCover({ ed, pool, file, preview = false, title, project = null }) {
  const opts = exportOptions(ed, { preview });
  const aspectOf = (k) => { const it = pool.get(k); return it?.w ? it.w / it.h : null; };
  const { cs, frames } = coverFrames(ed, aspectOf);
  const { gpool, graphicKey, cleanup } = graphicPool(pool);
  const writer = new PdfWriter(file);
  const ctx = { n: 0, images: {}, fonts: {}, fontNames: {} };
  const cd = ed.coverDesign || {};
  const bg = cd.bg || '#ffffff';
  const textColor = luminance(bg) < 0.45 ? '#ffffff' : '#000000';
  let content = '';
  if (bg.toLowerCase() !== '#ffffff') content += `q ${colorOps(bg, opts.cmyk)} 0 0 ${(cs.W * PT_PER_MM).toFixed(3)} ${(cs.H * PT_PER_MM).toFixed(3)} re f Q\n`;
  let allFrames = frames, allSlots = cd.slots || [];
  if (cd.bgGraphic?.id) {
    const key = await graphicKey(cd.bgGraphic, cs.W, cs.H, { bg, inset: cs.bleed + (ed.safety ?? 6), bleed: 0, ppi: Math.min(opts.ppi, 300) });
    allSlots = [...allSlots, { key }];
    allFrames = [{ kind: 'image', x: 0, y: 0, w: cs.W, h: cs.H, slot: allSlots.length - 1 }, ...frames];
  }
  const ops = await drawFrames({
    frames: allFrames, slots: allSlots, texts: cd.texts || [], pool: gpool, win: { x: 0, y: 0, w: cs.W, h: cs.H }, H: cs.H, bleed: 0, mediaH: cs.H,
    opts: { ...opts, textColor, ed, project }, writer, ctx, ownerW: cs.W, ownerH: cs.H, extendBleed: false,
  });
  content += ops.join('\n');
  content += barcodeOps(ed, cs, opts, project);
  const v = cs.visible;
  let pagesOut = 1;
  if (ed.cover?.mode === 'pages') {
    // Separate cover of a magazine or booklet: four single pages U1 (front), U2, U3 (inside, empty)
    // and U4 (back), each with bleed. The design is the same back + front spread, cut in two.
    const b = cs.bleed, pw = cs.front.w, pageW = pw + 2 * b;
    const cut = (x0) => `q 1 0 0 1 ${(-x0 * PT_PER_MM).toFixed(3)} 0 cm\n${content}\nQ`;
    const trim = [b * PT_PER_MM, b * PT_PER_MM, (b + pw) * PT_PER_MM, (cs.H - b) * PT_PER_MM];
    const one = (c) => writer.page({ wPt: pageW * PT_PER_MM, hPt: cs.H * PT_PER_MM, trim, content: c, images: ctx.images, fonts: fontsResource(ctx) });
    one(cut(cs.front.x - b));
    one('');
    one('');
    one(cut(cs.back.x - b));
    pagesOut = 4;
  } else {
    writer.page({
      wPt: cs.W * PT_PER_MM, hPt: cs.H * PT_PER_MM,
      trim: [v.x * PT_PER_MM, v.y * PT_PER_MM, (v.x + v.w) * PT_PER_MM, (v.y + v.h) * PT_PER_MM],
      content, images: ctx.images, fonts: fontsResource(ctx),
    });
  }
  const ip = await intentProfile(opts);
  writer.finish({ title, icc: ip.icc, iccName: ip.name, channels: ip.channels, pdfx: !preview });
  cleanup();
  const size = pagesOut === 4 ? `4 × ${(cs.front.w + 2 * cs.bleed).toFixed(1)} × ${cs.H.toFixed(1)} mm (U1, U2, U3, U4)` : `${cs.W.toFixed(1)} × ${cs.H.toFixed(1)} mm`;
  return { file, size, spine: Math.round(cs.spineMm * 100) / 100, colorMode: opts.cmyk ? 'CMYK' : 'RGB', barcode: barcodeInfo(ed, cs) };
}

// ---------- Proof PDF: guides and preflight messages ----------
export function warningText(w, lang = 'en') {
  const S = STRINGS[lang] || STRINGS.en;
  let msg = S[`pf.${w.code}`] || STRINGS.en[`pf.${w.code}`] || w.code;
  for (const [k, v] of Object.entries(w.params || {})) msg = msg.replaceAll(`{${k}}`, String(v));
  return msg;
}

function textOps(project, str, x, y, sizePt, color, cmyk, mediaH, { weight = 400, align = 'left' } = {}) {
  const st = { family: 'work-sans', weight, italic: false, size: sizePt, leading: 1.3, tracking: 0, align: 'left', caps: false };
  const L = layoutText(project, st, str, { x: 0, y: 0, w: 2000, h: 100 });
  const ln = L.lines[0];
  if (!ln) return '';
  const x0 = align === 'center' ? x - ln.w / 2 : align === 'right' ? x - ln.w : x;
  const cmds = linePath(L.chain, { ...ln, x: x0, y }, L.sizeMm, 0);
  return `q ${colorOps(color, cmyk)} ${pdfPath(cmds, (px, py) => [px * PT_PER_MM, (mediaH - py) * PT_PER_MM])} Q`;
}

function proofOverlay({ ed, i, own, win, frames, mediaH, proof, project }) {
  const PT = PT_PER_MM, W = ed.w, H = ed.h;
  const X = (x) => ((x - win.x) * PT).toFixed(2), Y = (y) => ((mediaH - (y - win.y)) * PT).toFixed(2);
  const rect = (x, y, w, h) => `${X(x)} ${Y(y + h)} ${(w * PT).toFixed(2)} ${(h * PT).toFixed(2)} re`;
  const ox = own.offsetX;
  let o = '\n';
  // trim (red), safe area (cyan, dashed)
  o += `q 1 0 0 RG 0.5 w ${rect(ox, 0, W, H)} S Q `;
  const sf = ed.safety ?? 5;
  o += `q 0 0.6 0.8 RG 0.5 w [3 2] 0 d ${rect(ox + sf, sf, W - 2 * sf, H - 2 * sf)} S Q `;
  // glue zone on the first and last page (hatched yellow)
  const n = ed.pages.length;
  if (ed.glue && (i === 0 || i === n - 1)) {
    const gx = i === 0 ? ox : ox + W - ed.glue;
    o += `q 0.9 0.7 0 RG 0.4 w ${rect(gx, 0, ed.glue, H)} S`;
    for (let y = 0; y < H; y += 4) o += ` ${X(gx)} ${Y(y)} m ${X(gx + ed.glue)} ${Y(Math.min(H, y + ed.glue))} l`;
    o += ' S Q ';
  }
  // numbered boxes for every message on this page
  (proof.warnings || []).forEach((w, n0) => {
    if (w.page !== own.owner) return;
    const f = frames.find((fr) => (w.slot != null && fr.kind === 'image' && fr.slot === w.slot) || (w.frame != null && fr.kind === 'text' && fr.text === w.frame));
    if (!f || f.x < ox - 0.01 || f.x >= ox + W) return;
    const c = w.level === 'error' ? '0.85 0.1 0.1' : '0.95 0.55 0';
    o += `q ${c} RG 1.2 w ${rect(f.x, f.y, f.w, f.h)} S Q `;
    o += `q ${c} rg ${rect(f.x, f.y, 7, 5)} f Q `;
    o += textOps(project, String(n0 + 1), f.x + 3.5 - win.x, f.y + 3.8 - win.y, 9, '#ffffff', false, mediaH, { weight: 700, align: 'center' });
  });
  // page label in the bleed/slug area
  o += textOps(project, `${i + 1}`, ox + W / 2 - win.x, Math.min(H + 1.5, H + (ed.bleed ?? 3) - 0.6) - win.y, 6, '#ff0000', false, mediaH, { align: 'center' });
  return o;
}

function proofSummaryPage({ writer, ed, proof, project, mediaW, mediaH, title }) {
  const de = proof.lang === 'de';
  const lines = [];
  let y = 18;
  const add = (str, size = 10, weight = 400, color = '#1a1a1a', x = 15) => { lines.push(textOps(project, str, x, y, size, color, false, mediaH, { weight })); y += size * 0.3528 * 1.5; };
  add(de ? 'Prüf-PDF – nicht für den Druck' : 'Proof PDF – not for print', 16, 700);
  add(`${title} · ${ed.w} × ${ed.h} mm · ${ed.pages.length} ${de ? 'Seiten' : 'pages'}`, 9, 400, '#555555');
  y += 3;
  add(de ? 'Rot: Endformat. Blau gestrichelt: Sicherheitsabstand. Gelb schraffiert: Klebezone. Nummern: Meldungen unten.' : 'Red: trim. Blue dashed: safe area. Yellow hatched: glue zone. Numbers: messages below.', 8, 400, '#555555');
  y += 4;
  const ws = proof.warnings || [];
  if (!ws.length) add(de ? 'Keine Meldungen.' : 'No messages.', 10);
  ws.forEach((w, n) => {
    if (y > mediaH - 10) return;
    const where = w.page != null ? `${de ? 'S.' : 'p.'} ${w.page + 1}: ` : '';
    add(`${n + 1}.  ${where}${warningText(w, proof.lang)}`, 8.5, 400, w.level === 'error' ? '#b3261e' : '#8a5a00');
  });
  writer.page({ wPt: mediaW * PT_PER_MM, hPt: mediaH * PT_PER_MM, trim: [0, 0, mediaW * PT_PER_MM, mediaH * PT_PER_MM], content: lines.join('\n'), images: {}, fonts: {} });
}

// ---------- Barcode on the back cover ----------
export function barcodeInfo(ed, cs) {
  const bc = ed.coverDesign?.barcode;
  if (!bc || bc.mode === 'none' || !bc.mode) return null;
  if (bc.mode === 'placeholder') {
    const box = { ...KDP_BOX };
    const pos = bc.x != null ? { x: bc.x, y: bc.y } : defaultBarcodeBox(cs, box, 6.35);
    return { mode: 'placeholder', ...pos, ...box };
  }
  const p = parseIsbn(bc.isbn);
  if (!p.ok) return { mode: 'isbn', error: p.error };
  const g = barcodeBars(p.isbn13, { scale: Number(bc.scale) || 1, addon: parseAddon(bc.addon), label: bc.label === false ? null : isbnLabel(bc.isbn, p.isbn13) });
  const pos = bc.x != null ? { x: bc.x, y: bc.y } : defaultBarcodeBox(cs, g, ed.safety ?? 6);
  return { mode: 'isbn', isbn13: p.isbn13, ...pos, width: g.width, height: g.height, g };
}

function barcodeOps(ed, cs, opts, project) {
  const info = barcodeInfo(ed, cs);
  if (!info || info.error) return '';
  const H = cs.H, PT = PT_PER_MM;
  const rect = (x, y, w, h) => `${(x * PT).toFixed(3)} ${((H - y - h) * PT).toFixed(3)} ${(w * PT).toFixed(3)} ${(h * PT).toFixed(3)} re`;
  let out = `\nq ${colorOps('#ffffff', opts.cmyk)} ${rect(info.x, info.y, info.width, info.height)} f Q`;
  if (info.mode === 'placeholder') return out;
  // Bars in pure K (CMYK) or pure black (RGB): never rich black, never an image.
  out += `\nq ${colorOps('#000000', opts.cmyk)}`;
  for (const b of info.g.bars) out += ` ${rect(info.x + b.x, info.y + b.y, b.w, b.h)}`;
  out += ' f';
  const st = { family: 'work-sans', weight: 400, italic: false, size: 9, leading: 1, tracking: 0, align: 'left', caps: false };
  for (const t of info.g.texts) {
    const sizePt = t.size / PT_TO_MM / 0.72; // digit height → font size (cap height ≈ 72 % of the em)
    const L = layoutText(project, { ...st, size: sizePt }, t.text, { x: 0, y: 0, w: 500, h: 50 });
    const ln = L.lines[0];
    const x = info.x + t.x - (t.align === 'center' ? ln.w / 2 : 0);
    const cmds = linePath(L.chain, { ...ln, x, y: info.y + t.y + t.size }, L.sizeMm, 0);
    out += ` ${pdfPath(cmds, (px, py) => [px * PT, (H - py) * PT])}`;
  }
  return out + ' Q';
}
