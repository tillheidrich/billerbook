// Image effects shared by thumbnails, previews and print: toning, soft proof, background graphics.

import fs from 'node:fs';
import sharp from 'sharp';
import { tintColour } from '../public/lib/tones.js';
import { graphicSvg } from '../public/lib/graphics.js';

// Applies a tone to a sharp pipeline. Returns the pipeline.
export function applyTone(s, tone, strength) {
  if (!tone) return s;
  if (tone === 'bw') return s.grayscale().toColourspace('srgb');
  const c = tintColour(tone, strength);
  return c ? s.tint(c) : s;
}

// Which profile a soft proof simulates: the edition's ICC file, otherwise libvips' built-in CMYK profile.
export const proofProfile = (ed) => (ed?.icc && fs.existsSync(ed.icc) ? ed.icc : 'cmyk');

// Round trip RGB → printer CMYK → RGB (TIFF in between, so no JPEG CMYK inversion issues).
// With `gamut`, pixels whose colour shifts visibly (ΔE in Lab with lightness half-weighted,
// above `limit`) are painted in a warning grey-magenta. Lightness shifts alone (paper, dot gain)
// are not flagged.
export async function softProof(jpeg, profile = 'cmyk', { gamut = false, limit = 12 } = {}) {
  const cmyk = await sharp(jpeg).withIccProfile(profile).tiff().toBuffer();
  const back = await sharp(cmyk).toColourspace('srgb').removeAlpha().jpeg({ quality: 88 }).toBuffer();
  if (!gamut) return back;
  const labA = await sharp(jpeg).removeAlpha().toColourspace('lab').raw({ depth: 'float' }).toBuffer({ resolveWithObject: true });
  const labB = await sharp(back).toColourspace('lab').raw({ depth: 'float' }).toBuffer({ resolveWithObject: true });
  const A = new Float32Array(labA.data.buffer, labA.data.byteOffset, labA.data.length / 4);
  const B = new Float32Array(labB.data.buffer, labB.data.byteOffset, labB.data.length / 4);
  const rgb = await sharp(back).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(rgb.data);
  const ch = rgb.info.channels, lc = labA.info.channels;
  let marked = 0, total = 0;
  for (let p = 0, q = 0; p < out.length; p += ch, q += lc) {
    total++;
    const d = Math.hypot((A[q] - B[q]) * 0.5, A[q + 1] - B[q + 1], A[q + 2] - B[q + 2]);
    if (d > limit) { out[p] = 200; out[p + 1] = 60; out[p + 2] = 200; marked++; }
  }
  const buf = await sharp(out, { raw: rgb.info }).jpeg({ quality: 85 }).toBuffer();
  return Object.assign(buf, { marked: marked / total });
}

// Renders a background graphic for an area (mm) at `ppi`, flattened onto `bg`.
export async function renderGraphic(gfx, wMm, hMm, { ppi = 300, bg = '#ffffff', inset = 8, bleed = 0 } = {}) {
  const svg = graphicSvg(gfx.id, wMm, hMm, { color: gfx.color, bg, inset, bleed, opacity: gfx.opacity ?? 1 });
  const W = wMm + 2 * bleed, H = hMm + 2 * bleed;
  const px = Math.max(1, Math.round((W / 25.4) * ppi)), py = Math.max(1, Math.round((H / 25.4) * ppi));
  // density: SVG is sized in mm; 1 mm at density d dpi = d/25.4 px.
  return sharp(Buffer.from(svg), { density: ppi, limitInputPixels: false }).resize(px, py, { fit: 'fill' }).flatten({ background: bg }).png().toBuffer();
}
