// Renders pages, spreads and the cover as images. Used for the MCP previews (an AI looks at its
// own layout), for JPEG/PNG export, for the EPUB and for soft-proofed views. Draws the same
// things as the PDF writer: photos with tone, background graphics and photos, text with the
// real fonts, page numbers and the barcode.

import sharp from 'sharp';
import { placement, intersect, spreadsOf, luminance } from '../public/lib/geometry.js';
import { buildFrames, pageOwner, coverFrames, pageNumberFor } from '../public/lib/layouts.js';
import { resolveStyle } from '../public/lib/text.js';
import { pageGraphic } from '../public/lib/graphics.js';
import { thumbnail } from './store.mjs';
import { textFrameCommands, svgPath, layoutText, linePath } from './fonts.mjs';
import { applyTone, renderGraphic, softProof, proofProfile } from './imagefx.mjs';

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// Source pixels for a photo: the original file for exports, a thumbnail for quick previews.
async function sourceOf(project, it, quality) {
  if (quality === 'original' && it.file) {
    return { input: it.file, w: it.w, h: it.h, rotate: true };
  }
  const tf = await thumbnail(project, it, quality === 'original' ? 2400 : 1200);
  if (!tf) return null;
  const m = await sharp(tf).metadata();
  return { input: tf, w: m.width, h: m.height, rotate: false };
}

async function photoLayer({ project, it, slot, frame, clip, k, quality, opacity = null, under = '#ffffff' }) {
  const src = await sourceOf(project, it, quality);
  if (!src) return null;
  const pl = placement(frame.w, frame.h, src.w, src.h, slot, it.focal);
  const drawn = { x: frame.x + pl.dx, y: frame.y + pl.dy, w: pl.dw, h: pl.dh };
  const vis = intersect(drawn, clip);
  if (!vis) return null;
  const sx = pl.sx + (vis.x - drawn.x) / pl.s, sy = pl.sy + (vis.y - drawn.y) / pl.s;
  const ext = { left: Math.max(0, Math.floor(sx)), top: Math.max(0, Math.floor(sy)), width: Math.max(1, Math.round(vis.w / pl.s)), height: Math.max(1, Math.round(vis.h / pl.s)) };
  ext.width = Math.min(ext.width, src.w - ext.left); ext.height = Math.min(ext.height, src.h - ext.top);
  const tw = Math.max(1, Math.round(vis.w * k)), th = Math.max(1, Math.round(vis.h * k));
  let s = sharp(src.input, { failOn: 'none', limitInputPixels: false });
  if (src.rotate) s = s.rotate();
  s = s.extract(ext).resize(tw, th, { fit: 'fill' });
  if (slot?.tone) s = applyTone(s, slot.tone, slot.toneStrength);
  let buf = await s.toColourspace('srgb').png().toBuffer();
  if (opacity != null && opacity < 1) {
    const rgba = await sharp(buf).removeAlpha().ensureAlpha(Math.max(0, Math.min(1, opacity))).png().toBuffer();
    buf = await sharp(rgba).flatten({ background: under }).png().toBuffer();
  }
  return { input: buf, left: Math.round(vis.x * k), top: Math.round(vis.y * k) };
}

// Draws one owner page (or spread) onto the canvas. x0: where the owner's left edge sits on the canvas (mm).
async function drawOwner({ project, ed, pool, ownerIndex, x0, clip, k, quality, layers, svg, placeholders }) {
  const p = ed.pages[ownerIndex];
  const own = pageOwner(ed, ownerIndex);
  const W = own.spread ? 2 * ed.w : ed.w, H = ed.h;
  const bg = p.bg || ed.bg || '#ffffff';
  svg.bg.push(`<rect x="${(x0 * k).toFixed(1)}" y="0" width="${(W * k).toFixed(1)}" height="${(H * k).toFixed(1)}" fill="${esc(bg)}"/>`);
  const gfx = pageGraphic(ed, p);
  if (gfx) {
    const buf = await sharp(await renderGraphic(gfx, W, H, { ppi: k * 25.4, bg, inset: ed.safety ?? 8 })).resize(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)), { fit: 'fill' }).png().toBuffer();
    const vis = intersect({ x: x0, y: 0, w: W, h: H }, clip);
    if (vis) {
      const m = await sharp(buf).metadata();
      const left = Math.max(0, Math.round((vis.x - x0) * k)), width = Math.min(m.width - left, Math.round(vis.w * k));
      const top = 0, height = Math.min(m.height, Math.round(clip.h * k));
      layers.push({ input: await sharp(buf).extract({ left, top, width: Math.max(1, width), height }).png().toBuffer(), left: Math.round(vis.x * k), top: 0 });
    }
  }
  const aspectOf = (key) => { const it = pool.get(key); return it?.w ? it.w / it.h : null; };
  if (p.bgPhoto?.key && pool.get(p.bgPhoto.key)) {
    const l = await photoLayer({ project, it: pool.get(p.bgPhoto.key), slot: { tone: p.bgPhoto.tone }, frame: { x: x0, y: 0, w: W, h: H }, clip, k, quality, opacity: p.bgPhoto.opacity ?? 0.35, under: bg });
    if (l) layers.push(l);
  }
  const textColor = luminance(bg) < 0.45 ? '#ffffff' : '#1a1a1a';
  for (const f of buildFrames(ed, ownerIndex, aspectOf)) {
    const fr = { ...f, x: f.x + x0 };
    if (!intersect(fr, clip)) continue;
    if (f.kind === 'text') {
      const tx = p.texts?.[f.text];
      if (tx?.value?.trim()) {
        const st = resolveStyle(ed, f.role || 'body', tx);
        const { cmds } = textFrameCommands(project, st, tx.value, fr, { rotate: f.role === 'spine' });
        svg.fg.push(`<path d="${svgPath(cmds, k)}" fill="${esc(st.color || textColor)}"/>`);
      } else if (placeholders) svg.fg.push(`<rect x="${fr.x * k}" y="${fr.y * k}" width="${fr.w * k}" height="${fr.h * k}" fill="none" stroke="#bbb" stroke-dasharray="6 4"/>`);
      continue;
    }
    const slot = p.slots?.[f.slot];
    const it = slot && pool.get(slot.key);
    if (!it) {
      if (placeholders) {
        svg.fg.push(`<rect x="${fr.x * k}" y="${fr.y * k}" width="${fr.w * k}" height="${fr.h * k}" fill="#e6e6e6" stroke="#bbb"/>`);
        svg.fg.push(`<text x="${(fr.x + fr.w / 2) * k}" y="${(fr.y + fr.h / 2) * k}" font-size="${6 * k}" text-anchor="middle" fill="#999" font-family="Helvetica">${f.slot + 1}</text>`);
      }
      continue;
    }
    const l = await photoLayer({ project, it, slot, frame: fr, clip, k, quality });
    if (l) layers.push(l);
  }
}

function pageNumberSvg(project, ed, i, x0, k, bg) {
  const pn = pageNumberFor(ed, i);
  if (!pn) return '';
  const st = resolveStyle(ed, 'caption', { size: 8, italic: false, caps: false, tracking: 0, ...(ed.textStyles?.pagenum || {}) });
  const L = layoutText(project, st, pn.text, { x: 0, y: 0, w: 1000, h: 100 });
  const ln = L.lines[0];
  const x = x0 + pn.x - (pn.align === 'right' ? ln.w : pn.align === 'center' ? ln.w / 2 : 0);
  const cmds = linePath(L.chain, { ...ln, x, y: pn.y }, L.sizeMm, st.tracking);
  return `<path d="${svgPath(cmds, k)}" fill="${st.color || (luminance(bg) < 0.45 ? '#ffffff' : '#333333')}"/>`;
}

// pages: array of page indexes to show side by side (null = empty half).
async function renderPages(project, ed, pool, pages, { width = 1600, quality = 'thumb', proof = null, format = 'jpeg', placeholders = true, gutterLine = true } = {}) {
  const W = ed.w, H = ed.h;
  const k = width / (pages.length * W);
  const cw = Math.round(pages.length * W * k), ch = Math.round(H * k);
  const layers = [], svg = { bg: [], fg: [] };
  const done = new Set();
  for (let side = 0; side < pages.length; side++) {
    const i = pages[side];
    if (i == null) { svg.bg.push(`<rect x="${side * W * k}" y="0" width="${W * k}" height="${ch}" fill="#ffffff"/>`); continue; }
    const own = pageOwner(ed, i);
    const clip = { x: side * W, y: 0, w: W, h: H };
    const x0 = side * W - own.offsetX;
    // A spread owner shown on both halves is drawn once with the full clip.
    if (own.spread && pages.includes(own.owner) && pages.includes(own.owner + 1) && pages.length === 2) {
      if (done.has(own.owner)) continue;
      done.add(own.owner);
      await drawOwner({ project, ed, pool, ownerIndex: own.owner, x0: 0, clip: { x: 0, y: 0, w: 2 * W, h: H }, k, quality, layers, svg, placeholders });
      continue;
    }
    await drawOwner({ project, ed, pool, ownerIndex: own.owner, x0, clip, k, quality, layers, svg, placeholders });
    const p = ed.pages[own.owner];
    svg.fg.push(pageNumberSvg(project, ed, i, side * W, k, p.bg || ed.bg || '#ffffff'));
  }
  // Clip: drawOwner paints whole spreads; mask the halves that are not shown.
  if (gutterLine && pages.length === 2) svg.fg.push(`<line x1="${W * k}" y1="0" x2="${W * k}" y2="${ch}" stroke="#00000022" stroke-width="1.5"/>`);
  return compose(cw, ch, layers, svg, { proof, format, ed });
}

export async function renderSpread(project, ed, pool, spreadIndex, width = 1600, opts = {}) {
  const sp = spreadsOf(ed.pages.length)[spreadIndex];
  if (!sp) throw new Error(`spread ${spreadIndex} does not exist`);
  return renderPages(project, ed, pool, [sp[0], sp[1]], { width, ...opts });
}

export async function renderPage(project, ed, pool, pageIndex, width = 1200, opts = {}) {
  if (!ed.pages[pageIndex]) throw new Error(`page ${pageIndex} does not exist`);
  return renderPages(project, ed, pool, [pageIndex], { width, ...opts });
}

export async function renderCover(project, ed, pool, width = 1800, { guides = true, quality = 'thumb', proof = null, format = 'jpeg' } = {}) {
  const aspectOf = (key) => { const it = pool.get(key); return it?.w ? it.w / it.h : null; };
  const { cs, frames } = coverFrames(ed, aspectOf);
  const k = width / cs.W;
  const cw = Math.round(cs.W * k), ch = Math.round(cs.H * k);
  const cd = ed.coverDesign || {};
  const bg = cd.bg || '#ffffff';
  const layers = [], svg = { bg: [`<rect width="${cw}" height="${ch}" fill="${esc(bg)}"/>`], fg: [] };
  const clip = { x: 0, y: 0, w: cs.W, h: cs.H };
  if (cd.bgGraphic?.id) layers.push({ input: await sharp(await renderGraphic(cd.bgGraphic, cs.W, cs.H, { ppi: k * 25.4, bg, inset: cs.bleed + (ed.safety ?? 6) })).resize(cw, ch, { fit: 'fill' }).png().toBuffer(), left: 0, top: 0 });
  const textColor = luminance(bg) < 0.45 ? '#ffffff' : '#1a1a1a';
  for (const f of frames) {
    if (f.kind === 'text') {
      const tx = cd.texts?.[f.text];
      if (tx?.value?.trim()) {
        const st = resolveStyle(ed, f.role || 'body', tx);
        const { cmds } = textFrameCommands(project, st, tx.value, f, { rotate: f.role === 'spine' });
        svg.fg.push(`<path d="${svgPath(cmds, k)}" fill="${esc(st.color || textColor)}"/>`);
      }
      continue;
    }
    const slot = cd.slots?.[f.slot];
    const it = slot && pool.get(slot.key);
    if (!it) { svg.fg.push(`<rect x="${f.x * k}" y="${f.y * k}" width="${f.w * k}" height="${f.h * k}" fill="#e6e6e6" stroke="#bbb"/>`); continue; }
    const l = await photoLayer({ project, it, slot, frame: f, clip, k, quality });
    if (l) layers.push(l);
  }
  const { barcodeInfo } = await import('./pdf.mjs');
  const bc = barcodeInfo(ed, cs);
  if (bc && !bc.error) {
    svg.fg.push(`<rect x="${bc.x * k}" y="${bc.y * k}" width="${bc.width * k}" height="${bc.height * k}" fill="#ffffff"/>`);
    if (bc.mode === 'isbn') {
      for (const b of bc.g.bars) svg.fg.push(`<rect x="${((bc.x + b.x) * k).toFixed(2)}" y="${((bc.y + b.y) * k).toFixed(2)}" width="${(b.w * k).toFixed(2)}" height="${(b.h * k).toFixed(2)}" fill="#000"/>`);
      for (const t of bc.g.texts) {
        const st = { family: 'work-sans', weight: 400, italic: false, size: t.size / (25.4 / 72) / 0.72, leading: 1, tracking: 0, align: 'left', caps: false };
        const L = layoutText(project, st, t.text, { x: 0, y: 0, w: 500, h: 50 });
        const ln = L.lines[0];
        const cmds = linePath(L.chain, { ...ln, x: bc.x + t.x - (t.align === 'center' ? ln.w / 2 : 0), y: bc.y + t.y + t.size }, L.sizeMm, 0);
        svg.fg.push(`<path d="${svgPath(cmds, k)}" fill="#000"/>`);
      }
    } else if (guides) svg.fg.push(`<text x="${(bc.x + bc.width / 2) * k}" y="${(bc.y + bc.height / 2) * k}" font-size="${3 * k}" text-anchor="middle" fill="#999" font-family="Helvetica">barcode</text>`);
  }
  if (guides) {
    const v = cs.visible;
    svg.fg.push(`<rect x="${v.x * k}" y="${v.y * k}" width="${v.w * k}" height="${v.h * k}" fill="none" stroke="#ff3b30" stroke-dasharray="8 6"/>`);
    for (const x of [cs.spine.x, cs.spine.x + cs.spine.w]) svg.fg.push(`<line x1="${x * k}" y1="0" x2="${x * k}" y2="${ch}" stroke="#ff3b3088"/>`);
  }
  return compose(cw, ch, layers, svg, { proof, format, ed });
}

async function compose(cw, ch, layers, svg, { proof = null, format = 'jpeg', ed } = {}) {
  // Rounding can push a layer one pixel past the canvas; sharp refuses that, so trim.
  for (const l of layers) {
    const m = await sharp(l.input).metadata();
    const w = Math.min(m.width, cw - l.left), h = Math.min(m.height, ch - l.top);
    if (w < m.width || h < m.height) l.input = await sharp(l.input).extract({ left: 0, top: 0, width: Math.max(1, w), height: Math.max(1, h) }).png().toBuffer();
  }
  const wrap = (parts) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">${parts.join('')}</svg>`);
  let img = sharp({ create: { width: cw, height: ch, channels: 3, background: '#ffffff' } })
    .composite([{ input: wrap(svg.bg), left: 0, top: 0 }, ...layers, { input: wrap(svg.fg), left: 0, top: 0 }]);
  let buf = await img.jpeg({ quality: 92 }).toBuffer();
  if (proof) buf = await softProof(buf, proof.profile || proofProfile(ed), { gamut: !!proof.gamut });
  if (format === 'png') return sharp(buf).png().toBuffer();
  if (format === 'jpeg-hq') return sharp(buf).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).withIccProfile('srgb').toBuffer();
  return proof ? buf : sharp(buf).jpeg({ quality: 82 }).toBuffer();
}
