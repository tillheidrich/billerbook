// Fonts and text styles, shared by the editor, the PDF writer, the previews and the MCP server.
// Every value here is what both screen and print use, so the two cannot drift apart.

// Bundled open-licence families (fonts/<id>/…woff, SIL Open Font License).
export const FAMILIES = [
  { id: 'eb-garamond', name: 'EB Garamond', kind: 'serif', weights: [400, 500, 700], italic: true },
  { id: 'source-serif-4', name: 'Source Serif 4', kind: 'serif', weights: [300, 400, 500, 700], italic: true },
  { id: 'cormorant-garamond', name: 'Cormorant Garamond', kind: 'serif', weights: [300, 400, 500, 700], italic: true },
  { id: 'playfair-display', name: 'Playfair Display', kind: 'display', weights: [400, 500, 700], italic: true },
  { id: 'dm-serif-display', name: 'DM Serif Display', kind: 'display', weights: [400], italic: true },
  { id: 'work-sans', name: 'Work Sans', kind: 'sans', weights: [300, 400, 500, 700], italic: true },
  { id: 'jost', name: 'Jost', kind: 'sans', weights: [300, 400, 500, 700], italic: true },
  { id: 'archivo', name: 'Archivo', kind: 'sans', weights: [300, 400, 500, 700], italic: true },
  { id: 'caveat', name: 'Caveat', kind: 'hand', weights: [400, 500, 700], italic: false },
];
// Projects from before 0.11 stored "sans" or "serif".
export const LEGACY_FAMILY = { sans: 'work-sans', serif: 'source-serif-4' };

export const familyId = (id) => LEGACY_FAMILY[id] || id || 'work-sans';

// Custom fonts live on the project: project.fonts = [{ id, name, files: { '400-normal': path, … } }].
export function allFamilies(project) {
  const custom = (project?.fonts || []).map((f) => {
    const ws = [...new Set(Object.keys(f.files || {}).map((k) => Number(k.split('-')[0])))].sort((a, b) => a - b);
    return { id: `custom:${f.id}`, name: f.name, kind: 'custom', weights: ws.length ? ws : [400], italic: Object.keys(f.files || {}).some((k) => k.endsWith('italic')) };
  });
  return [...FAMILIES, ...custom];
}
export function findFamily(project, id) {
  id = familyId(id);
  return allFamilies(project).find((f) => f.id === id) || FAMILIES.find((f) => f.id === 'work-sans');
}
export function nearestWeight(fam, w) {
  return fam.weights.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), fam.weights[0]);
}

// The five roles every layout uses. Each is a style the user can change per edition.
export const ROLES = ['title', 'body', 'caption', 'spine', 'back', 'cover', 'chapter'];
const ROLE_BASE = {
  title: { weight: 700, size: 26, leading: 1.15, tracking: 0, align: 'center', caps: false, italic: false },
  body: { weight: 400, size: 11, leading: 1.4, tracking: 0, align: 'left', caps: false, italic: false },
  caption: { weight: 400, size: 9, leading: 1.35, tracking: 0, align: 'left', caps: false, italic: false },
  spine: { weight: 700, size: 11, leading: 1, tracking: 40, align: 'center', caps: false, italic: false },
  back: { weight: 400, size: 9, leading: 1.4, tracking: 0, align: 'left', caps: false, italic: false },
  // Title on the front cover, separate from page titles so it can sit on a photo in white.
  cover: { weight: 500, size: 30, leading: 1.05, tracking: 0, align: 'left', caps: false, italic: false },
  // Chapter opener (month, place, part of the book).
  chapter: { weight: 300, size: 54, leading: 1, tracking: -10, align: 'left', caps: false, italic: false },
};
export const STYLE_KEYS = ['family', 'weight', 'italic', 'size', 'leading', 'tracking', 'align', 'caps', 'color'];

// Presets offered in the style editor. Values only, no colours: colour follows the page unless set.
export const STYLE_PRESETS = [
  { id: 'classic', name: { en: 'Classic book', de: 'Klassisches Buch' }, family: 'eb-garamond', title: { size: 28, weight: 500 }, caption: { italic: true, size: 9.5 } },
  { id: 'modern', name: { en: 'Modern', de: 'Modern' }, family: 'work-sans', title: { size: 24, weight: 300, tracking: 20 }, caption: { size: 8, tracking: 20 } },
  { id: 'gallery', name: { en: 'Gallery', de: 'Galerie' }, family: 'jost', title: { size: 14, weight: 500, caps: true, tracking: 200 }, caption: { size: 7.5, caps: true, tracking: 120 } },
  { id: 'journal', name: { en: 'Travel journal', de: 'Reisetagebuch' }, family: 'caveat', title: { size: 34, weight: 700 }, caption: { size: 12 }, body: { size: 13 } },
  { id: 'magazine', name: { en: 'Magazine', de: 'Magazin' }, family: 'playfair-display', title: { size: 32, weight: 700, align: 'left' }, caption: { family: 'archivo', size: 8 } },
];

// Effective style of one text: role defaults → edition font → edition role style → named style → the text's own values.
export function resolveStyle(ed, role, text = {}) {
  const st = { ...(ROLE_BASE[role] || ROLE_BASE.body), family: familyId(ed?.font) };
  const styles = ed?.textStyles || {};
  if (styles[role]) Object.assign(st, pick(styles[role]));
  if (text?.style && styles[text.style]) Object.assign(st, pick(styles[text.style]));
  Object.assign(st, pick(text || {}));
  st.family = familyId(st.family);
  st.size = Number(st.size) || 11;
  st.leading = Number(st.leading) || 1.3;
  st.tracking = Number(st.tracking) || 0;
  st.weight = Number(st.weight) || 400;
  return st;
}
function pick(o) {
  const r = {};
  for (const k of STYLE_KEYS) if (o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k];
  return r;
}

// Named styles the user added (everything in ed.textStyles that is not a role).
export const customStyles = (ed) => Object.entries(ed?.textStyles || {}).filter(([k]) => !ROLES.includes(k)).map(([id, s]) => ({ id, ...s }));

export const applyCase = (s, st) => (st.caps ? String(s).toLocaleUpperCase() : String(s));
export const PT_TO_MM = 25.4 / 72;

// CSS for the editor: same files the PDF writer outlines.
export function fontFaceCss(project) {
  let css = '';
  for (const f of FAMILIES) {
    for (const w of f.weights) for (const style of f.italic ? ['normal', 'italic'] : ['normal']) {
      for (const sub of ['latin-ext', 'latin']) {
        css += `@font-face{font-family:'bb-${f.id}';font-style:${style};font-weight:${w};font-display:swap;src:url(/fonts/${f.id}/${f.id}-${sub}-${w}-${style}.woff) format('woff');${sub === 'latin' ? 'unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;' : ''}}\n`;
      }
    }
  }
  for (const f of project?.fonts || []) {
    if (!/^[\w-]{1,64}$/.test(String(f.id))) continue;
    for (const k of Object.keys(f.files || {})) {
      if (!/^\d{3}-(normal|italic)$/.test(k)) continue;
      const [w, style] = k.split('-');
      css += `@font-face{font-family:'bb-custom:${f.id}';font-style:${style};font-weight:${w};src:url(/api/fonts/${encodeURIComponent(f.id)}/${k});}\n`;
    }
  }
  return css;
}
export const cssFamily = (st) => `'bb-${familyId(st.family)}', ${findFamily(null, st.family)?.kind === 'serif' ? 'Georgia, serif' : 'Helvetica, Arial, sans-serif'}`;
