// Values from projects end up in SVG, CSS and HTML strings (editor, previews, exports). Projects can
// come from MCP clients, remote assistants and .billerbook files, so these checks run on every save
// and every package import. Colours must be plain colour values, never markup.

const COLOR = /^(#[0-9a-f]{3,8}|transparent|none|currentColor|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\))$/i;
const COLOR_KEYS = new Set(['color', 'bg', 'fill', 'stroke', 'background']);
const FAMILY = /^[\w:. -]{1,80}$/;
const FONT_ID = /^[\w-]{1,64}$/;
const FONT_FACE = /^\d{3}-(normal|italic)$/;
import { TONES } from './tones.js';
const TONE_IDS = new Set(TONES.map((t) => t.id));

export const isColor = (v) => typeof v === 'string' && COLOR.test(v.trim());
// For string building: an unsafe value becomes the fallback.
export const safeColor = (v, fallback = '#ffffff') => (isColor(v) ? v.trim() : fallback);
export const safeNumber = (v, d = 1, min = 0, max = 1) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

// Returns a list of problems ({ path, value }); fix=true repairs them in place (drops the value).
export function checkProject(project, { fix = false } = {}) {
  const problems = [];
  const walk = (o, at) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      const here = `${at}.${k}`;
      if (COLOR_KEYS.has(k) && typeof v === 'string' && !isColor(v)) { problems.push({ path: here, value: v }); if (fix) delete o[k]; continue; }
      if (k === 'opacity' && v != null && !(typeof v === 'number' && Number.isFinite(v))) { problems.push({ path: here, value: v }); if (fix) o[k] = safeNumber(v); continue; }
      if (k === 'family' && typeof v === 'string' && !FAMILY.test(v)) { problems.push({ path: here, value: v }); if (fix) delete o[k]; continue; }
      // Tones end up in file names (IDML links): only the known ids.
      if (k === 'tone' && v != null && v !== '' && !(typeof v === 'string' && TONE_IDS.has(v))) { problems.push({ path: here, value: v }); if (fix) delete o[k]; continue; }
      // Crop aspect of a photo in a frame: a plain ratio between 1:5 and 5:1.
      if (k === 'aspect' && /\.slots\.\d+$/.test(at) && v != null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0.2 && v <= 5)) { problems.push({ path: here, value: v }); if (fix) delete o[k]; continue; }
      if (k === 'toneStrength' && v != null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) { problems.push({ path: here, value: v }); if (fix) o[k] = safeNumber(v); continue; }
      // A page subset only exists while exporting; a stored one is never legitimate.
      if (k === 'subset' && /^editions\.\d+$/.test(at)) { problems.push({ path: here, value: '[subset]' }); if (fix) delete o[k]; continue; }
      if ((k === 'isbn' || k === 'addon') && v != null && !/^[\dXx -]{0,24}$/.test(String(v))) { problems.push({ path: here, value: v }); if (fix) delete o[k]; continue; }
      if (v && typeof v === 'object') walk(v, here);
    }
  };
  walk(project?.editions, 'editions');
  walk(project?.textStyles, 'textStyles');
  const fonts = Array.isArray(project?.fonts) ? project.fonts : [];
  for (const f of [...fonts]) {
    const bad = !FONT_ID.test(String(f?.id)) || Object.keys(f?.files || {}).some((k) => !FONT_FACE.test(k)) || (f?.family && !FAMILY.test(f.family));
    if (bad) { problems.push({ path: `fonts.${f?.id}`, value: f?.id }); if (fix) project.fonts.splice(project.fonts.indexOf(f), 1); }
  }
  return problems;
}
