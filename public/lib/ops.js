// Project operations shared by the UI, the HTTP API and the MCP server.
// All functions mutate the given project object (callers pass a clone if needed).

import { editionSpecFrom } from './providers.js';
import { LAYOUTS, slotCount, isSpreadPage, buildFrames, pageOwner, coverFrames, alternativesFor } from './layouts.js';
import { placement, spineOf } from './geometry.js';

import { STYLE_KEYS, STYLE_PRESETS, ROLES } from './text.js';
import { findTemplate } from './templates.js';
export const rid = () => Math.random().toString(36).slice(2, 10);
const EDITION_COLORS = ['#e0a458', '#6aa9e9', '#8fcb7a', '#d77fb3', '#b59cf0', '#e9776a'];

export function newProject(name = 'Photo book') {
  const p = { id: rid(), name, version: 1, sources: { folders: [] }, editions: [], createdAt: new Date().toISOString() };
  return p;
}

export function addEdition(project, opts = {}) {
  const spec = editionSpecFrom(opts.provider || 'wmd', opts.format || 'hc-a4-quer', opts.paper);
  const ed = {
    id: rid(), name: opts.name || 'Edition', color: EDITION_COLORS[project.editions.length % EDITION_COLORS.length],
    ...spec, spine: null, margin: 12, gutter: 6, gap: 4, ppi: 300, colorMode: spec.colourWanted === 'srgb' ? 'rgb' : 'cmyk', icc: null,
    font: 'sans', bg: '#ffffff', pageNumbers: 'none', sharpen: 'standard', pages: [], coverDesign: { layout: 'cover-front', slots: [], texts: [] },
  };
  if (opts.copyFrom) {
    const src = project.editions.find((e) => e.id === opts.copyFrom);
    if (src) {
      ed.pages = structuredClone(src.pages).map((p) => ({ ...p, id: rid() }));
      ed.coverDesign = structuredClone(src.coverDesign);
      for (const k of ['margin', 'gutter', 'gap', 'font', 'bg', 'ppi']) ed[k] = src[k];
      // Colour settings only carry over when both printers want the same colour space.
      if ((src.colourWanted || 'cmyk') === ed.colourWanted) { ed.colorMode = src.colorMode; ed.icc = src.icc; }
      // Imported free layouts only scale proportionally. When the page shape changes,
      // switch them to the closest built-in layout so photos are not cropped oddly.
      if (Math.abs(Math.log((src.w / src.h) / (ed.w / ed.h))) > 0.1) for (const p of ed.pages) convertFreePage(p);
    }
  }
  project.editions.push(ed);
  normalize(ed);
  return ed;
}

export function convertFreePage(p) {
  if (p.layout !== 'frei') return;
  const frames = p.frames || [];
  const imgs = frames.filter((f) => (f.kind || 'image') === 'image');
  const hasText = (p.texts || []).some((t) => t?.value?.trim());
  const keys = (p.slots || []).filter(Boolean);
  const covers = imgs.length === 1 && imgs[0].w * imgs[0].h > 0.9;
  if (p.spread) p.layout = keys.length <= 1 && covers ? 'dps-voll' : 'dps-auto';
  else if (!keys.length) p.layout = hasText ? 'text' : 'leer';
  else if (keys.length === 1) p.layout = covers ? 'voll' : hasText ? 'bild-text' : 'einzeln';
  else p.layout = 'auto';
  if (p.layout === 'bild-text') p.texts = [p.texts.find((t) => t?.value?.trim())];
  p.slots = keys.map((s) => ({ key: s.key, ...(s.fit ? { fit: s.fit } : {}) }));
  delete p.frames; delete p.spread;
}

export function getEdition(project, id) {
  const ed = typeof id === 'number' ? project.editions[id] : project.editions.find((e) => e.id === id || e.name === id);
  if (!ed) throw new Error(`edition not found: ${id}`);
  return ed;
}

export function updateEdition(project, edId, patch) {
  const ed = getEdition(project, edId);
  if (patch.provider || patch.format) {
    const providerChanged = patch.provider && patch.provider !== ed.provider;
    Object.assign(ed, editionSpecFrom(patch.provider || ed.provider, patch.format || ed.format, patch.paper || ed.paper));
    if (providerChanged) ed.colorMode = ed.colourWanted === 'srgb' ? 'rgb' : 'cmyk';
    delete ed.coverTemplate;
  } else if (patch.paper && patch.paper !== ed.paper) {
    const spec = editionSpecFrom(ed.provider, ed.format, patch.paper);
    ed.paper = spec.paper;
    ed.spineRule = spec.spineRule;
    ed.pageMax = spec.pageMax;
    delete ed.coverTemplate;
  }
  const allowed = ['name', 'w', 'h', 'binding', 'bleed', 'safety', 'glue', 'cover', 'spine', 'spinePerPage', 'pageStep',
    'margin', 'gutter', 'gap', 'ppi', 'colorMode', 'icc', 'font', 'bg', 'color', 'pageNumbers', 'sharpen',
    'interior', 'blankEnds', 'pageMin', 'pageMax', 'colourWanted', 'spineTextMin', 'spineRule', 'coverTemplate', 'cellPadding', 'bgPhoto', 'guides', 'textStyle', 'textStyles', 'layoutGrid'];
  for (const k of allowed) if (k in patch && !['provider', 'format'].includes(k)) ed[k] = patch[k];
  normalize(ed);
  return ed;
}

// Editions saved before 0.10 have no spine rule or interior mode.
export function migrateEdition(ed) {
  if (!ed.spineRule) ed.spineRule = { type: 'printer', perPage: ed.spinePerPage || 0.08 };
  if (!ed.interior) ed.interior = 'single';
  if (ed.blankEnds == null) ed.blankEnds = false;
  if (!ed.cover) ed.cover = { mode: 'spread', wrap: 3, overW: 0, overH: 0, joint: 0, hinge: 0 };
  if (ed.cover.mode == null) ed.cover.mode = 'spread';
  if (ed.cover.joint == null) ed.cover.joint = 0;
  if (ed.pageMin === undefined) ed.pageMin = null;
  if (ed.pageMax === undefined) ed.pageMax = null;
  if (!ed.colourWanted) ed.colourWanted = 'cmyk';
  return ed;
}

export const newPage = (layout = 'auto', slots = []) => ({ id: rid(), layout, slots, texts: [] });

// Keep spread pairs consistent after inserting / deleting / moving pages.
export function normalize(ed) {
  for (let i = 0; i < ed.pages.length; i++) {
    const p = ed.pages[i];
    if (isSpreadPage(p)) {
      if (i % 2 === 0) { p.layout = 'auto'; delete p.spread; continue; } // spreads only start on left pages
      if (!ed.pages[i + 1]) ed.pages.push({ ...newPage('leer'), spanned: true });
      else { ed.pages[i + 1].spanned = true; ed.pages[i + 1].slots = []; }
      i++;
    } else if (p.spanned) delete p.spanned;
  }
  for (const p of ed.pages) {
    p.slots = p.slots || [];
    p.texts = p.texts || [];
    const n = slotCount(p.layout);
    if (n != null) {
      while (p.slots.length < n) p.slots.push(null);
      if (p.slots.length > n) p.slots.length = n;
    } else p.slots = p.slots.filter(Boolean);
  }
  migrateEdition(ed);
  const sp = spineOf(ed);
  ed.spineCalc = sp;
  ed.spineEstimate = sp.exact ? null : sp.mm;
  return ed;
}

export function insertPages(project, edId, at, count = 1, layout = 'auto') {
  const ed = getEdition(project, edId);
  const pos = at == null ? ed.pages.length : Math.max(0, Math.min(at, ed.pages.length));
  ed.pages.splice(pos, 0, ...Array.from({ length: count }, () => newPage(layout)));
  normalize(ed);
  return { at: pos };
}

export function deletePages(project, edId, from, count = 1) {
  const ed = getEdition(project, edId);
  let start = from, n = count;
  if (ed.pages[start]?.spanned) { start -= 1; n += 1; }
  const last = start + n - 1;
  if (isSpreadPage(ed.pages[last])) n += 1;
  const removed = ed.pages.splice(start, n);
  normalize(ed);
  return { removed: removed.length };
}

export function movePages(project, edId, from, count, to) {
  const ed = getEdition(project, edId);
  const block = ed.pages.splice(from, count);
  const target = to > from ? to - count : to;
  ed.pages.splice(Math.max(0, Math.min(target, ed.pages.length)), 0, ...block);
  normalize(ed);
}

export function setLayout(project, edId, page, layout) {
  const ed = getEdition(project, edId);
  const own = pageOwner(ed, page).owner;
  const p = ed.pages[own];
  if (!p || !LAYOUTS[layout]) throw new Error(`invalid page or layout: ${page} ${layout}`);
  const wasSpread = isSpreadPage(p);
  const willSpread = LAYOUTS[layout].group === 'spread';
  if (willSpread && own % 2 === 0) throw new Error('spread layouts start on a left page (even page number)');
  const keys = p.slots.filter(Boolean);
  if (willSpread && !wasSpread && ed.pages[own + 1]) keys.push(...ed.pages[own + 1].slots.filter(Boolean));
  p.layout = layout;
  if (layout !== 'frei') delete p.frames;
  const n = slotCount(layout);
  let removed = [];
  if (n != null) { p.slots = keys.slice(0, n); removed = keys.slice(n); } else p.slots = keys;
  if (wasSpread && !willSpread && ed.pages[own + 1]) { delete ed.pages[own + 1].spanned; ed.pages[own + 1].layout = 'auto'; }
  normalize(ed);
  return { removed: removed.map((s) => s.key) };
}

export function placeImage(project, edId, page, slot, key, extra = {}) {
  const ed = getEdition(project, edId);
  const p = ed.pages[pageOwner(ed, page).owner];
  const entry = { key, ...extra };
  if (slot == null || slot >= p.slots.length) {
    if (slotCount(p.layout) != null) {
      const free = p.slots.findIndex((s) => !s);
      if (free >= 0) p.slots[free] = entry;
      else { p.layout = isSpreadPage(p) ? 'dps-auto' : 'auto'; p.slots.push(entry); }
    } else p.slots.push(entry);
  } else p.slots[slot] = entry;
  normalize(ed);
}

export function addImages(project, edId, page, keys) {
  for (const k of keys) placeImage(project, edId, page, null, k);
}

// Move a photo from its frame to another page (e.g. dropped on a spread in the page strip).
// The photo keeps its tone; the crop starts fresh because the new frame has another shape.
export function moveImage(project, edId, from, toPage) {
  const ed = getEdition(project, edId);
  const src = ed.pages[pageOwner(ed, from.page).owner]?.slots?.[from.slot];
  if (!src?.key) return false;
  if (pageOwner(ed, from.page).owner === pageOwner(ed, toPage).owner) return false;
  removeImage(project, edId, from.page, from.slot);
  placeImage(project, edId, toPage, null, src.key);
  const p = ed.pages[pageOwner(ed, toPage).owner];
  const moved = p.slots.find((x) => x?.key === src.key && !x.tone);
  if (moved && src.tone) { moved.tone = src.tone; if (src.toneStrength != null) moved.toneStrength = src.toneStrength; }
  return true;
}

export function removeImage(project, edId, page, slot) {
  const ed = getEdition(project, edId);
  const p = ed.pages[pageOwner(ed, page).owner];
  if (slotCount(p.layout) == null) p.slots.splice(slot, 1); else p.slots[slot] = null;
  normalize(ed);
}

export function swapSlots(project, edId, a, b) {
  const ed = getEdition(project, edId);
  const pa = ed.pages[pageOwner(ed, a.page).owner], pb = ed.pages[pageOwner(ed, b.page).owner];
  const sa = pa.slots[a.slot] ?? null, sb = b.slot != null ? pb.slots[b.slot] ?? null : null;
  if (b.slot == null || b.slot >= pb.slots.length) {
    if (sa) { pb.slots.push({ key: sa.key }); removeImage(project, edId, a.page, a.slot); }
    normalize(ed);
    return;
  }
  // The tone belongs to the photo, the crop to the frame.
  const carry = (x) => (x ? { key: x.key, ...(x.tone ? { tone: x.tone, toneStrength: x.toneStrength } : {}) } : null);
  pa.slots[a.slot] = carry(sb);
  pb.slots[b.slot] = carry(sa);
  normalize(ed);
}

export function updateSlot(project, edId, page, slot, patch) {
  const ed = getEdition(project, edId);
  const p = ed.pages[pageOwner(ed, page).owner];
  if (!p.slots[slot]) return;
  // null (or undefined) removes a setting: JSON drops undefined, so MCP and API calls send null.
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v == null) delete p.slots[slot][k]; else p.slots[slot][k] = v;
  }
}

export function setText(project, edId, page, idx, value) {
  const ed = getEdition(project, edId);
  const p = ed.pages[pageOwner(ed, page).owner];
  p.texts[idx] = { ...(p.texts[idx] || {}), value };
}

export function setPageProps(project, edId, page, patch) {
  const ed = getEdition(project, edId);
  const p = ed.pages[pageOwner(ed, page).owner];
  if (!p) throw Object.assign(new Error(`no page ${page}`), { status: 400 });
  for (const k of ['bg', 'margin', 'gap', 'bgPhoto', 'hideNumber', 'bgGraphic']) {
    if (!(k in patch)) continue;
    if (patch[k] === null || patch[k] === '') delete p[k]; else p[k] = patch[k];
  }
}

// One key press: this photo becomes a full-bleed page (or spread on a left page if wide enough).
export function makeFullBleed(project, edId, page, slot) {
  const ed = getEdition(project, edId);
  const own = pageOwner(ed, page).owner;
  const p = ed.pages[own];
  const s = p.slots[slot];
  if (!s) return;
  const rest = p.slots.filter((x, i) => x && i !== slot);
  p.layout = 'voll'; p.slots = [{ key: s.key }];
  if (rest.length) ed.pages.splice(own + 1, 0, newPage('auto', rest));
  normalize(ed);
  return { movedToNextPage: rest.length };
}

// ---------- Auto fill ----------
// items: pool items in the desired order. Returns number of pages created.
// Print shops take page counts in steps (mostly 2, magazines 4): fill up with blank pages at the end.
export function padToStep(ed) {
  const step = ed.pageStep || 0;
  let added = 0;
  while (step > 1 && ed.pages.length % step) { ed.pages.push(newPage('leer')); added++; }
  return added;
}

// Order for automatic layout: time (capture time), lightroom (as in the Lightroom collection, also
// custom order), name (file name), rating (best first, then time), given (as passed, e.g. a selection).
export function orderItems(items, order = 'time') {
  const t = (it) => (it.time ? Date.parse(it.time) : 0) || 0;
  const list = [...items];
  if (order === 'given') return list;
  if (order === 'lightroom') return list.sort((a, b) => (a.lrOrder ?? 1e9) - (b.lrOrder ?? 1e9) || t(a) - t(b));
  if (order === 'name') return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
  if (order === 'rating') return list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || t(a) - t(b));
  return list.sort((a, b) => t(a) - t(b));
}

export function autoFill(project, edId, items, opts = {}) {
  const ed = getEdition(project, edId);
  const perPage = Math.max(1, Math.min(12, opts.perPage || 3));
  const hi = opts.highlightRating ?? 5;
  const gapH = (opts.breakHours ?? 36) * 3600e3;
  const pageAspect = ed.w / ed.h;
  const out = [];
  items = orderItems(items, opts.order);
  // Time gaps only make sense when the photos run in time order.
  if (opts.order && opts.order !== 'time' && opts.breakOnGaps == null) opts = { ...opts, breakOnGaps: false };
  if (opts.style === 'monograph') { const r = monographFill(ed, items, opts, pageAspect); r.added = opts.pad ? padToStep(ed) : 0; return r; }
  let cur = [], last = null;
  const flush = () => { if (cur.length) out.push(newPage('auto', cur.map((k) => ({ key: k })))); cur = []; };
  let chap = null;
  for (const it of items) {
    if (opts.chapters) {
      const key = chapterKey(it, opts.chapters);
      if (key && key !== chap) { flush(); chap = key; out.push(chapterPage(it, opts.chapters, opts.lang || 'de')); }
    }
    const t = it.time ? Date.parse(it.time) : null;
    if (opts.breakOnGaps !== false && last && t && t - last > gapH) flush();
    if (t) last = t;
    if (hi && (it.rating || 0) >= hi) {
      flush();
      const a = it.w && it.h ? it.w / it.h : 1.5;
      const close = Math.abs(Math.log(a / pageAspect)) < 0.3;
      out.push(newPage(close ? 'voll' : 'einzeln', [{ key: it.key }]));
      continue;
    }
    cur.push(it.key);
    if (cur.length >= perPage) flush();
  }
  flush();
  if (opts.replace) ed.pages = out;
  else if (opts.at != null) ed.pages.splice(opts.at, 0, ...out);
  else ed.pages.push(...out);
  normalize(ed);
  return { pages: out.length, added: opts.pad ? padToStep(ed) : 0 };
}

// Applies a book template: font, text styles, page colour and graphic, cover design, page numbers.
// The pages themselves stay; relayout (server side) refills them with the template's sequence.
export function applyTemplate(project, edId, templateId, opts = {}) {
  const ed = getEdition(project, edId);
  const tp = findTemplate(templateId);
  if (!tp) throw new Error(`unknown template: ${templateId}`);
  ed.font = tp.font;
  const keep = Object.fromEntries(Object.entries(ed.textStyles || {}).filter(([k]) => !ROLES.includes(k)));
  ed.textStyles = { ...keep, ...structuredClone(tp.styles) };
  ed.bg = tp.page.bg;
  if (tp.page.graphic) ed.bgGraphic = { ...tp.page.graphic }; else delete ed.bgGraphic;
  for (const p of ed.pages) { delete p.bg; }
  const c = ed.coverDesign;
  setCoverLayout(ed, tp.cover.layout);
  c.bg = tp.cover.bg;
  if (tp.cover.graphic) c.bgGraphic = { ...tp.cover.graphic }; else delete c.bgGraphic;
  ed.pageNumbers = tp.pageNumbers;
  if (tp.fill?.gap != null) ed.gap = tp.fill.gap;
  ed.template = tp.id;
  if (opts.restyle !== false) restyleForTemplate(ed, tp, opts.aspectOf);
  normalize(ed);
  return { template: tp.id, fill: tp.fill };
}

// Photo-book pages (plates, pauses, single-photo spreads) take the template's rhythm; grids, free
// frames, text and chapter pages stay as they are. Templates with a tone apply it to every photo.
const RESTYLE = {
  reportage: { atem: 'tafel', 'atem-ecke': 'tafel', 'tafel-legende': 'tafel', 'dps-randlos-weiss': 'dps-voll', 'dps-tafel-rechts': 'dps-voll' },
  chronik: { tafel: 'tafel-legende', atem: 'tafel-legende', 'atem-ecke': 'tafel-legende', einzeln: 'tafel-legende' },
  kino: { atem: 'tafel', 'atem-ecke': 'atem', 'tafel-legende': 'tafel', 'dps-tafel-rechts': 'dps-randlos-weiss' },
  strasse: { atem: 'voll', 'atem-ecke': 'voll', 'tafel-legende': 'tafel', 'dps-randlos-weiss': 'dps-voll', 'dps-tafel-rechts': 'dps-voll' },
  backstage: { atem: 'tafel', 'atem-ecke': 'tafel', 'tafel-legende': 'tafel', 'dps-randlos-weiss': 'dps-voll', 'dps-tafel-rechts': 'dps-voll' },
};
export function restyleForTemplate(ed, tp, aspectOf = () => null) {
  const map = RESTYLE[tp.fill?.rhythm];
  const pageAspect = ed.w / ed.h;
  let n = 0;
  if (map) {
    for (let i = 0; i < ed.pages.length; i++) {
      const p = ed.pages[i];
      if (p.spanned) continue;
      let to = map[p.layout];
      // Reportage, cinematic and backstage: plates whose photo has the page's shape go full bleed now and then.
      if (p.layout === 'tafel' && ['reportage', 'kino', 'backstage', 'strasse'].includes(tp.fill.rhythm) && p.slots?.[0]?.key) {
        const a = aspectOf(p.slots[0].key);
        const every = ['backstage', 'strasse'].includes(tp.fill.rhythm) ? 2 : tp.fill.rhythm === 'kino' ? 3 : 6;
        if (a && Math.abs(Math.log(a / pageAspect)) < 0.3 && ++n % every === 0) to = 'voll';
      }
      if (to) p.layout = to;
    }
  }
  if (tp.fill?.tone) for (const sl of [...ed.pages.flatMap((p) => p.slots || []), ...(ed.coverDesign?.slots || [])]) if (sl?.key && !sl.tone) sl.tone = tp.fill.tone;
}

// Changing the cover layout keeps texts with their role (the spine text stays the spine text).
// A page title becomes the cover title when the new layout has one and the old one did not.
export function setCoverLayout(ed, layout) {
  const c = ed.coverDesign;
  const before = coverFrames(ed).frames.filter((f) => f.kind === 'text').map((f) => f.role);
  const byRole = {};
  before.forEach((r, i) => { if (c.texts?.[i]?.value) byRole[r] = c.texts[i]; });
  c.layout = layout;
  const after = coverFrames(ed).frames.filter((f) => f.kind === 'text').map((f) => f.role);
  if (!byRole.cover && byRole.title) byRole.cover = byRole.title;
  if (!byRole.title && byRole.cover) byRole.title = byRole.cover;
  c.texts = after.map((r) => byRole[r] || { value: '' });
}

// Chapter key of a photo: month or day, from its capture time.
function chapterKey(it, mode) {
  if (!it.time) return null;
  const d = new Date(it.time);
  if (Number.isNaN(d.getTime())) return null;
  return mode === 'day' ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7);
}
function chapterPage(it, mode, lang) {
  const d = new Date(it.time);
  const big = mode === 'day' ? d.toLocaleDateString(lang, { day: 'numeric', month: 'long' }) : d.toLocaleDateString(lang, { month: 'long' });
  const small = mode === 'day' ? d.toLocaleDateString(lang, { weekday: 'long', year: 'numeric' }) : String(d.getFullYear());
  const p = newPage('kapitel', []);
  p.texts = [{ value: big }, { value: small }];
  return p;
}

// Photo-book sequence: one photo per page, the best ones full bleed, every few pages a small
// "breathing" photo. With rightHand, photos only sit on right pages and the left page stays white.
function monographFill(ed, items, opts, pageAspect) {
  const hi = opts.highlightRating ?? 5;
  const out = [];
  const startIndex = opts.replace ? 0 : opts.at != null ? opts.at : ed.pages.length;
  let n = 0, chap = null;
  for (const it of items) {
    if (opts.chapters) {
      const key = chapterKey(it, opts.chapters);
      if (key && key !== chap) {
        chap = key;
        // Chapter openers sit on a right page.
        if ((startIndex + out.length) % 2 === 1) out.push(newPage('leer', []));
        out.push(chapterPage(it, opts.chapters, opts.lang || 'de'));
      }
    }
    if (opts.rightHand && (startIndex + out.length) % 2 === 1) out.push(newPage('leer', []));
    const a = it.w && it.h ? it.w / it.h : 1.5;
    const close = Math.abs(Math.log(a / pageAspect)) < 0.3;
    const top = hi && (it.rating || 0) >= hi;
    const left = (startIndex + out.length) % 2 === 1;
    const wide = a > pageAspect * 1.15;
    n++;
    let layout = 'tafel';
    if (opts.rhythm === 'reportage') {
      // Strong landscape photos run across the spread; every sixth photo full bleed.
      if ((top || n % 6 === 0) && wide && left) { out.push(newPage('dps-voll', [{ key: it.key }]), newPage('leer', [])); continue; }
      if (n % 6 === 0 && close) layout = 'voll';
    } else if (opts.rhythm === 'strasse') {
      if (wide && left && n % 2 === 1) { out.push(newPage('dps-voll', [{ key: it.key }]), newPage('leer', [])); continue; }
      layout = close || top ? 'voll' : 'tafel';
    } else if (opts.rhythm === 'chronik') {
      layout = 'tafel-legende';
    } else if (opts.rhythm === 'kino') {
      // Full bleed on the left, white on the right with a small caption; often full bleed.
      if (wide && left && n % 3 !== 0) { out.push(newPage('dps-randlos-weiss', [{ key: it.key }]), newPage('leer', [])); continue; }
      if (top || (close && n % 2 === 0)) layout = 'voll';
      else if (n % 7 === 0) layout = 'atem';
    } else if (top) layout = close ? 'voll' : 'tafel';
    else if (n % 5 === 0) layout = 'atem';
    out.push(newPage(layout, [{ key: it.key }]));
  }
  if (opts.replace) ed.pages = out;
  else if (opts.at != null) ed.pages.splice(opts.at, 0, ...out);
  else ed.pages.push(...out);
  normalize(ed);
  return { pages: out.length };
}

// ---------- Cover ----------
export function setCover(project, edId, patch) {
  const ed = getEdition(project, edId);
  const c = ed.coverDesign;
  if (patch.layout) setCoverLayout(ed, patch.layout);
  if (patch.slot != null) { c.slots[patch.slot] = patch.key ? { key: patch.key, ...(patch.extra || {}) } : null; }
  if (patch.texts) c.texts = patch.texts;
  if (patch.bg) c.bg = patch.bg;
  if ('bgGraphic' in patch) { if (patch.bgGraphic) c.bgGraphic = patch.bgGraphic; else delete c.bgGraphic; }
  if ('barcode' in patch) { if (patch.barcode) c.barcode = { ...(c.barcode || {}), ...patch.barcode }; else delete c.barcode; }
}

// ---------- Text styles ----------
// styleId is a role (title, body, caption, spine, back) or a name of your own. patch null deletes an own style
// or resets a role to its defaults.
export function setTextStyle(project, edId, styleId, patch) {
  const ed = getEdition(project, edId);
  ed.textStyles ||= {};
  if (patch === null) { delete ed.textStyles[styleId]; return { styles: ed.textStyles }; }
  const cur = { ...(ed.textStyles[styleId] || {}) };
  for (const k of [...STYLE_KEYS, 'name']) {
    if (!(k in patch)) continue;
    if (patch[k] === null || patch[k] === '') delete cur[k]; else cur[k] = patch[k];
  }
  ed.textStyles[styleId] = cur;
  return { styles: ed.textStyles };
}

// Applies a style preset (font plus role styles) to an edition. Keeps the user's own named styles.
export function applyStylePreset(project, edId, presetId) {
  const ed = getEdition(project, edId);
  const pr = STYLE_PRESETS.find((x) => x.id === presetId);
  if (!pr) throw new Error(`unknown preset: ${presetId}`);
  ed.font = pr.family;
  const keep = Object.fromEntries(Object.entries(ed.textStyles || {}).filter(([k]) => !ROLES.includes(k)));
  ed.textStyles = { ...keep };
  for (const r of ROLES) if (pr[r]) ed.textStyles[r] = { ...pr[r] };
  return { font: ed.font, styles: ed.textStyles };
}

// Style and direct formatting of one text. target: { page } or { cover: true }. patch may hold
// value, style (id or null) and any style key (null removes the override).
export function setTextProps(project, edId, target, index, patch) {
  const ed = getEdition(project, edId);
  const arr = target.cover ? (ed.coverDesign.texts ||= []) : ed.pages[pageOwner(ed, target.page).owner].texts;
  const cur = { ...(arr[index] || { value: '' }) };
  for (const k of ['value', 'style', ...STYLE_KEYS]) {
    if (!(k in patch)) continue;
    if (patch[k] === null || patch[k] === '') delete cur[k]; else cur[k] = patch[k];
  }
  arr[index] = cur;
  return cur;
}

// Tone for one photo (bw, warm, sepia, selenium, cool; null = original colours).
export function setTone(project, edId, target, slot, tone, strength) {
  const ed = getEdition(project, edId);
  const slots = target.cover ? ed.coverDesign.slots : ed.pages[pageOwner(ed, target.page).owner].slots;
  const s = slots[slot];
  if (!s) throw new Error('empty frame');
  if (!tone) { delete s.tone; delete s.toneStrength; } else { s.tone = tone; if (strength != null) s.toneStrength = Number(strength); }
  return s;
}

// ---------- Usage & checks ----------
export function usage(project) {
  const map = new Map();
  for (const ed of project.editions) {
    const add = (k) => { if (!k) return; if (!map.has(k)) map.set(k, new Map()); const m = map.get(k); m.set(ed.id, (m.get(ed.id) || 0) + 1); };
    for (const p of ed.pages) for (const s of p.slots) add(s?.key);
    for (const s of ed.coverDesign?.slots || []) add(s?.key);
  }
  return map;
}

export function editionStats(project, edId, pool) {
  const ed = getEdition(project, edId);
  const u = usage(project);
  let placed = 0, nowhere = 0;
  for (const it of pool) {
    const m = u.get(it.key);
    if (m?.get(ed.id)) placed++;
    if (!m) nowhere++;
  }
  return { pages: ed.pages.length, placed, unplaced: pool.length - placed, nowhere, total: pool.length };
}

// Returns [{ level: 'error'|'warn', code, page, slot, params }]
export function preflight(project, edId, poolMap) {
  const ed = getEdition(project, edId);
  const out = [];
  const aspectOf = (k) => { const it = poolMap.get(k); return it?.w ? it.w / it.h : null; };
  const n = ed.pages.length;
  if (ed.pageStep && n % ed.pageStep) out.push({ level: 'error', code: 'page-step', params: { n, step: ed.pageStep } });
  if (ed.pageMin && n < ed.pageMin) out.push({ level: 'error', code: 'page-min', params: { n, min: ed.pageMin } });
  if (ed.pageMax && n > ed.pageMax) out.push({ level: 'error', code: 'page-max', params: { n, max: ed.pageMax } });
  const lim = ed.customLimits;
  if (lim && (ed.w < lim.w[0] || ed.w > lim.w[1] || ed.h < lim.h[0] || ed.h > lim.h[1])) out.push({ level: 'error', code: 'custom-size', params: { w: ed.w, h: ed.h, wmin: lim.w[0], wmax: lim.w[1], hmin: lim.h[0], hmax: lim.h[1] } });
  const sp = spineOf(ed);
  if (!sp.exact) out.push({ level: 'warn', code: 'no-spine', params: { est: sp.mm, url: sp.url || ed.spineRule?.url || '' } });
  const sf = coverFrames(ed).frames.find((f) => f.kind === 'text' && f.role === 'spine');
  const spineText = !!(sf && ed.coverDesign?.texts?.[sf.text]?.value?.trim());
  if (ed.spineTextMin && n < ed.spineTextMin && spineText) out.push({ level: 'warn', code: 'spine-text', params: { n, min: ed.spineTextMin } });
  if (ed.colourWanted === 'srgb' && ed.colorMode === 'cmyk') out.push({ level: 'warn', code: 'colour-mode', params: { want: 'sRGB' } });
  const glue = ed.glue || 0;
  for (let i = 0; i < n; i++) {
    const o = pageOwner(ed, i);
    if (o.owner !== i) continue;
    const frames = buildFrames(ed, i, aspectOf);
    const p = ed.pages[i];
    frames.forEach((f) => {
      if (f.kind !== 'image') return;
      const s = p.slots[f.slot];
      if (!s) { out.push({ level: 'warn', code: 'empty-slot', page: i, slot: f.slot }); return; }
      const it = poolMap.get(s.key);
      if (!it) { out.push({ level: 'error', code: 'missing-image', page: i, slot: f.slot, params: { key: s.key } }); return; }
      if (!it.file) out.push({ level: 'error', code: 'no-file', page: i, slot: f.slot, params: { name: it.name } });
      if (it.w) {
        const pl = placement(f.w, f.h, it.w, it.h, s);
        const ppi = Math.round(pl.ppi);
        if (ppi < 150) out.push({ level: 'error', code: 'low-ppi', page: i, slot: f.slot, params: { ppi, name: it.name } });
        else if (ppi < Math.min(240, ed.ppi * 0.8)) out.push({ level: 'warn', code: 'low-ppi', page: i, slot: f.slot, params: { ppi, name: it.name } });
      }
      if (glue && (i === 0 || i === n - 1)) {
        const inner = i % 2 === 0 ? f.x < glue : f.x + f.w > (o.spread ? 2 : 1) * ed.w - glue;
        if (inner) out.push({ level: 'warn', code: 'glue-zone', page: i, slot: f.slot, params: { mm: glue } });
      }
    });
  }
  const cf = coverFrames(ed, aspectOf);
  cf.frames.forEach((f) => {
    if (f.kind === 'image' && !ed.coverDesign.slots[f.slot]) out.push({ level: 'warn', code: 'cover-empty', slot: f.slot });
  });
  return out;
}

export function summary(project, pool) {
  return {
    id: project.id, name: project.name, version: project.version, sources: project.sources,
    pool: pool.length,
    editions: project.editions.map((ed) => ({
      id: ed.id, name: ed.name, provider: ed.provider, format: ed.format, binding: ed.binding, size: `${ed.w}×${ed.h} mm`,
      pages: ed.pages.length, spine: ed.spine, ...editionStats(project, ed.id, pool),
    })),
  };
}

// ---------- Speed tools ----------
// Space bar: next arrangement for the same photos (auto grid variant or another layout with the same count).
export function shuffleLayout(project, edId, page) {
  const ed = getEdition(project, edId);
  const own = pageOwner(ed, page).owner;
  const p = ed.pages[own];
  if (p.layout === 'auto' || p.layout === 'dps-auto') { p.variant = (p.variant || 0) + 1; return { layout: p.layout, variant: p.variant }; }
  const alts = alternativesFor(ed, own);
  if (!alts.length) return { layout: p.layout };
  const next = alts[(alts.indexOf(p.layout) + 1) % alts.length];
  setLayout(project, edId, own, next);
  return { layout: next };
}

// Turn the current layout into freely editable frames (move / resize / add / delete).
export function toFreeLayout(project, edId, page, aspectOf = () => null) {
  const ed = getEdition(project, edId);
  const own = pageOwner(ed, page).owner;
  const p = ed.pages[own];
  if (p.layout === 'frei') return;
  const spread = isSpreadPage(p);
  const W = spread ? 2 * ed.w : ed.w, H = ed.h;
  const frames = buildFrames(ed, own, aspectOf);
  p.frames = frames.map((f) => ({ kind: f.kind, role: f.role, x: f.x / W, y: f.y / H, w: f.w / W, h: f.h / H }));
  p.layout = 'frei';
  if (spread) p.spread = true;
  delete p.variant;
  normalize(ed);
}

export function updateFreeFrame(project, edId, page, index, rect) {
  const ed = getEdition(project, edId);
  const p = ed.pages[pageOwner(ed, page).owner];
  if (p.layout !== 'frei' || !p.frames?.[index]) return;
  const r = { ...p.frames[index], ...rect };
  r.w = Math.max(0.02, Math.min(1, r.w)); r.h = Math.max(0.02, Math.min(1, r.h));
  p.frames[index] = r;
}

export function addFreeFrame(project, edId, page, kind = 'image') {
  const ed = getEdition(project, edId);
  const p = ed.pages[pageOwner(ed, page).owner];
  if (p.layout !== 'frei') toFreeLayout(project, edId, page);
  const q = ed.pages[pageOwner(ed, page).owner];
  q.frames.push(kind === 'text' ? { kind: 'text', role: 'caption', x: 0.1, y: 0.82, w: 0.8, h: 0.08 } : { kind: 'image', x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
  if (kind === 'image') q.slots.push(null); else q.texts.push({ value: '' });
}

export function removeFreeFrame(project, edId, page, index) {
  const ed = getEdition(project, edId);
  const p = ed.pages[pageOwner(ed, page).owner];
  if (p.layout !== 'frei' || !p.frames?.[index]) return;
  const kind = p.frames[index].kind || 'image';
  const nth = p.frames.slice(0, index).filter((f) => (f.kind || 'image') === kind).length;
  p.frames.splice(index, 1);
  if (kind === 'image') p.slots.splice(nth, 1); else p.texts.splice(nth, 1);
}

// Fill empty caption frames from photo metadata (title / caption from Lightroom or XMP/IPTC).
export function fillCaptions(project, edId, captionOf, { page = null } = {}) {
  const ed = getEdition(project, edId);
  let filled = 0;
  ed.pages.forEach((p, i) => {
    if (page != null && i !== pageOwner(ed, page).owner) return;
    if (p.spanned) return;
    const frames = buildFrames(ed, i, () => null);
    const texts = frames.filter((f) => f.kind === 'text' && (f.role === 'caption' || p.layout === 'frei'));
    if (!texts.length) return;
    const caps = p.slots.filter(Boolean).map((s) => captionOf(s.key)).filter(Boolean);
    if (!caps.length) return;
    for (const f of texts) {
      if (p.texts[f.text]?.value?.trim()) continue;
      p.texts[f.text] = { ...(p.texts[f.text] || {}), value: [...new Set(caps)].join(' · ') };
      filled++;
      break;
    }
  });
  return { filled };
}

// ---------- Book-module parity: duplicate pages, copy layouts, saved layouts ----------

// Inserts copies of pages [from, from + count) right after them. A spread is always copied whole.
export function duplicatePages(project, edId, from, count = 1) {
  const ed = getEdition(project, edId);
  let start = from, n = Math.max(1, count);
  if (ed.pages[start]?.spanned) { start -= 1; n += 1; }
  if (isSpreadPage(ed.pages[start + n - 1])) n += 1;
  let copies = structuredClone(ed.pages.slice(start, start + n)).map((p) => ({ ...p, id: rid() }));
  let at = start + n;
  // Spreads must start on a left page (odd index); pad with a blank page if the copy would land wrong.
  if (copies.some((p) => isSpreadPage(p)) && (at % 2) !== (start % 2)) copies = [newPage('leer'), ...copies];
  ed.pages.splice(at, 0, ...copies);
  normalize(ed);
  return { at, count: copies.length };
}

const LAYOUT_PROPS = ['layout', 'variant', 'frames', 'spread', 'bg', 'margin', 'gap', 'bgPhoto'];

// Applies the layout of page `from` to every page in `to` (array of indexes), keeping their photos.
export function copyLayout(project, edId, from, to = []) {
  const ed = getEdition(project, edId);
  const src = ed.pages[pageOwner(ed, from).owner];
  const srcSpread = isSpreadPage(src);
  let changed = 0;
  for (const i of [].concat(to)) {
    const o = pageOwner(ed, i).owner;
    const p = ed.pages[o];
    if (!p || p === src) continue;
    if (srcSpread && o % 2 === 0) continue; // a spread layout fits left pages only
    const keys = (p.slots || []).filter(Boolean);
    for (const k of LAYOUT_PROPS) { if (src[k] === undefined) delete p[k]; else p[k] = structuredClone(src[k]); }
    p.slots = keys;
    const n = slotCount(p.layout);
    if (n != null) { while (p.slots.length < n) p.slots.push(null); }
    if (p.layout === 'frei') {
      const imgs = (p.frames || []).filter((f) => (f.kind || 'image') === 'image').length;
      while (p.slots.length < imgs) p.slots.push(null);
      p.slots.length = Math.max(imgs, 0);
    }
    changed++;
  }
  normalize(ed);
  return { changed };
}

// Saves the arrangement of a page as a reusable layout ("custom page" in Lightroom's Book module).
export function saveCustomLayout(project, edId, page, name) {
  const ed = getEdition(project, edId);
  const o = pageOwner(ed, page).owner;
  const p = ed.pages[o];
  const spread = isSpreadPage(p);
  const W = spread ? 2 * ed.w : ed.w, H = ed.h;
  const frames = p.layout === 'frei' && p.frames ? structuredClone(p.frames)
    : buildFrames(ed, o).map((f) => ({ kind: f.kind, role: f.role, x: f.x / W, y: f.y / H, w: f.w / W, h: f.h / H }));
  project.customLayouts ||= [];
  const item = { id: rid(), name: name || `Layout ${project.customLayouts.length + 1}`, spread, frames, photos: frames.filter((f) => f.kind === 'image').length };
  project.customLayouts.push(item);
  return item;
}

export function applyCustomLayout(project, edId, page, id) {
  const ed = getEdition(project, edId);
  const L = (project.customLayouts || []).find((x) => x.id === id || x.name === id);
  if (!L) throw new Error(`layout not found: ${id}`);
  const o = pageOwner(ed, page).owner;
  if (L.spread && o % 2 === 0) throw new Error('spread layouts start on a left page');
  const p = ed.pages[o];
  const keys = (p.slots || []).filter(Boolean);
  p.layout = 'frei';
  p.frames = structuredClone(L.frames);
  if (L.spread) p.spread = true; else delete p.spread;
  delete p.variant;
  p.slots = keys.slice(0, L.photos);
  while (p.slots.length < L.photos) p.slots.push(null);
  const texts = L.frames.filter((f) => f.kind === 'text').length;
  p.texts = (p.texts || []).slice(0, texts);
  while (p.texts.length < texts) p.texts.push({ value: '' });
  normalize(ed);
  return { page: o, photos: L.photos };
}

export function deleteCustomLayout(project, id) {
  project.customLayouts = (project.customLayouts || []).filter((x) => x.id !== id);
  return { ok: true };
}
