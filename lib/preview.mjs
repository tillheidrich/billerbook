// Renders a spread (or the cover) as a JPEG from thumbnails. Used by the MCP server so an
// AI can look at its own layout, and for quick shareable previews.

import sharp from 'sharp';
import { placement, intersect, spreadsOf, coverSpec } from '../public/lib/geometry.js';
import { buildFrames, pageOwner, coverFrames } from '../public/lib/layouts.js';
import { thumbnail } from './store.mjs';

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

async function compositeFrames({ project, frames, slots, texts, pool, offX, area, k, layers, svgParts }) {
  for (const f of frames) {
    const fx = f.x - offX, r = intersect({ x: fx, y: f.y, w: f.w, h: f.h }, area);
    if (!r) continue;
    if (f.kind === 'text') {
      const v = texts?.[f.text]?.value;
      if (v) svgParts.push(`<foreignObject x="${fx * k}" y="${f.y * k}" width="${f.w * k}" height="${f.h * k}"><div xmlns="http://www.w3.org/1999/xhtml" style="font:${Math.max(9, 4 * k)}px Helvetica,Arial,sans-serif;color:#222;white-space:pre-wrap">${esc(v)}</div></foreignObject>`);
      else svgParts.push(`<rect x="${fx * k}" y="${f.y * k}" width="${f.w * k}" height="${f.h * k}" fill="none" stroke="#bbb" stroke-dasharray="6 4"/>`);
      continue;
    }
    const slot = slots?.[f.slot];
    const it = slot && pool.get(slot.key);
    if (!it) {
      svgParts.push(`<rect x="${fx * k}" y="${f.y * k}" width="${f.w * k}" height="${f.h * k}" fill="#e6e6e6" stroke="#bbb"/>`);
      svgParts.push(`<text x="${(fx + f.w / 2) * k}" y="${(f.y + f.h / 2) * k}" font-size="${6 * k}" text-anchor="middle" fill="#999" font-family="Helvetica">${f.slot + 1}</text>`);
      continue;
    }
    const tf = await thumbnail(project, it, 1200);
    if (!tf) continue;
    const m = await sharp(tf).metadata();
    const pl = placement(f.w, f.h, m.width, m.height, slot, it.focal);
    const drawn = { x: fx + pl.dx, y: f.y + pl.dy, w: pl.dw, h: pl.dh };
    const vis = intersect(drawn, area);
    if (!vis) continue;
    const sx = pl.sx + (vis.x - drawn.x) / pl.s, sy = pl.sy + (vis.y - drawn.y) / pl.s;
    const ext = {
      left: Math.max(0, Math.floor(sx)), top: Math.max(0, Math.floor(sy)),
      width: Math.max(1, Math.round(vis.w / pl.s)), height: Math.max(1, Math.round(vis.h / pl.s)),
    };
    ext.width = Math.min(ext.width, m.width - ext.left); ext.height = Math.min(ext.height, m.height - ext.top);
    const tw = Math.max(1, Math.round(vis.w * k)), th = Math.max(1, Math.round(vis.h * k));
    const buf = await sharp(tf).extract(ext).resize(tw, th, { fit: 'fill' }).toBuffer();
    layers.push({ input: buf, left: Math.round(vis.x * k), top: Math.round(vis.y * k) });
  }
}

export async function renderSpread(project, ed, pool, spreadIndex, width = 1600) {
  const sp = spreadsOf(ed.pages.length)[spreadIndex];
  if (!sp) throw new Error(`spread ${spreadIndex} does not exist`);
  const W = ed.w, H = ed.h, k = width / (2 * W);
  const cw = Math.round(2 * W * k), ch = Math.round(H * k);
  const layers = [], svg = [];
  const aspectOf = (key) => { const it = pool.get(key); return it?.w ? it.w / it.h : null; };
  for (const [side, i] of [[0, sp[0]], [1, sp[1]]]) {
    if (i == null) { svg.push(`<rect x="${side * W * k}" y="0" width="${W * k}" height="${ch}" fill="#3a3a3a"/>`); continue; }
    const own = pageOwner(ed, i);
    if (own.owner !== i && own.spread) continue; // drawn with its left page
    const p = ed.pages[own.owner];
    const bg = p.bg || ed.bg || '#ffffff';
    const pw = own.spread ? 2 * W : W;
    svg.unshift(`<rect x="${side * W * k}" y="0" width="${pw * k}" height="${ch}" fill="${bg}"/>`);
    const frames = buildFrames(ed, own.owner, aspectOf);
    const offX = -side * W;
    await compositeFrames({ project, frames, slots: p.slots, texts: p.texts, pool, offX, area: { x: side * W, y: 0, w: pw, h: H }, k, layers, svgParts: svg });
  }
  svg.push(`<line x1="${W * k}" y1="0" x2="${W * k}" y2="${ch}" stroke="#00000033" stroke-width="2"/>`);
  return compose(cw, ch, layers, svg);
}

export async function renderCover(project, ed, pool, width = 1800) {
  const aspectOf = (key) => { const it = pool.get(key); return it?.w ? it.w / it.h : null; };
  const { cs, frames } = coverFrames(ed, aspectOf);
  const k = width / cs.W;
  const cw = Math.round(cs.W * k), ch = Math.round(cs.H * k);
  const layers = [], svg = [`<rect width="${cw}" height="${ch}" fill="${ed.coverDesign?.bg || '#ffffff'}"/>`];
  await compositeFrames({ project, frames, slots: ed.coverDesign?.slots, texts: ed.coverDesign?.texts, pool, offX: 0, area: { x: 0, y: 0, w: cs.W, h: cs.H }, k, layers, svgParts: svg });
  const v = cs.visible;
  svg.push(`<rect x="${v.x * k}" y="${v.y * k}" width="${v.w * k}" height="${v.h * k}" fill="none" stroke="#ff3b30" stroke-dasharray="8 6"/>`);
  for (const x of [cs.spine.x, cs.spine.x + cs.spine.w]) svg.push(`<line x1="${x * k}" y1="0" x2="${x * k}" y2="${ch}" stroke="#ff3b3088"/>`);
  return compose(cw, ch, layers, svg);
}

async function compose(cw, ch, layers, svg) {
  const bgSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">${svg.filter((s) => s.startsWith('<rect') && s.includes('fill="#') && !s.includes('stroke')).join('')}</svg>`);
  const fgSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">${svg.filter((s) => !(s.startsWith('<rect') && s.includes('fill="#') && !s.includes('stroke'))).join('')}</svg>`);
  return sharp({ create: { width: cw, height: ch, channels: 3, background: '#ffffff' } })
    .composite([{ input: bgSvg, left: 0, top: 0 }, ...layers, { input: fgSvg, left: 0, top: 0 }])
    .jpeg({ quality: 82 }).toBuffer();
}
