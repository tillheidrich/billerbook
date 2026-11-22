import { safeColor, safeNumber } from './safe.js';
// Built-in page background graphics. Each one is plain SVG in millimetres, so the editor shows
// it inline and the PDF writer renders the same SVG at print resolution. All original work,
// no third-party artwork. Lines are at least 0.3 mm: finer lines break up in print.

export const GRAPHICS = [
  { id: 'paper-warm', name: { en: 'Paper, warm', de: 'Papier, warm' }, group: 'texture', color: '#f4eee2' },
  { id: 'paper-cool', name: { en: 'Paper, cool', de: 'Papier, kühl' }, group: 'texture', color: '#eef0f0' },
  { id: 'kraft', name: { en: 'Kraft paper', de: 'Packpapier' }, group: 'texture', color: '#b8946a' },
  { id: 'linen', name: { en: 'Linen', de: 'Leinen' }, group: 'texture', color: '#e9e4da' },
  { id: 'gradient', name: { en: 'Soft gradient', de: 'Weicher Verlauf' }, group: 'tone', color: '#d9d4cc' },
  { id: 'vignette', name: { en: 'Vignette', de: 'Vignette' }, group: 'tone', color: '#1a1a1a' },
  { id: 'frame-thin', name: { en: 'Thin frame', de: 'Feiner Rahmen' }, group: 'frame', color: '#3a3a3a' },
  { id: 'frame-double', name: { en: 'Double frame', de: 'Doppelrahmen' }, group: 'frame', color: '#3a3a3a' },
  { id: 'corners', name: { en: 'Corner marks', de: 'Eckmarken' }, group: 'frame', color: '#3a3a3a' },
  { id: 'dots', name: { en: 'Dot grid', de: 'Punktraster' }, group: 'journal', color: '#9a9a9a' },
  { id: 'ruled', name: { en: 'Ruled lines', de: 'Linien' }, group: 'journal', color: '#a9b8c8' },
];
export const findGraphic = (id) => GRAPHICS.find((g) => g.id === id);

const r = (v) => Math.round(v * 1000) / 1000;

// Full SVG for an area of w × h mm. `inset` is where frames sit (safe area, measured from the trim),
// `bleed` how far the area extends beyond the trim on each side.
export function graphicSvg(id, w, h, { color, bg = '#ffffff', inset = 8, bleed = 0, opacity = 1, seed = 7 } = {}) {
  const g = findGraphic(id);
  if (!g) return '';
  // Values may come from project files: only plain colours and numbers go into the markup.
  const c = safeColor(color, g.color);
  bg = safeColor(bg, '#ffffff');
  opacity = safeNumber(opacity);
  seed = Math.round(safeNumber(seed, 7, 0, 1e6));
  inset = safeNumber(inset, 8, 0, 1000); bleed = safeNumber(bleed, 0, 0, 1000);
  const W = w + 2 * bleed, H = h + 2 * bleed, b = bleed;
  let defs = '', body = '';
  const grain = (base, freq, amount) => {
    defs += `<filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${amount} 0"/></filter>`;
    body += `<rect width="${r(W)}" height="${r(H)}" fill="${base}"/><rect width="${r(W)}" height="${r(H)}" filter="url(#n)" fill="#000"/>`;
  };
  switch (id) {
    case 'paper-warm': case 'paper-cool': grain(c, 1.6, 0.05); break;
    case 'kraft': {
      grain(c, 0.6, 0.16);
      // fibres
      let s = seed;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < Math.round((W * H) / 220); i++) {
        const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, l = 2 + rnd() * 5;
        body += `<line x1="${r(x)}" y1="${r(y)}" x2="${r(x + Math.cos(a) * l)}" y2="${r(y + Math.sin(a) * l)}" stroke="#5a3d1e" stroke-opacity="0.18" stroke-width="0.3"/>`;
      }
      break;
    }
    case 'linen': {
      defs += `<pattern id="p" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><rect width="1.2" height="1.2" fill="${c}"/><path d="M0 0.3H1.2M0 0.9H1.2" stroke="#000" stroke-opacity="0.05" stroke-width="0.3"/><path d="M0.3 0V1.2M0.9 0V1.2" stroke="#fff" stroke-opacity="0.12" stroke-width="0.3"/></pattern>`;
      body += `<rect width="${r(W)}" height="${r(H)}" fill="url(#p)"/>`;
      break;
    }
    case 'gradient':
      defs += `<linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
      body += `<rect width="${r(W)}" height="${r(H)}" fill="url(#gr)"/>`;
      break;
    case 'vignette':
      defs += `<radialGradient id="vg" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="${c}" stop-opacity="0"/><stop offset="1" stop-color="${c}" stop-opacity="0.55"/></radialGradient>`;
      body += `<rect width="${r(W)}" height="${r(H)}" fill="${bg}"/><rect width="${r(W)}" height="${r(H)}" fill="url(#vg)"/>`;
      break;
    case 'frame-thin':
      body += `<rect width="${r(W)}" height="${r(H)}" fill="${bg}"/><rect x="${r(b + inset)}" y="${r(b + inset)}" width="${r(w - 2 * inset)}" height="${r(h - 2 * inset)}" fill="none" stroke="${c}" stroke-width="0.3"/>`;
      break;
    case 'frame-double':
      body += `<rect width="${r(W)}" height="${r(H)}" fill="${bg}"/><rect x="${r(b + inset)}" y="${r(b + inset)}" width="${r(w - 2 * inset)}" height="${r(h - 2 * inset)}" fill="none" stroke="${c}" stroke-width="0.6"/><rect x="${r(b + inset + 1.4)}" y="${r(b + inset + 1.4)}" width="${r(w - 2 * inset - 2.8)}" height="${r(h - 2 * inset - 2.8)}" fill="none" stroke="${c}" stroke-width="0.3"/>`;
      break;
    case 'corners': {
      const L = 8, x0 = b + inset, y0 = b + inset, x1 = b + w - inset, y1 = b + h - inset;
      body += `<rect width="${r(W)}" height="${r(H)}" fill="${bg}"/><path d="M${r(x0)} ${r(y0 + L)}V${r(y0)}H${r(x0 + L)}M${r(x1 - L)} ${r(y0)}H${r(x1)}V${r(y0 + L)}M${r(x1)} ${r(y1 - L)}V${r(y1)}H${r(x1 - L)}M${r(x0 + L)} ${r(y1)}H${r(x0)}V${r(y1 - L)}" fill="none" stroke="${c}" stroke-width="0.4"/>`;
      break;
    }
    case 'dots': {
      const step = 5;
      defs += `<pattern id="d" x="${r(b % step)}" y="${r(b % step)}" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><circle cx="${step / 2}" cy="${step / 2}" r="0.35" fill="${c}"/></pattern>`;
      body += `<rect width="${r(W)}" height="${r(H)}" fill="${bg}"/><rect width="${r(W)}" height="${r(H)}" fill="url(#d)"/>`;
      break;
    }
    case 'ruled': {
      const step = 7;
      body += `<rect width="${r(W)}" height="${r(H)}" fill="${bg}"/>`;
      for (let y = b + inset + step; y < b + h - inset; y += step) body += `<line x1="${r(b + inset)}" y1="${r(y)}" x2="${r(b + w - inset)}" y2="${r(y)}" stroke="${c}" stroke-width="0.3"/>`;
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r(W)}mm" height="${r(H)}mm" viewBox="0 0 ${r(W)} ${r(H)}" preserveAspectRatio="none"><defs>${defs}</defs><g opacity="${opacity}">${body}</g></svg>`;
}

// Graphic of a page: its own, otherwise the edition's default. { id: 'none' } switches it off for one page.
export function pageGraphic(ed, p) {
  const g = p?.bgGraphic || ed?.bgGraphic;
  return g && g.id !== 'none' ? g : null;
}
