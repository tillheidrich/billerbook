// Text layout with real font files (opentype.js). The PDF writer and the previews get glyph
// outlines in millimetres, so text prints exactly as set and no font has to be embedded.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { FAMILIES, findFamily, nearestWeight, familyId, applyCase, PT_TO_MM } from '../public/lib/text.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FONT_DIR = path.join(ROOT, 'fonts');
const cache = new Map();

function load(file) {
  if (!cache.has(file)) {
    let f = null;
    try {
      const b = fs.readFileSync(file);
      f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    } catch { f = null; }
    cache.set(file, f);
  }
  return cache.get(file);
}

// Font chain for a style: the main file plus fallbacks for glyphs it lacks.
export function fontChain(project, st) {
  const fam = findFamily(project, st.family);
  const w = nearestWeight(fam, st.weight);
  const style = st.italic && fam.italic ? 'italic' : 'normal';
  const chain = [];
  if (fam.id.startsWith('custom:')) {
    const cf = (project?.fonts || []).find((f) => `custom:${f.id}` === fam.id);
    const key = `${w}-${style}`;
    const file = cf?.files?.[key] || cf?.files?.[`${w}-normal`] || Object.values(cf?.files || {})[0];
    if (file) chain.push(load(file));
  } else {
    for (const sub of ['latin', 'latin-ext']) chain.push(load(path.join(FONT_DIR, fam.id, `${fam.id}-${sub}-${w}-${style}.woff`)));
  }
  // Last resort for symbols no family has.
  chain.push(load(path.join(FONT_DIR, 'work-sans', `work-sans-latin-ext-400-normal.woff`)));
  chain.push(load(path.join(FONT_DIR, 'work-sans', `work-sans-latin-400-normal.woff`)));
  return chain.filter(Boolean);
}

function glyphFor(chain, ch) {
  for (const f of chain) {
    const g = f.charToGlyph(ch);
    if (g && g.index > 0) return { f, g };
  }
  return { f: chain[0], g: chain[0].charToGlyph('?') };
}

// Width of a string in mm, with kerning and tracking (tracking in 1/1000 em).
function measure(chain, str, sizeMm, tracking) {
  let w = 0, prev = null;
  for (const ch of str) {
    const { f, g } = glyphFor(chain, ch);
    const scale = sizeMm / f.unitsPerEm;
    if (prev && prev.f === f) w += f.getKerningValue(prev.g, g) * scale;
    w += g.advanceWidth * scale + (tracking / 1000) * sizeMm;
    prev = { f, g };
  }
  return str.length ? w - (tracking / 1000) * sizeMm : 0;
}

function wrap(chain, text, sizeMm, tracking, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/ +/)) {
      const cand = line ? `${line} ${word}` : word;
      if (!line || measure(chain, cand, sizeMm, tracking) <= maxW + 0.01) line = cand;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

// Lays out a text frame. Returns lines with their positions and whether the text overflows.
export function layoutText(project, st, value, frame) {
  const chain = fontChain(project, st);
  const sizeMm = st.size * PT_TO_MM;
  const lh = sizeMm * st.leading;
  const text = applyCase(value, st);
  const lines = wrap(chain, text, sizeMm, st.tracking, frame.w);
  const ascent = (chain[0].ascender / chain[0].unitsPerEm) * sizeMm;
  const out = [];
  let y = frame.y + ascent;
  for (const line of lines) {
    const lw = measure(chain, line, sizeMm, st.tracking);
    const dx = st.align === 'center' ? (frame.w - lw) / 2 : st.align === 'right' ? frame.w - lw : 0;
    out.push({ text: line, x: frame.x + dx, y, w: lw });
    y += lh;
  }
  const height = lines.length ? ascent + (lines.length - 1) * lh + sizeMm * 0.25 : 0;
  const widest = Math.max(0, ...out.map((l) => l.w));
  return { chain, sizeMm, lines: out, overflow: height > frame.h + 0.5 || widest > frame.w + 0.5, height };
}

// Glyph outlines of one line as path commands in mm (y down).
export function linePath(chain, line, sizeMm, tracking) {
  const cmds = [];
  let x = line.x, prev = null;
  for (const ch of line.text) {
    const { f, g } = glyphFor(chain, ch);
    const scale = sizeMm / f.unitsPerEm;
    if (prev && prev.f === f) x += f.getKerningValue(prev.g, g) * scale;
    const p = g.getPath(x, line.y, sizeMm);
    cmds.push(...p.commands);
    x += g.advanceWidth * scale + (tracking / 1000) * sizeMm;
    prev = { f, g };
  }
  return cmds;
}

// Path commands → PDF operators. `tf` maps an (x, y) in mm to PDF points.
export function pdfPath(cmds, tf) {
  let s = '', cx = 0, cy = 0;
  const pt = (x, y) => { const [a, b] = tf(x, y); return `${a.toFixed(2)} ${b.toFixed(2)}`; };
  for (const c of cmds) {
    if (c.type === 'M') { s += `${pt(c.x, c.y)} m `; cx = c.x; cy = c.y; }
    else if (c.type === 'L') { s += `${pt(c.x, c.y)} l `; cx = c.x; cy = c.y; }
    else if (c.type === 'C') { s += `${pt(c.x1, c.y1)} ${pt(c.x2, c.y2)} ${pt(c.x, c.y)} c `; cx = c.x; cy = c.y; }
    else if (c.type === 'Q') {
      const x1 = cx + (2 / 3) * (c.x1 - cx), y1 = cy + (2 / 3) * (c.y1 - cy);
      const x2 = c.x + (2 / 3) * (c.x1 - c.x), y2 = c.y + (2 / 3) * (c.y1 - c.y);
      s += `${pt(x1, y1)} ${pt(x2, y2)} ${pt(c.x, c.y)} c `; cx = c.x; cy = c.y;
    } else if (c.type === 'Z') s += 'h ';
  }
  return s ? `${s}f` : '';
}

// Path commands → SVG path data, scaled by k (px per mm).
export function svgPath(cmds, k, tf = (x, y) => [x, y]) {
  let d = '';
  const p = (x, y) => { const [a, b] = tf(x, y); return `${(a * k).toFixed(1)} ${(b * k).toFixed(1)}`; };
  for (const c of cmds) {
    if (c.type === 'M') d += `M${p(c.x, c.y)}`;
    else if (c.type === 'L') d += `L${p(c.x, c.y)}`;
    else if (c.type === 'C') d += `C${p(c.x1, c.y1)} ${p(c.x2, c.y2)} ${p(c.x, c.y)}`;
    else if (c.type === 'Q') d += `Q${p(c.x1, c.y1)} ${p(c.x, c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

// Rotates path points 90° clockwise around (cx, cy) – used for spine text that reads top to bottom.
export const rotateCW = (cx, cy) => (x, y) => [cx - (y - cy), cy + (x - cx)];

// One call for a whole text frame: commands in mm plus layout info.
export function textFrameCommands(project, st, value, frame, { rotate = false } = {}) {
  if (rotate) {
    // Lay out along the frame height, then turn it.
    const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    const virt = { x: cx - frame.h / 2, y: cy - frame.w / 2, w: frame.h, h: frame.w };
    const sizeCap = (frame.w * 0.62) / PT_TO_MM;
    const st2 = { ...st, size: Math.min(st.size, sizeCap), align: 'center' };
    const L = layoutText(project, st2, String(value).replace(/\n/g, ' '), virt);
    // Centre the single line vertically in the virtual frame.
    const capH = st2.size * PT_TO_MM * 0.7;
    const line = L.lines[0] ? { ...L.lines[0], y: cy + capH / 2 } : null;
    const r = rotateCW(cx, cy);
    const cmds = line ? linePath(L.chain, line, L.sizeMm, st2.tracking).map((c) => mapCmd(c, r)) : [];
    return { cmds, overflow: line ? line.w > frame.h + 0.5 : false, layout: L };
  }
  const L = layoutText(project, st, value, frame);
  const cmds = [];
  for (const line of L.lines) cmds.push(...linePath(L.chain, line, L.sizeMm, st.tracking));
  return { cmds, overflow: L.overflow, layout: L };
}

function mapCmd(c, tf) {
  const o = { ...c };
  for (const [kx, ky] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) {
    if (c[kx] != null) { const [a, b] = tf(c[kx], c[ky]); o[kx] = a; o[ky] = b; }
  }
  return o;
}

// Custom fonts: read the family name from a TTF/OTF file.
export function inspectFontFile(file) {
  const b = fs.readFileSync(file);
  const f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const names = f.names || {};
  const pickName = (n) => n?.en || Object.values(n || {})[0] || '';
  const family = pickName(names.preferredFamily) || pickName(names.fontFamily) || path.basename(file, path.extname(file));
  const sub = (pickName(names.preferredSubfamily) || pickName(names.fontSubfamily) || 'Regular').toLowerCase();
  const weight = f.tables.os2?.usWeightClass || (sub.includes('bold') ? 700 : 400);
  const italic = sub.includes('italic') || sub.includes('oblique');
  return { family, weight, italic, glyphs: f.numGlyphs };
}

export const bundledFamilies = () => FAMILIES.map((f) => ({ ...f, id: familyId(f.id) }));
