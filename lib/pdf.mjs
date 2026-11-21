// Streaming PDF writer + print export. Pages are written one by one, so a 500-page
// book never has to sit in memory. Images are cropped and resampled to the target
// resolution with sharp and embedded as JPEG (RGB or CMYK).

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Font, FontNames, Encodings } from '@pdf-lib/standard-fonts';
import { PT_PER_MM, placement, bleedExtend, intersect, coverSpec, hexToRgb, luminance } from '../public/lib/geometry.js';
import { buildFrames, pageOwner, coverFrames, pageNumberFor } from '../public/lib/layouts.js';

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
  finish({ title = 'Photo book', icc = null, iccName = 'CMYK' } = {}) {
    this.obj(this.pagesId, `<< /Type /Pages /Count ${this.kids.length} /Kids [${this.kids.map((k) => `${k} 0 R`).join(' ')}] >>`);
    const info = this.alloc();
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const date = `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    this.obj(info, `<< /Title ${pdfString(title)} /Creator (Billerbook) /Producer (Billerbook) /CreationDate (${date}) /Trapped /False >>`);
    let oi = '';
    if (icc) {
      const iccId = this.alloc();
      this.stream(iccId, '/N 4', icc);
      oi = ` /OutputIntents [<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier ${pdfString(iccName)} /Info ${pdfString(iccName)} /RegistryName (http://www.color.org) /DestOutputProfile ${iccId} 0 R >>]`;
    }
    this.obj(this.catalogId, `<< /Type /Catalog /Pages ${this.pagesId} 0 R${oi} >>`);
    const xref = this.pos;
    let x = `xref\n0 ${this.next}\n0000000000 65535 f \n`;
    for (let i = 1; i < this.next; i++) x += `${String(this.offsets[i] || 0).padStart(10, '0')} 00000 n \n`;
    this.write(x);
    this.write(`trailer\n<< /Size ${this.next} /Root ${this.catalogId} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    fs.closeSync(this.fd);
  }
}

// ---------- Text (standard 14 fonts, WinAnsi) ----------
const FONTS = {
  sans: { regular: 'Helvetica', bold: 'Helvetica-Bold' },
  serif: { regular: 'Times-Roman', bold: 'Times-Bold' },
};
const metrics = {};
const fontMetrics = (name) => (metrics[name] ||= Font.load(name));
const enc = Encodings.WinAnsi;

function encodeGlyphs(str) {
  const out = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    out.push(enc.canEncodeUnicodeCodePoint(cp) ? enc.encodeUnicodeCodePoint(cp) : { code: 63, name: 'question' });
  }
  return out;
}
function textWidth(str, font, size) {
  const m = fontMetrics(font);
  return encodeGlyphs(str).reduce((w, g) => w + (m.getWidthOfGlyph(g.name) || 500), 0) * size / 1000;
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

export const ROLE_STYLE = {
  title: { size: 26, weight: 'bold', align: 'center' },
  body: { size: 11, weight: 'regular', align: 'left' },
  caption: { size: 9, weight: 'regular', align: 'left' },
  spine: { size: 11, weight: 'bold', align: 'center' },
  back: { size: 9, weight: 'regular', align: 'left' },
};

function wrapLines(text, font, size, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const cand = line ? `${line} ${word}` : word;
      if (textWidth(cand, font, size) <= maxW || !line) line = cand;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

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
    jobs.push(renderImage(it.file, src, tw, th, opts).then((jpg) => ({ jpg, tw, th, vis })));
  }
  const imgs = await Promise.all(jobs);
  for (const { jpg, tw, th, vis } of imgs) {
    const id = writer.image(jpg, tw, th, opts.cmyk);
    const name = `Im${ctx.n++}`;
    ctx.images[name] = id;
    const x = (vis.x - win.x) * PT_PER_MM, y = (mediaH - (vis.y - win.y) - vis.h) * PT_PER_MM;
    ops.push(`q ${(vis.w * PT_PER_MM).toFixed(3)} 0 0 ${(vis.h * PT_PER_MM).toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /${name} Do Q`);
  }
  // Text
  for (const f of frames) {
    if (f.kind !== 'text') continue;
    const value = texts[f.text]?.value;
    if (!value || !String(value).trim()) continue;
    if (f.x < win.x - 0.01 || f.x >= win.x + win.w) continue; // text belongs to the page it starts on
    const st = ROLE_STYLE[f.role] || ROLE_STYLE.body;
    const font = FONTS[opts.font]?.[st.weight] || FONTS.sans[st.weight];
    ctx.fonts[font] = writer.font(font);
    const fname = `F${Object.keys(ctx.fonts).indexOf(font)}`;
    ctx.fontNames[font] = fname;
    const color = texts[f.text]?.color || opts.textColor;
    if (f.role === 'spine') {
      const size = Math.min(st.size, f.w * PT_PER_MM * 0.6);
      const w = textWidth(value, font, size) / PT_PER_MM;
      const cx = f.x + f.w / 2 - win.x, cy = f.y + f.h / 2 - win.y;
      // Rotated 90° clockwise, reads top to bottom (DIN spine direction).
      // Glyphs grow towards +x in this rotation: shift the baseline left by half the cap height.
      const x = (cx - (size / PT_PER_MM) * 0.36) * PT_PER_MM, y = (mediaH - cy + w / 2) * PT_PER_MM;
      ops.push(`BT ${colorOps(color, opts.cmyk)} /${fname} ${size.toFixed(2)} Tf 0 -1 1 0 ${x.toFixed(3)} ${y.toFixed(3)} Tm ${pdfBytes(value)} Tj ET`);
      continue;
    }
    const size = texts[f.text]?.size || st.size;
    const align = texts[f.text]?.align || st.align;
    const lh = size * 1.3;
    const maxW = f.w * PT_PER_MM;
    const lines = wrapLines(value, font, size, maxW);
    let y = (mediaH - (f.y - win.y)) * PT_PER_MM - size;
    for (const line of lines) {
      const lw = textWidth(line, font, size);
      const dx = align === 'center' ? (maxW - lw) / 2 : align === 'right' ? maxW - lw : 0;
      const x = (f.x - win.x) * PT_PER_MM + dx;
      ops.push(`BT ${colorOps(color, opts.cmyk)} /${fname} ${size.toFixed(2)} Tf ${x.toFixed(3)} ${y.toFixed(3)} Td ${pdfBytes(line)} Tj ET`);
      y -= lh;
    }
  }
  return ops;
}

function fontsResource(ctx) {
  const out = {};
  for (const [font, name] of Object.entries(ctx.fontNames)) out[name] = ctx.fonts[font];
  return out;
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

export async function exportInterior({ ed, pool, file, preview = false, onProgress = () => {}, title }) {
  const opts = exportOptions(ed, { preview });
  const writer = new PdfWriter(file);
  const W = ed.w, H = ed.h, b = ed.bleed ?? 3;
  const mediaW = W + 2 * b, mediaH = H + 2 * b;
  const aspectOf = (k) => { const it = pool.get(k); return it?.w ? it.w / it.h : null; };
  const frameCache = new Map();
  for (let i = 0; i < ed.pages.length; i++) {
    const own = pageOwner(ed, i);
    const owner = ed.pages[own.owner];
    if (!frameCache.has(own.owner)) frameCache.set(own.owner, buildFrames(ed, own.owner, aspectOf));
    const frames = frameCache.get(own.owner);
    const win = { x: own.offsetX - b, y: -b, w: mediaW, h: mediaH };
    const ctx = { n: 0, images: {}, fonts: {}, fontNames: {} };
    const bg = owner.bg || ed.bg || '#ffffff';
    const textColor = luminance(bg) < 0.45 ? '#ffffff' : '#000000';
    let content = '';
    if (bg.toLowerCase() !== '#ffffff') content += `q ${colorOps(bg, opts.cmyk)} 0 0 ${(mediaW * PT_PER_MM).toFixed(3)} ${(mediaH * PT_PER_MM).toFixed(3)} re f Q\n`;
    const ops = await drawFrames({
      frames, slots: owner.slots, texts: owner.texts, pool, win, H, bleed: b, mediaH, opts: { ...opts, textColor }, writer, ctx,
      ownerW: own.spread ? 2 * W : W, ownerH: H,
    });
    content += ops.join('\n');
    const pn = pageNumberFor(ed, i);
    if (pn) {
      const font = FONTS[opts.font]?.regular || 'Helvetica';
      ctx.fonts[font] = writer.font(font);
      const fname = ctx.fontNames[font] || `F${Object.keys(ctx.fonts).indexOf(font)}`;
      ctx.fontNames[font] = fname;
      const size = 8, tw = textWidth(pn.text, font, size) / PT_PER_MM;
      const x = (pn.x - win.x - (pn.align === 'right' ? tw : pn.align === 'center' ? tw / 2 : 0)) * PT_PER_MM;
      const y = (mediaH - (pn.y - win.y)) * PT_PER_MM;
      content += `\nBT ${colorOps(textColor, opts.cmyk)} /${fname} ${size} Tf ${x.toFixed(3)} ${y.toFixed(3)} Td ${pdfBytes(pn.text)} Tj ET`;
    }
    writer.page({
      wPt: mediaW * PT_PER_MM, hPt: mediaH * PT_PER_MM,
      trim: [b * PT_PER_MM, b * PT_PER_MM, (b + W) * PT_PER_MM, (b + H) * PT_PER_MM],
      content, images: ctx.images, fonts: fontsResource(ctx),
    });
    onProgress(i + 1, ed.pages.length);
  }
  writer.finish({ title, icc: opts.icc ? fs.readFileSync(opts.icc) : null, iccName: opts.icc ? path.basename(opts.icc, path.extname(opts.icc)) : '' });
  return { file, pages: ed.pages.length, size: `${mediaW} × ${mediaH} mm`, colorMode: opts.cmyk ? 'CMYK' : 'RGB', icc: opts.icc };
}

export async function exportCover({ ed, pool, file, preview = false, title }) {
  const opts = exportOptions(ed, { preview });
  const aspectOf = (k) => { const it = pool.get(k); return it?.w ? it.w / it.h : null; };
  const { cs, frames } = coverFrames(ed, aspectOf);
  const writer = new PdfWriter(file);
  const ctx = { n: 0, images: {}, fonts: {}, fontNames: {} };
  const cd = ed.coverDesign || {};
  const bg = cd.bg || '#ffffff';
  const textColor = luminance(bg) < 0.45 ? '#ffffff' : '#000000';
  let content = '';
  if (bg.toLowerCase() !== '#ffffff') content += `q ${colorOps(bg, opts.cmyk)} 0 0 ${(cs.W * PT_PER_MM).toFixed(3)} ${(cs.H * PT_PER_MM).toFixed(3)} re f Q\n`;
  const ops = await drawFrames({
    frames, slots: cd.slots || [], texts: cd.texts || [], pool, win: { x: 0, y: 0, w: cs.W, h: cs.H }, H: cs.H, bleed: 0, mediaH: cs.H,
    opts: { ...opts, textColor }, writer, ctx, ownerW: cs.W, ownerH: cs.H, extendBleed: false,
  });
  content += ops.join('\n');
  const v = cs.visible;
  writer.page({
    wPt: cs.W * PT_PER_MM, hPt: cs.H * PT_PER_MM,
    trim: [v.x * PT_PER_MM, v.y * PT_PER_MM, (v.x + v.w) * PT_PER_MM, (v.y + v.h) * PT_PER_MM],
    content, images: ctx.images, fonts: fontsResource(ctx),
  });
  writer.finish({ title, icc: opts.icc ? fs.readFileSync(opts.icc) : null, iccName: opts.icc ? path.basename(opts.icc, path.extname(opts.icc)) : '' });
  return { file, size: `${cs.W.toFixed(1)} × ${cs.H.toFixed(1)} mm`, spine: ed.spine, colorMode: opts.cmyk ? 'CMYK' : 'RGB' };
}
