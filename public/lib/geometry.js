import { spineFor } from './providers.js';
// Shared geometry for browser and server. All sizes in mm, origin top-left.

export const PT_PER_MM = 72 / 25.4;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Image crop inside a frame (fw × fh mm) for an image of iw × ih px.
// slot.zoom ≥ 1, slot.ox / slot.oy ∈ [-1, 1] position the crop.
export function cropFor(fw, fh, iw, ih, slot = {}, focal = null) {
  const z = Math.max(1, slot.zoom || 1);
  const s = Math.max(fw / iw, fh / ih) * z; // mm per pixel
  const dw = iw * s, dh = ih * s;
  const ex = dw - fw, ey = dh - fh;
  // Without a manual position, centre the crop on the photo's focal point (smart crop).
  const fromFocal = (f, d, frame, extra) => (extra > 0.01 ? clamp(((f * d - frame / 2) / extra) * 2 - 1, -1, 1) : 0);
  const ox = clamp(slot.ox ?? (focal ? fromFocal(focal.x, dw, fw, ex) : 0), -1, 1);
  const oy = clamp(slot.oy ?? (focal ? fromFocal(focal.y, dh, fh, ey) : 0), -1, 1);
  const left = (ex * (ox + 1)) / 2, top = (ey * (oy + 1)) / 2;
  return { s, dw, dh, ex, ey, ox, oy, left, top, sx: left / s, sy: top / s, sw: fw / s, sh: fh / s, ppi: 25.4 / s };
}

// Where an image lands in a frame. slot.fit === 'contain' shows the whole photo
// (letterboxed), otherwise the frame is filled and cropped.
// Returns the drawn rectangle (mm, frame-relative) and the source crop (px).
export function placement(fw, fh, iw, ih, slot = {}, focal = null) {
  if (slot.fit === 'contain') {
    const s = Math.min(fw / iw, fh / ih);
    const dw = iw * s, dh = ih * s;
    return { dx: (fw - dw) / 2, dy: (fh - dh) / 2, dw, dh, sx: 0, sy: 0, sw: iw, sh: ih, s, ppi: 25.4 / s };
  }
  const c = cropFor(fw, fh, iw, ih, slot, focal);
  return { ox: c.ox, oy: c.oy, dx: 0, dy: 0, dw: fw, dh: fh, sx: c.sx, sy: c.sy, sw: c.sw, sh: c.sh, s: c.s, ppi: c.ppi, crop: c };
}

// Spreads: page 1 (index 0) stands alone on the right.
export function spreadsOf(pageCount) {
  const out = [[null, pageCount > 0 ? 0 : null]];
  for (let i = 1; i < pageCount; i += 2) out.push([i, i + 1 < pageCount ? i + 1 : null]);
  return out;
}
export const sideOf = (i) => (i % 2 === 1 ? 'L' : 'R');

// Cover canvas from the edition's print profile.
// cover.wrap: bleed/turn-in around the cover (mm), cover.overW / overH: board overhang
// beyond the trimmed block (hardcover), cover.joint: extra width on each side of the spine
// (IngramSpark, Mixam), cover.hinge: zone next to the spine to keep clear (drawn only).
//   total width  = 2 · (w + overW) + 2 · joint + spine + 2 · wrap
//   total height = h + 2 · overH + 2 · wrap
// WIRmachenDRUCK hardcover: wrap 15, overW 5, overH 2.5 → (2w + 40 + B) × (h + 35)
// WIRmachenDRUCK softcover: wrap 3, overhang 0         → (2w + B + 6) × (h + 6)
// A cover template imported from the printer (ed.coverTemplate) wins: its page size is the cover size.
export function coverSpec(ed) {
  const { w, h } = ed;
  const c = ed.cover || {};
  const wrap = num(c.wrap, 3), overW = num(c.overW, 0), overH = num(c.overH, 0), joint = num(c.joint, 0);
  const pw = w + overW;
  let B = spineOf(ed).mm;
  let W = 2 * pw + 2 * joint + B + 2 * wrap, H = h + 2 * overH + 2 * wrap;
  const t = ed.coverTemplate;
  if (t && t.W > 0 && t.H > 0) { W = t.W; H = t.H; B = Math.max(0, W - 2 * wrap - 2 * pw - 2 * joint); }
  const sx = wrap + pw + joint;
  return {
    W, H, bleed: wrap, hinge: num(c.hinge, 0), joint, safety: num(ed.safety, 5), spineMm: B,
    visible: { x: wrap, y: wrap, w: W - 2 * wrap, h: H - 2 * wrap },
    back: { x: wrap, w: pw }, spine: { x: sx, w: B }, front: { x: sx + B + joint, w: pw },
  };
}

// Spine width actually used for this edition: manual value, cover template, printer rule or estimate.
export function spineOf(ed) {
  if (ed.coverTemplate?.W > 0) {
    const c = ed.cover || {};
    const B = ed.coverTemplate.W - 2 * num(c.wrap, 3) - 2 * (ed.w + num(c.overW, 0)) - 2 * num(c.joint, 0);
    return { mm: Math.max(0, Math.round(B * 100) / 100), exact: true, source: 'template' };
  }
  if (ed.spine != null && ed.spine !== '' && Number.isFinite(Number(ed.spine))) return { mm: Number(ed.spine), exact: true, source: 'manual' };
  const rule = ed.spineRule || { type: 'printer', perPage: ed.spinePerPage || 0.08 };
  return spineFor(rule, ed.pages?.length || 0);
}
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

// Frame edges that touch the trim are extended into the bleed.
export function bleedExtend(f, W, H, b, eps = 0.05) {
  let { x, y } = f;
  const r = f.x + f.w, bt = f.y + f.h;
  if (x <= eps) x -= b;
  if (y <= eps) y -= b;
  const nr = r >= W - eps ? W + b : r;
  const nb = bt >= H - eps ? H + b : bt;
  return { ...f, x, y, w: nr - x, h: nb - y };
}

export function intersect(a, b) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w), bt = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || bt <= y) return null;
  return { x, y, w: r - x, h: bt - y };
}

// Rough spine estimate. The printer's own value always wins.
export function estimateSpine(pages, mmPerPage = 0.09) {
  return Math.round(pages * mmPerPage * 10) / 10;
}

export function hexToRgb(hex = '#ffffff') {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
