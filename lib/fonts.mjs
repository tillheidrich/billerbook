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
      const b = patchCmap(fs.readFileSync(file));
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
// A font collection (.ttc/.otc, e.g. Helvetica or Avenir Next on a Mac) holds several fonts that
// share tables. fontFromCollection(buffer, i) writes font i as a standalone TTF/OTF buffer.
export function collectionCount(buf) {
  return buf.length > 12 && buf.toString('latin1', 0, 4) === 'ttcf' ? buf.readUInt32BE(8) : 0;
}
export function fontFromCollection(buf, index) {
  const n = collectionCount(buf);
  if (!n || index < 0 || index >= n) throw new Error('not a font in this collection');
  const off = buf.readUInt32BE(12 + 4 * index);
  const numTables = buf.readUInt16BE(off + 4);
  const recs = [];
  for (let i = 0; i < numTables; i++) {
    const r = off + 12 + 16 * i;
    recs.push({ tag: buf.subarray(r, r + 4), sum: buf.readUInt32BE(r + 4), offset: buf.readUInt32BE(r + 8), length: buf.readUInt32BE(r + 12) });
  }
  let pos = 12 + 16 * numTables;
  const parts = [];
  for (const r of recs) {
    if (r.offset + r.length > buf.length) throw new Error('damaged font collection');
    r.newOffset = pos;
    const pad = (4 - (r.length % 4)) % 4;
    parts.push(buf.subarray(r.offset, r.offset + r.length), Buffer.alloc(pad));
    pos += r.length + pad;
  }
  const head = Buffer.alloc(12 + 16 * numTables);
  buf.copy(head, 0, off, off + 12); // sfnt version, numTables, search fields
  recs.forEach((r, i) => {
    const o = 12 + 16 * i;
    r.tag.copy(head, o); head.writeUInt32BE(r.sum, o + 4); head.writeUInt32BE(r.newOffset, o + 8); head.writeUInt32BE(r.length, o + 12);
  });
  return Buffer.concat([head, ...parts]);
}
// Mac system fonts often carry cmap subtables (format 6) the text engine cannot read. Their records
// are pointed at the font's readable Unicode subtable (format 12 or 4); nothing else changes.
export function patchCmap(buf) {
  try {
    if (buf.toString('latin1', 0, 4) === 'ttcf') return buf;
    const n = buf.readUInt16BE(4);
    let cmap = -1;
    for (let i = 0; i < n; i++) { const r = 12 + 16 * i; if (buf.toString('latin1', r, r + 4) === 'cmap') cmap = buf.readUInt32BE(r + 8); }
    if (cmap < 0) return buf;
    const count = buf.readUInt16BE(cmap + 2);
    const recs = [];
    for (let i = 0; i < count; i++) { const r = cmap + 4 + 8 * i; recs.push({ r, off: buf.readUInt32BE(r + 4), fmt: buf.readUInt16BE(cmap + buf.readUInt32BE(r + 4)) }); }
    const good = recs.find((x) => x.fmt === 12) || recs.find((x) => x.fmt === 4);
    const bad = recs.filter((x) => ![0, 4, 12, 14].includes(x.fmt));
    if (!good || !bad.length) return buf;
    const out = Buffer.from(buf);
    for (const b of bad) out.writeUInt32BE(good.off, b.r + 4);
    return out;
  } catch { return buf; }
}
// "file.ttc#2" names font 2 of a collection.
export function readFontBuffer(spec) {
  const m = String(spec).match(/^(.*\.(?:ttc|otc))#(\d+)$/i);
  if (m) return patchCmap(fontFromCollection(fs.readFileSync(m[1]), Number(m[2])));
  return patchCmap(fs.readFileSync(spec));
}

export function inspectFontFile(file) {
  const b = readFontBuffer(file);
  const f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const names = f.names || {};
  const pickName = (n) => n?.en || Object.values(n || {})[0] || '';
  const family = pickName(names.preferredFamily) || pickName(names.fontFamily) || path.basename(file, path.extname(file));
  const sub = (pickName(names.preferredSubfamily) || pickName(names.fontSubfamily) || 'Regular').toLowerCase();
  const weight = f.tables.os2?.usWeightClass || (sub.includes('bold') ? 700 : 400);
  // The style bits (OS/2 fsSelection, head macStyle) are more reliable than the style name.
  let q = {}; try { q = quickFontInfo(b, 0); } catch {}
  const italic = !!q.italic || sub.includes('italic') || sub.includes('oblique') || !!((f.tables.os2?.fsSelection || 0) & 1) || !!((f.tables.head?.macStyle || 0) & 2);
  return { family, weight: q.weight || weight, italic, glyphs: f.numGlyphs };
}

export const bundledFamilies = () => FAMILIES.map((f) => ({ ...f, id: familyId(f.id) }));

// Family, weight and style straight from the name, OS/2 and head tables, without parsing the whole
// font (a Mac has hundreds; listing them must take a moment, not half a minute).
export function quickFontInfo(buf, off = 0) {
  const n = buf.readUInt16BE(off + 4);
  const t = {};
  for (let i = 0; i < n; i++) { const r = off + 12 + 16 * i; t[buf.toString('latin1', r, r + 4)] = buf.readUInt32BE(r + 8); }
  const names = {};
  if (t.name != null) {
    const base = t.name, count = buf.readUInt16BE(base + 2), str = base + buf.readUInt16BE(base + 4);
    for (let i = 0; i < count; i++) {
      const r = base + 6 + 12 * i;
      const pid = buf.readUInt16BE(r), eid = buf.readUInt16BE(r + 2), lang = buf.readUInt16BE(r + 4), id = buf.readUInt16BE(r + 6);
      const len = buf.readUInt16BE(r + 8), o = str + buf.readUInt16BE(r + 10);
      if (![1, 2, 16, 17].includes(id)) continue;
      let v = null;
      if (pid === 3 && (eid === 1 || eid === 0) && (lang === 0x409 || names[id] == null)) v = Buffer.from(buf.subarray(o, o + len)).swap16().toString('utf16le');
      else if (pid === 0 && names[id] == null) v = Buffer.from(buf.subarray(o, o + len)).swap16().toString('utf16le');
      else if (pid === 1 && eid === 0 && names[id] == null) v = buf.toString('latin1', o, o + len);
      if (v != null) names[id] = v;
    }
  }
  const family = names[16] || names[1] || '';
  const sub = (names[17] || names[2] || 'Regular').toLowerCase();
  let weight = t['OS/2'] != null ? buf.readUInt16BE(t['OS/2'] + 4) : 0;
  if (!weight || weight > 1000) weight = /black|heavy/.test(sub) ? 900 : /bold/.test(sub) ? 700 : /light/.test(sub) ? 300 : 400;
  const fsSel = t['OS/2'] != null ? buf.readUInt16BE(t['OS/2'] + 62) : 0;
  const macStyle = t.head != null ? buf.readUInt16BE(t.head + 44) : 0;
  const italic = !!(fsSel & 1) || !!(macStyle & 2) || /italic|oblique/.test(sub);
  const glyphs = t.maxp != null ? buf.readUInt16BE(t.maxp + 4) : 0;
  return { family, weight, italic, glyphs };
}

// Fonts installed on this computer, grouped by family. Collections are listed font by font ("file.ttc#i").
// Fonts that cannot be read, symbol and emoji fonts are left out.
let systemCache = null;
export function systemFontDirs() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (process.platform === 'darwin') return ['/Library/Fonts', path.join(home, 'Library', 'Fonts'), '/System/Library/Fonts', '/System/Library/Fonts/Supplemental'];
  if (process.platform === 'win32') return [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts')];
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.local', 'share', 'fonts'), path.join(home, '.fonts')];
}
export function systemFonts({ refresh = false, dirs = systemFontDirs() } = {}) {
  if (systemCache && !refresh) return systemCache;
  const files = [];
  const walk = (d, lvl) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && lvl < 3) walk(p, lvl + 1);
      else if (/\.(ttf|otf|ttc|otc)$/i.test(e.name)) files.push(p);
    }
  };
  for (const d of dirs) walk(d, 0);
  const fams = new Map();
  const add = (spec, buf, off) => {
    try {
      const info = quickFontInfo(buf, off);
      if (!info.family || /emoji|symbol|braille|lastresort|wingding|webding|dingbat/i.test(info.family) || info.glyphs < 60) return;
      const key = info.family.toLowerCase();
      if (!fams.has(key)) fams.set(key, { family: info.family, styles: [] });
      const fam = fams.get(key);
      if (!fam.styles.some((s) => s.weight === info.weight && s.italic === info.italic)) fam.styles.push({ weight: info.weight, italic: info.italic, path: spec });
    } catch {}
  };
  for (const f of files) {
    let buf;
    try { buf = fs.readFileSync(f); } catch { continue; }
    const n = collectionCount(buf);
    if (n) for (let i = 0; i < Math.min(n, 64); i++) add(`${f}#${i}`, buf, buf.readUInt32BE(12 + 4 * i));
    else add(f, buf, 0);
  }
  systemCache = [...fams.values()].map((f) => ({ ...f, styles: f.styles.sort((a, b) => a.weight - b.weight || a.italic - b.italic) }))
    .sort((a, b) => a.family.localeCompare(b.family));
  return systemCache;
}
