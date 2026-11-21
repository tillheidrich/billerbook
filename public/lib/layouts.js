// Layout library. Every layout is computed from the page format, so the same page
// re-flows when an edition switches from landscape hardcover to portrait softcover.
// Frames: { kind: 'image' | 'text', x, y, w, h, role? } in mm, page origin top-left.

import { coverSpec } from './geometry.js';

const img = (x, y, w, h) => ({ kind: 'image', x, y, w, h });
const txt = (x, y, w, h, role) => ({ kind: 'text', x, y, w, h, role });

function contentBox(c) {
  // Inner margin (gutter side) is wider than the outer margin.
  const left = c.side === 'L' ? c.m : c.mi;
  const right = c.side === 'L' ? c.mi : c.m;
  return { x: left, y: c.m, w: c.W - left - right, h: c.H - 2 * c.m };
}
function grid(b, cols, rows, g) {
  const cw = (b.w - g * (cols - 1)) / cols, rh = (b.h - g * (rows - 1)) / rows;
  const out = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) out.push(img(b.x + q * (cw + g), b.y + r * (rh + g), cw, rh));
  return out;
}
function fit(aspect, b, scale = 1) {
  const a = aspect || 1.5;
  let w = b.w * scale, h = w / a;
  if (h > b.h * scale) { h = b.h * scale; w = h * a; }
  return img(b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
}
const splitCols = (b, fr, g) => {
  const tot = fr.reduce((a, v) => a + v, 0), avail = b.w - g * (fr.length - 1);
  let x = b.x;
  return fr.map((f) => { const w = (avail * f) / tot; const r = { x, y: b.y, w, h: b.h }; x += w + g; return r; });
};
const splitRows = (b, fr, g) => {
  const tot = fr.reduce((a, v) => a + v, 0), avail = b.h - g * (fr.length - 1);
  let y = b.y;
  return fr.map((f) => { const h = (avail * f) / tot; const r = { x: b.x, y, w: b.w, h }; y += h + g; return r; });
};
const asImg = (r) => img(r.x, r.y, r.w, r.h);
const landscape = (c) => c.W >= c.H;

// Justified layout: keeps every photo's aspect ratio, tries all row and column splits.
export function justify(aspects, b, g, variant = 0) {
  const n = aspects.length;
  if (!n) return [];
  const as = aspects.map((a) => a || 1.5);
  const tryDir = (arr, box, transpose) => {
    const all = [];
    const limit = n > 12 ? 0 : 1 << (n - 1);
    const masks = limit ? [...Array(limit).keys()] : [0];
    for (const mask of masks) {
      const rows = [[]];
      arr.forEach((a, i) => { rows[rows.length - 1].push(i); if (i < n - 1 && mask & (1 << i)) rows.push([]); });
      const hs = rows.map((r) => (box.w - g * (r.length - 1)) / r.reduce((s, i) => s + arr[i], 0));
      const sumH = hs.reduce((s, v) => s + v, 0);
      const gapsV = g * (rows.length - 1);
      const k = Math.min(1, (box.h - gapsV) / sumH);
      if (k <= 0) continue;
      const area = rows.reduce((s, r, ri) => s + r.reduce((t, i) => t + (hs[ri] * k) ** 2 * arr[i], 0), 0);
      const minH = Math.min(...hs) * k, maxH = Math.max(...hs) * k;
      const score = area / (box.w * box.h) - 0.08 * (maxH / minH - 1);
      all.push({ score, rows, hs, k });
    }
    return all.map((c) => ({ ...c, transpose, arr, box }));
  };
  const place = (c) => {
    const { rows, hs, k, transpose, arr, box } = c;
    const totalH = hs.reduce((s, v) => s + v * k, 0) + g * (rows.length - 1);
    let y = box.y + (box.h - totalH) / 2;
    const frames = [];
    rows.forEach((r, ri) => {
      const h = hs[ri] * k;
      const rowW = r.reduce((s, i) => s + arr[i] * h, 0) + g * (r.length - 1);
      let x = box.x + (box.w - rowW) / 2;
      r.forEach((i) => { const w = arr[i] * h; frames[i] = img(x, y, w, h); x += w + g; });
      y += h + g;
    });
    if (transpose) for (const f of frames) { [f.x, f.y] = [f.y, f.x]; [f.w, f.h] = [f.h, f.w]; }
    return frames;
  };
  // All row and column splits, best first. `variant` picks an alternative (space bar in the editor).
  const cands = [...tryDir(as, b, false), ...tryDir(as.map((a) => 1 / a), { x: b.y, y: b.x, w: b.h, h: b.w }, true)]
    .filter((c) => c.score > -0.5).sort((x, y) => y.score - x.score);
  if (!cands.length) return [];
  const top = cands.slice(0, Math.min(8, cands.length)).filter((c, i, a) => i === 0 || c.score > a[0].score - 0.35);
  return place(top[((variant % top.length) + top.length) % top.length]);
}
export function justifyVariants(aspects, b, g) {
  let n = 0;
  while (n < 8 && JSON.stringify(justify(aspects, b, g, n + 1)) !== JSON.stringify(justify(aspects, b, g, 0))) n++;
  return n + 1;
}

// group: single | spread | text | auto | custom ; slots: number of image frames ('auto' = variable)
export const LAYOUTS = {
  leer: { group: 'single', slots: 0, build: () => [] },
  voll: { group: 'single', slots: 1, build: (c) => [img(0, 0, c.W, c.H)] },
  passepartout: { group: 'single', slots: 1, build: (c) => [asImg(contentBox(c))] },
  einzeln: { group: 'single', slots: 1, build: (c) => [fit(c.aspects[0], contentBox(c))] },
  galerie: {
    group: 'single', slots: 1,
    build: (c) => { const b = contentBox(c); return [fit(c.aspects[0], { x: b.x, y: b.y - b.h * 0.04, w: b.w, h: b.h }, 0.62)]; },
  },
  'bild-text': {
    group: 'single', slots: 1,
    build: (c) => { const b = contentBox(c); const [a, t] = splitRows(b, [86, 14], c.g); return [asImg(a), txt(t.x, t.y, t.w, t.h, 'caption')]; },
  },
  'halb-text': {
    group: 'single', slots: 1,
    build: (c) => {
      const lw = landscape(c);
      if (lw) {
        const w = c.W * 0.58;
        const outerX = c.side === 'L' ? 0 : c.W - w;
        const tx = c.side === 'L' ? w + c.g * 2 : c.mi;
        return [img(outerX, 0, w, c.H), txt(tx, c.m, c.W - w - c.g * 2 - c.mi, c.H - 2 * c.m, 'body')];
      }
      const h = c.H * 0.6;
      return [img(0, 0, c.W, h), txt(contentBox(c).x, h + c.g * 2, contentBox(c).w, c.H - h - c.g * 2 - c.m, 'body')];
    },
  },
  'zwei-a': {
    group: 'single', slots: 2,
    build: (c) => { const b = contentBox(c); return (landscape(c) ? splitCols(b, [1, 1], c.g) : splitRows(b, [1, 1], c.g)).map(asImg); },
  },
  'zwei-b': {
    group: 'single', slots: 2,
    build: (c) => { const b = contentBox(c); return (landscape(c) ? splitRows(b, [1, 1], c.g) : splitCols(b, [1, 1], c.g)).map(asImg); },
  },
  'zwei-randlos': {
    group: 'single', slots: 2,
    build: (c) => {
      const b = { x: 0, y: 0, w: c.W, h: c.H };
      return (landscape(c) ? splitCols(b, [1, 1], c.g) : splitRows(b, [1, 1], c.g)).map(asImg);
    },
  },
  'drei-gross': {
    group: 'single', slots: 3,
    build: (c) => {
      const b = contentBox(c);
      if (landscape(c)) { const [l, r] = splitCols(b, [2, 1], c.g); return [asImg(l), ...splitRows(r, [1, 1], c.g).map(asImg)]; }
      const [t, u] = splitRows(b, [3, 2], c.g); return [asImg(t), ...splitCols(u, [1, 1], c.g).map(asImg)];
    },
  },
  'drei-reihe': {
    group: 'single', slots: 3,
    build: (c) => { const b = contentBox(c); return (landscape(c) ? splitCols(b, [1, 1, 1], c.g) : splitRows(b, [1, 1, 1], c.g)).map(asImg); },
  },
  'vier-raster': { group: 'single', slots: 4, build: (c) => grid(contentBox(c), 2, 2, c.g) },
  'vier-eins-drei': {
    group: 'single', slots: 4,
    build: (c) => {
      const b = contentBox(c);
      if (landscape(c)) { const [l, r] = splitCols(b, [2, 1], c.g); return [asImg(l), ...splitRows(r, [1, 1, 1], c.g).map(asImg)]; }
      const [t, u] = splitRows(b, [2, 1], c.g); return [asImg(t), ...splitCols(u, [1, 1, 1], c.g).map(asImg)];
    },
  },
  'sechs-raster': { group: 'single', slots: 6, build: (c) => (landscape(c) ? grid(contentBox(c), 3, 2, c.g) : grid(contentBox(c), 2, 3, c.g)) },
  'neun-kontakt': { group: 'single', slots: 9, build: (c) => grid(contentBox(c), 3, 3, c.g) },
  text: {
    group: 'text', slots: 0,
    build: (c) => { const b = contentBox(c); return [txt(b.x, b.y + b.h * 0.3, b.w, b.h * 0.14, 'title'), txt(b.x, b.y + b.h * 0.46, b.w, b.h * 0.4, 'body')]; },
  },
  auto: { group: 'auto', slots: 'auto', build: (c) => justify(c.aspects, contentBox(c), c.g, c.variant) },
  frei: {
    group: 'custom', slots: 'auto',
    build: (c) => (c.custom || []).map((f) => ({ kind: f.kind || 'image', role: f.role, x: f.x * c.W, y: f.y * c.H, w: f.w * c.W, h: f.h * c.H })),
  },

  // Spreads (only on left pages; the right page is taken over).
  'dps-voll': { group: 'spread', slots: 1, build: (c) => [img(0, 0, c.W, c.H)] },
  'dps-streifen': {
    group: 'spread', slots: 1,
    build: (c) => { const h = c.H * 0.56; return [img(0, (c.H - h) / 2, c.W, h)]; },
  },
  'dps-voll-zwei': {
    group: 'spread', slots: 3,
    build: (c) => {
      const pw = c.W / 2;
      const b = { x: pw + c.mi, y: c.m, w: pw - c.mi - c.m, h: c.H - 2 * c.m };
      const parts = pw >= c.H ? splitCols(b, [1, 1], c.g) : splitRows(b, [1, 1], c.g);
      return [img(0, 0, pw, c.H), ...parts.map(asImg)];
    },
  },
  'dps-voll-raster': {
    group: 'spread', slots: 5,
    build: (c) => {
      const pw = c.W / 2;
      return [img(0, 0, pw, c.H), ...grid({ x: pw + c.mi, y: c.m, w: pw - c.mi - c.m, h: c.H - 2 * c.m }, 2, 2, c.g)];
    },
  },
  'dps-auto': {
    group: 'spread', slots: 'auto',
    build: (c) => {
      // Justified per half so no photo runs into the gutter.
      const pw = c.W / 2, half = Math.ceil(c.aspects.length / 2);
      const l = justify(c.aspects.slice(0, half), { x: c.m, y: c.m, w: pw - c.m - c.mi, h: c.H - 2 * c.m }, c.g, c.variant);
      const r = justify(c.aspects.slice(half), { x: pw + c.mi, y: c.m, w: pw - c.mi - c.m, h: c.H - 2 * c.m }, c.g, (c.variant || 0) >> 1);
      return [...l, ...r];
    },
  },
};

export const LAYOUT_ORDER = [
  'auto', 'voll', 'passepartout', 'einzeln', 'galerie', 'bild-text', 'halb-text',
  'zwei-a', 'zwei-b', 'zwei-randlos', 'drei-gross', 'drei-reihe', 'vier-raster', 'vier-eins-drei',
  'sechs-raster', 'neun-kontakt', 'text', 'leer',
  'dps-voll', 'dps-streifen', 'dps-voll-zwei', 'dps-voll-raster', 'dps-auto',
];

export const isSpreadLayout = (id) => LAYOUTS[id]?.group === 'spread' || (id === 'frei-dps');

// Which page owns the frames shown on page i?
export function pageOwner(ed, i) {
  const p = ed.pages[i];
  if (p?.spanned && i > 0 && isSpreadPage(ed.pages[i - 1])) return { owner: i - 1, spread: true, offsetX: ed.w };
  if (isSpreadPage(p)) return { owner: i, spread: true, offsetX: 0 };
  return { owner: i, spread: false, offsetX: 0 };
}
export function isSpreadPage(p) {
  return !!p && (LAYOUTS[p.layout]?.group === 'spread' || (p.layout === 'frei' && p.spread));
}

export function layoutCtx(ed, ownerIndex, aspects, spread) {
  const p = ed.pages[ownerIndex] || {};
  return {
    W: spread ? 2 * ed.w : ed.w, H: ed.h,
    // Page overrides (Lightroom "cell padding" / page margins): p.margin, p.gap
    m: num(p.margin ?? ed.margin, 12), mi: num(p.margin ?? ed.margin, 12) + num(ed.gutter, 6), g: num(p.gap ?? ed.gap, 4),
    side: ownerIndex % 2 === 1 ? 'L' : 'R',
    aspects, custom: p.frames, variant: p.variant || 0,
  };
}
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Frames of the page that owns the layout, image frames numbered by slot.
export function buildFrames(ed, ownerIndex, aspectOf = () => null) {
  const p = ed.pages[ownerIndex];
  if (!p) return [];
  const L = LAYOUTS[p.layout] || LAYOUTS.leer;
  const spread = isSpreadPage(p);
  const aspects = (p.slots || []).map((s) => (s?.key ? aspectOf(s.key) : null));
  const frames = L.build(layoutCtx(ed, ownerIndex, aspects, spread));
  let k = 0, t = 0;
  return frames.map((f) => (f.kind === 'image' ? { ...f, slot: k++ } : { ...f, text: t++ }));
}

export function slotCount(id, ed) {
  const L = LAYOUTS[id];
  if (!L || L.slots === 'auto') return null;
  return L.slots;
}

// ---------- Cover ----------
export const COVER_LAYOUTS = {
  'cover-front': {
    slots: 1,
    build: (cs) => {
      const fx = cs.front.x, fw = cs.front.w + cs.bleed;
      return [img(fx, 0, fw, cs.H), txt(cs.spine.x, cs.visible.y + 15, cs.spine.w, cs.visible.h - 30, 'spine'),
        txt(cs.back.x + 15, cs.visible.y + cs.visible.h * 0.7, cs.back.w - 30, cs.visible.h * 0.2, 'back')];
    },
  },
  'cover-wrap': {
    slots: 1,
    build: (cs) => [img(0, 0, cs.W, cs.H), txt(cs.spine.x, cs.visible.y + 15, cs.spine.w, cs.visible.h - 30, 'spine')],
  },
  'cover-passepartout': {
    slots: 1,
    build: (cs) => {
      const pad = 22, f = cs.front, v = cs.visible;
      const h = v.h * 0.62;
      return [img(f.x + pad, v.y + pad, f.w - 2 * pad, h), txt(f.x + pad, v.y + pad + h + 10, f.w - 2 * pad, 28, 'title'),
        txt(cs.spine.x, v.y + 15, cs.spine.w, v.h - 30, 'spine')];
    },
  },
  'cover-front-back': {
    slots: 2,
    build: (cs) => [img(cs.front.x, 0, cs.front.w + cs.bleed, cs.H), img(0, 0, cs.back.x + cs.back.w, cs.H),
      txt(cs.spine.x, cs.visible.y + 15, cs.spine.w, cs.visible.h - 30, 'spine')],
  },
};
export const COVER_ORDER = ['cover-front', 'cover-wrap', 'cover-passepartout', 'cover-front-back'];

export function coverFrames(ed, aspectOf = () => null) {
  const cs = coverSpec(ed);
  const L = COVER_LAYOUTS[ed.coverDesign?.layout] || COVER_LAYOUTS['cover-front'];
  let k = 0, t = 0;
  return { cs, frames: L.build(cs).map((f) => (f.kind === 'image' ? { ...f, slot: k++ } : { ...f, text: t++ })) };
}

// Layouts that hold the same number of photos as the page (for "shuffle").
export function alternativesFor(ed, ownerIndex) {
  const p = ed.pages[ownerIndex];
  const n = (p.slots || []).filter(Boolean).length;
  const spread = isSpreadPage(p);
  const ids = LAYOUT_ORDER.filter((id) => {
    const L = LAYOUTS[id];
    if ((L.group === 'spread') !== spread) return false;
    if (L.slots === 'auto') return n > 0;
    return L.slots === n && n > 0;
  });
  return ids;
}

// Page number position (mm, page coordinates) or null. Hidden on full-bleed and spread pages.
export function pageNumberFor(ed, i) {
  const mode = ed.pageNumbers || 'none';
  if (mode === 'none') return null;
  const p = ed.pages[i];
  const own = pageOwner(ed, i);
  if (own.spread) return null;
  if (p && (p.hideNumber || ['voll', 'zwei-randlos', 'halb-text', 'leer'].includes(p.layout))) return null;
  const side = i % 2 === 1 ? 'L' : 'R';
  const y = ed.h - Math.max(6, (ed.safety || 5) + 1);
  const m = Math.max(ed.margin ?? 12, (ed.safety || 5) + 2);
  const text = String(i + 1);
  if (mode === 'center') return { text, x: ed.w / 2, y, align: 'center' };
  return side === 'L' ? { text, x: m, y, align: 'left' } : { text, x: ed.w - m, y, align: 'right' };
}
