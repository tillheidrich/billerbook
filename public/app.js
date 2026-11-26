import { placement, spreadsOf, coverSpec, clamp, luminance, estimateSpine, spineOf } from './lib/geometry.js';
import { LAYOUTS, LAYOUT_ORDER, COVER_ORDER, COVER_LAYOUTS, buildFrames, pageOwner, isSpreadPage, layoutCtx, coverFrames, pageNumberFor } from './lib/layouts.js';
import { findProvider, allProviders, registerProfiles, papersOf, editionSpecFrom, profileFromEdition, validateProfile } from './lib/providers.js';
import * as ops from './lib/ops.js';
import { t, tl, getLang, setLang, STRINGS } from './lib/i18n.js';
import { resolveStyle, cssFamily, ROLES, customStyles, STYLE_KEYS, PT_TO_MM } from './lib/text.js';
import { GRAPHICS, graphicSvg, pageGraphic } from './lib/graphics.js';
import { TEMPLATES } from './lib/templates.js';
import { TONES } from './lib/tones.js';
import { parseIsbn, parseAddon, barcodeBars, isbnLabel, defaultBarcodeBox, KDP_BOX } from './lib/barcode.js';
import { safeColor } from './lib/safe.js';

// ---------- state ----------
const CLIENT = ops.rid();
const S = {
  sys: null, project: null, pool: [], poolMap: new Map(), usage: new Map(),
  ed: 0, spread: 0, page: null, sel: null, view: 'pages', filter: 'all', search: '', poolSel: new Set(),
  hist: [], fut: [], saveTimer: null, saving: false, pendingSave: false, preflight: null,
  proof: false, gamut: false, catalog: null, textSel: null,
};
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
};
const ed = () => S.project.editions[S.ed];
const thumb = (key, s = 400) => `/api/thumb?p=${S.project.id}&k=${encodeURIComponent(key)}&s=${s}`;
// Thumbnail as it will print: with the photo's tone and, in soft-proof mode, through the printer profile.
const thumbOf = (slot, s = 400) => {
  let u = thumb(slot.key, s);
  if (slot.tone) u += `&tone=${slot.tone}&ts=${slot.toneStrength ?? 0.6}`;
  if (S.proof) u += `&proof=${ed().id}${S.gamut ? '&gamut=1' : ''}`;
  return u;
};
const nameOf = (o) => (o?.name ? o.name[getLang()] || o.name.en : '');
// Background graphic as inline SVG behind the page content.
function graphicEl(gfx, W, H, k, bg, inset) {
  const el = h('div', { class: 'gfx', html: graphicSvg(gfx.id, W, H, { color: gfx.color, bg, inset, opacity: gfx.opacity ?? 1, seed: 7 }) });
  const svg = el.firstChild;
  if (svg) { svg.setAttribute('width', `${W * k}`); svg.setAttribute('height', `${H * k}`); }
  return el;
}
// Crop ratios like Lightroom's crop tool: '' keeps the photo's own aspect.
const CROP_ASPECTS = [['', ''], ['1', '1 : 1'], ['0.8', '4 : 5'], ['0.6667', '2 : 3'], ['1.5', '3 : 2'], ['1.3333', '4 : 3'], ['1.7778', '16 : 9'], ['2', '2 : 1'], ['3', '3 : 1']];
const aspectOf = (k) => { const it = S.poolMap.get(k); return it?.w ? it.w / it.h : null; };

async function api(path, { method, body, raw } = {}) {
  const r = await fetch(path, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers: raw ? { 'x-client': CLIENT } : { 'content-type': 'application/json', 'x-client': CLIENT },
    body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw Object.assign(new Error(e.error), { status: r.status }); }
  return r.json();
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- persistence ----------
function snapshot() { return JSON.stringify(S.project); }
function mutate(fn, { skipRender = false } = {}) {
  const before = snapshot();
  let res;
  try { res = fn(S.project); } catch (e) { toast(e.message); return; }
  if (snapshot() === before) return res;
  S.hist.push(before); if (S.hist.length > 80) S.hist.shift();
  S.fut = [];
  changed(skipRender);
  if (res?.removed?.length) toast(t('removed', { n: res.removed.length }));
  return res;
}
function changed(skipRender) {
  S.usage = ops.usage(S.project);
  scheduleSave();
  if (!skipRender) renderAll();
}
function undo() { if (!S.hist.length) return; S.fut.push(snapshot()); S.project = JSON.parse(S.hist.pop()); fixIndexes(); changed(); }
function redo() { if (!S.fut.length) return; S.hist.push(snapshot()); S.project = JSON.parse(S.fut.pop()); fixIndexes(); changed(); }
function fixIndexes() {
  S.ed = Math.min(S.ed, S.project.editions.length - 1);
  S.spread = Math.min(S.spread, spreadsOf(ed().pages.length).length - 1);
}
function scheduleSave() {
  setStatus(t('saving'));
  clearTimeout(S.saveTimer);
  S.pendingSave = true;
  S.saveTimer = setTimeout(save, 350);
}
async function save() {
  if (S.saving) { scheduleSave(); return; }
  S.saving = true;
  try {
    const r = await api(`/api/project/${S.project.id}`, { method: 'PUT', body: { project: S.project, baseVersion: S.project.version } });
    S.project.version = r.version;
    S.pendingSave = false;
    setStatus(t('saved'));
    loadPreflight();
  } catch (e) {
    if (e.status === 409) { await reloadProject(); toast(t('reloadedExternal')); }
    else setStatus(t('offline'));
  } finally { S.saving = false; }
}
function setStatus(s) { $('#status').textContent = s; }
async function reloadProject({ pool = false } = {}) {
  S.project = await api(`/api/project/${S.project.id}`);
  fixIndexes();
  if (pool) await loadPool();
  S.usage = ops.usage(S.project);
  renderAll();
  loadPreflight();
}
async function loadPool(refresh = false) {
  const r = await api(`/api/project/${S.project.id}/pool${refresh ? '?refresh=1' : ''}`);
  S.pool = r.items; S.poolMap = new Map(r.items.map((i) => [i.key, i]));
  // Smart crop runs in the background; pick up focal points as they arrive.
  clearTimeout(S.focalT);
  if (r.focal && r.focal.done < r.focal.total) S.focalT = setTimeout(async () => { await loadPool(); renderStage(); renderStrip(); }, 5000);
}
let pfTimer;
function loadPreflight() {
  clearTimeout(pfTimer);
  pfTimer = setTimeout(async () => {
    try { S.preflight = await api(`/api/project/${S.project.id}/preflight?edition=${ed().id}`); renderInspector(); } catch {}
  }, 300);
}
function connectEvents() {
  const es = new EventSource('/api/events');
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    if (ev.type === 'pool' && S.project && ev.id === S.project.id) { loadPool(true).then(() => { renderAll(); loadPreflight(); }); return; }
    if (ev.type === 'project' && S.project && ev.id === S.project.id && ev.by !== CLIENT && ev.version > S.project.version && !S.pendingSave) {
      const srcBefore = JSON.stringify(S.project.sources);
      reloadProject().then(() => { if (JSON.stringify(S.project.sources) !== srcBefore) loadPool().then(renderAll); });
    }
  };
}

// ---------- theme ----------
// system (default) follows macOS light/dark; light and dark are fixed choices.
const themeQuery = window.matchMedia('(prefers-color-scheme: light)');
function getTheme() { try { return localStorage.getItem('billerbook-theme') || 'system'; } catch { return 'system'; } }
function applyTheme() {
  const pref = getTheme();
  document.documentElement.dataset.theme = pref === 'system' ? (themeQuery.matches ? 'light' : 'dark') : pref;
}
function setTheme(v) { try { localStorage.setItem('billerbook-theme', v); } catch {} applyTheme(); }
themeQuery.addEventListener?.('change', applyTheme);
applyTheme();

// ---------- boot ----------
async function boot() {
  document.documentElement.lang = getLang();
  S.sys = await api('/api/system');
  registerProfiles((S.sys.providers || []).filter((p) => p.user));
  const list = await api('/api/projects');
  let id = location.hash.slice(1);
  try { id ||= localStorage.getItem('billerbook-last'); } catch {}
  if (id && list.some((p) => p.id === id)) await openProject(id);
  else if (list.length) await openProject(list[0].id);
  document.body.classList.toggle('no-project', !S.project);
  bindGlobal();
  if (!(id && list.some((p) => p.id === id)) && !list.length) projectsModal(true);
  connectEvents();
  window.addEventListener('resize', () => S.project && renderStage());
}
async function openProject(id) {
  S.project = await api(`/api/project/${id}`);
  location.hash = id;
  try { localStorage.setItem('billerbook-last', id); } catch {}
  S.ed = 0; S.spread = 0; S.sel = null; S.page = null; S.hist = []; S.fut = []; S.poolSel.clear(); S.textSel = null;
  $('#fontcss').href = `/api/fonts.css?p=${id}`;
  api(`/api/design-catalog?p=${id}`).then((c) => { S.catalog = c; }).catch(() => {});
  S.usage = ops.usage(S.project);
  renderAll();
  setStatus('…');
  await loadPool();
  setStatus('');
  renderAll();
  loadPreflight();
}

// ---------- rendering ----------
function renderAll() {
  if (!S.project) return;
  renderTop(); renderPool(); renderStage(); renderInspector(); renderStrip();
}

function renderTop() {
  $('#projName').textContent = S.project.name;
  const tabs = $('#editions'); tabs.innerHTML = '';
  S.project.editions.forEach((e, i) => {
    tabs.append(h('button', {
      class: 'ed-tab', role: 'tab', 'aria-selected': i === S.ed, style: { '--c': e.color },
      onclick: () => { S.ed = i; S.spread = Math.min(S.spread, spreadsOf(e.pages.length).length - 1); S.sel = null; renderAll(); loadPreflight(); },
      ondblclick: () => editionModal(e),
    }, h('span', { class: 'dot' }), e.name, h('span', { class: 'meta num' }, t('pagesShort', { n: e.pages.length }))));
  });
  tabs.append(h('button', { class: 'ed-tab add', onclick: () => editionModal(null), title: t('newEdition') }, '+'));
  const views = $('#views'); views.innerHTML = '';
  for (const v of ['pages', 'cover', 'overview']) views.append(h('button', { role: 'tab', 'aria-selected': S.view === v, onclick: () => { S.view = v; S.sel = null; S.textSel = null; renderAll(); } }, t(v)));
  $('#autoBtn').textContent = t('autoFill');
  $('#exportBtn').textContent = t('export');
  $('#aiBtn').textContent = t('connectAi');
  $('#tplBtn').textContent = t('templates');
  const pb = $('#proofBtn');
  pb.textContent = S.gamut ? t('proofGamut') : t('proof');
  pb.setAttribute('aria-pressed', String(S.proof));
  $('#stage').classList.toggle('proofing', S.proof);
  $('#stage').style.setProperty('--proof-label', JSON.stringify(S.gamut ? t('proofGamut') : t('proof')));
}

// Pool
function filteredPool() {
  const e = ed();
  const q = S.search.trim().toLowerCase();
  return S.pool.filter((it) => {
    const u = S.usage.get(it.key);
    if (S.filter === 'unplaced' && u?.get(e.id)) return false;
    if (S.filter === 'placed' && !u?.get(e.id)) return false;
    if (S.filter === 'nowhere' && u) return false;
    if (S.filter === 'nofile' && it.hasFile) return false;
    if (q && !it.name.toLowerCase().includes(q)) return false;
    return true;
  });
}
function renderPool() {
  const el = $('#pool'); const e = ed();
  const keep = $('.pool-grid', el)?.scrollTop || 0;
  el.innerHTML = '';
  const total = S.pool.length;
  const placed = S.pool.filter((it) => S.usage.get(it.key)?.get(e.id)).length;
  const nowhere = S.pool.filter((it) => !S.usage.get(it.key)).length;
  const nofile = S.pool.filter((it) => !it.hasFile).length;
  const chip = (id, label, n) => h('button', { class: 'chip', 'aria-pressed': S.filter === id, onclick: () => { S.filter = id; renderPool(); } }, label, n != null ? h('span', { class: 'count' }, n) : null);
  const search = h('input', { class: 'input', type: 'search', placeholder: t('search'), value: S.search, oninput: (ev) => { S.search = ev.target.value; renderPoolGrid(grid); } });
  el.append(h('div', { class: 'pool-head' },
    h('div', { class: 'pool-title' }, h('h2', {}, t('pool')), h('div', { class: 'row' },
      h('button', { class: 'btn ghost small', onclick: () => sourcesModal() }, t('sources')),
      h('button', { class: 'btn ghost small', onclick: () => importModal() }, t('import')),
      h('button', { class: 'btn ghost small', title: t('refresh'), onclick: async () => { setStatus('…'); await loadPool(true); setStatus(''); renderAll(); } }, '↻'))),
    h('div', { class: 'coverage', title: t('placedOf', { a: placed, b: total }) }, h('i', { style: { width: `${total ? (placed / total) * 100 : 0}%` } })),
    h('div', { class: 'pool-stats' }, h('span', { class: 'num' }, t('placedOf', { a: placed, b: total })), nofile ? h('span', { class: 'num' }, t('missingFiles', { n: nofile })) : null),
    h('div', { class: 'chips' }, chip('all', t('fAll'), total), chip('unplaced', t('fUnplaced'), total - placed), chip('nowhere', t('fNowhere'), nowhere), chip('placed', t('fPlaced'), placed), nofile ? chip('nofile', t('fNoFile'), nofile) : null),
    search));
  const grid = h('div', { class: 'pool-grid' });
  el.append(grid);
  renderPoolGrid(grid);
  grid.scrollTop = keep;
  // Files from Finder
  grid.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); grid.classList.add('drop'); } else if (ev.dataTransfer.types.includes('text/fbs-slot')) ev.preventDefault(); });
  grid.addEventListener('dragleave', () => grid.classList.remove('drop'));
  grid.addEventListener('drop', async (ev) => {
    ev.preventDefault(); grid.classList.remove('drop');
    if (ev.dataTransfer.files.length) { await uploadFiles(ev.dataTransfer.files); return; }
    const slot = ev.dataTransfer.getData('text/fbs-slot');
    if (slot) { const s = JSON.parse(slot); removeFromTarget(s); }
  });
}
function renderPoolGrid(grid) {
  grid.innerHTML = '';
  const items = filteredPool();
  if (!items.length) { grid.append(h('div', { class: 'empty' }, S.pool.length ? '—' : t('emptyPool'))); return; }
  const e = ed();
  let day = '';
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const d = (it.time || '').slice(0, 10);
    if (d !== day) { day = d; frag.append(h('div', { class: 'day' }, d ? new Date(d).toLocaleDateString(getLang(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '—')); }
    const u = S.usage.get(it.key);
    const el = h('div', {
      class: `ph${S.poolSel.has(it.key) ? ' sel' : ''}${u?.get(e.id) ? ' used-here' : ''}`, draggable: 'true', title: `${it.name}${it.rating ? ` · ${'★'.repeat(it.rating)}` : ''}`,
      'data-k': it.key,
    }, h('img', { src: thumb(it.key, 240), loading: 'lazy', alt: '' }),
      h('div', { class: 'ribbon' }, S.project.editions.map((x) => h('i', { class: u?.get(x.id) ? '' : 'off', style: { '--c': x.color }, title: x.name }))),
      it.rating ? h('div', { class: 'stars' }, '★'.repeat(it.rating)) : null,
      !it.hasFile ? h('div', { class: 'nofile', title: t('fNoFile') }, 'RAW') : null);
    el.addEventListener('click', (ev) => {
      if (ev.metaKey || ev.ctrlKey) { S.poolSel.has(it.key) ? S.poolSel.delete(it.key) : S.poolSel.add(it.key); }
      else if (ev.shiftKey && S.poolSel.size) {
        const keys = items.map((x) => x.key); const last = keys.indexOf([...S.poolSel].pop()); const cur = keys.indexOf(it.key);
        keys.slice(Math.min(last, cur), Math.max(last, cur) + 1).forEach((k) => S.poolSel.add(k));
      } else { S.poolSel.clear(); S.poolSel.add(it.key); }
      grid.querySelectorAll('.ph').forEach((n) => n.classList.toggle('sel', S.poolSel.has(n.dataset.k)));
    });
    el.addEventListener('dblclick', () => addToCurrentPage(S.poolSel.size > 1 && S.poolSel.has(it.key) ? [...S.poolSel] : [it.key]));
    el.addEventListener('dragstart', (ev) => {
      const keys = S.poolSel.has(it.key) ? [...S.poolSel] : [it.key];
      ev.dataTransfer.setData('text/fbs-keys', JSON.stringify(keys));
      ev.dataTransfer.effectAllowed = 'copy';
    });
    frag.append(el);
  }
  grid.append(frag);
}
async function uploadFiles(files, target) {
  // Mac app: use the real paths (no copy). Browser: upload a copy.
  if (window.billerbook?.pathFor) {
    const paths = [...files].map((f) => window.billerbook.pathFor(f)).filter(Boolean);
    if (paths.length) {
      const r = await api(`/api/project/${S.project.id}/op`, { body: { op: 'addPaths', args: { paths }, returnProject: false } });
      S.project.sources = (await api(`/api/project/${S.project.id}`)).sources;
      await loadPool(true);
      if (target != null && r.result.keys.length) mutate((p) => ops.addImages(p, ed().id, target, r.result.keys)); else renderAll();
      return r.result.keys;
    }
  }
  const keys = [];
  for (const f of files) {
    if (!/image\//.test(f.type)) continue;
    setStatus(`↑ ${f.name}`);
    const r = await api(`/api/project/${S.project.id}/upload?name=${encodeURIComponent(f.name)}`, { method: 'PUT', body: f, raw: true });
    keys.push(r.key);
  }
  await loadPool(true);
  setStatus('');
  if (target != null && keys.length) mutate((p) => ops.addImages(p, ed().id, target, keys)); else renderAll();
  return keys;
}
function currentPage() {
  if (S.page != null && S.page < ed().pages.length) return S.page;
  const sp = spreadsOf(ed().pages.length)[S.spread] || [];
  return sp[1] ?? sp[0] ?? null;
}
function addToCurrentPage(keys) {
  if (!ed().pages.length) mutate((p) => ops.insertPages(p, ed().id, 0, 1));
  const pg = currentPage() ?? 0;
  mutate((p) => ops.addImages(p, ed().id, pg, keys));
}

// Stage
function renderStage() {
  const st = $('#stage'); st.innerHTML = '';
  if (S.view === 'cover') return renderCoverStage(st);
  if (S.view === 'overview') return renderOverview(st);
  const e = ed();
  const spreads = spreadsOf(e.pages.length);
  if (!e.pages.length) {
    st.append(h('div', { class: 'empty' }, h('p', {}, t('dropHere')),
      h('button', { class: 'btn primary', onclick: () => mutate((p) => ops.insertPages(p, e.id, 0, 1)) }, `+ ${t('page')}`), ' ',
      h('button', { class: 'btn', onclick: () => autoModal() }, t('autoFill'))));
    return;
  }
  S.spread = clamp(S.spread, 0, spreads.length - 1);
  const [li, ri] = spreads[S.spread];
  const avW = st.clientWidth - 110, avH = st.clientHeight - 70;
  const k = Math.max(0.5, Math.min(avW / (2 * e.w), avH / e.h));
  const wrap = h('div', { class: 'spread', style: { width: `${2 * e.w * k}px`, height: `${e.h * k}px`, boxShadow: 'none' } });
  const lbl = li != null && ri != null ? t('pagesN', { a: li + 1, b: ri + 1 }) : t('pageN', { n: (li ?? ri) + 1 });
  st.append(h('div', { class: 'stage-label num' }, `${lbl} · ${e.w} × ${e.h} mm`));
  const leftOwner = li != null ? pageOwner(e, li) : null;
  if (leftOwner?.spread) {
    wrap.append(pageEl(li, 0, k, true));
  } else {
    wrap.append(li != null ? pageEl(li, 0, k) : h('div', { class: 'page none', style: { left: 0, width: `${e.w * k}px`, height: '100%' } }));
    if (ri != null) wrap.append(pageEl(ri, e.w * k, k));
  }
  wrap.append(h('div', { class: 'fold', style: { left: `${e.w * k}px` } }));
  st.append(wrap);
  if (S.spread > 0) st.append(h('button', { class: 'stage-nav prev', onclick: () => go(-1), 'aria-label': 'prev' }, '‹'));
  if (S.spread < spreads.length - 1) st.append(h('button', { class: 'stage-nav next', onclick: () => go(1), 'aria-label': 'next' }, '›'));
}
function go(d) {
  const n = spreadsOf(ed().pages.length).length;
  S.spread = clamp(S.spread + d, 0, n - 1); S.sel = null; S.page = null; S.textSel = null;
  renderStage(); renderInspector(); highlightStrip();
}

function pageEl(i, left, k, spread = false) {
  const e = ed();
  const p = e.pages[i];
  const W = spread ? 2 * e.w : e.w;
  const bg = p.bg || e.bg || '#ffffff';
  const el = h('div', { class: 'page', style: { left: `${left}px`, width: `${W * k}px`, height: `${e.h * k}px`, background: bg }, 'data-page': i });
  el.addEventListener('mousedown', (ev) => { if (ev.target === el) { S.page = i; S.sel = null; S.textSel = null; renderInspector(); el.closest('.spread')?.querySelectorAll('.frame.sel').forEach((f) => f.classList.remove('sel')); } });
  const frames = buildFrames(e, i, aspectOf);
  const target = { kind: 'page', page: i };
  const gfx = pageGraphic(e, p);
  if (gfx) el.append(graphicEl(gfx, W, e.h, k, bg, e.safety ?? 8));
  if (p.bgPhoto?.key) el.append(h('img', { class: 'bgphoto', src: thumbOf({ key: p.bgPhoto.key, tone: p.bgPhoto.tone }, 1200), alt: '', draggable: 'false', style: { opacity: p.bgPhoto.opacity ?? 0.35 } }));
  frames.forEach((f, idx) => {
    const fe = frameEl({ ...f, idx }, target, k, p, { textColor: luminance(bg) < 0.45 ? '#fff' : '#1a1a1a' });
    if (p.layout === 'frei') addResize(fe, target, { ...f, idx }, k, W, e.h);
    el.append(fe);
  });
  const pn = !spread && pageNumberFor(e, i);
  if (pn) el.append(h('div', { class: 'pnum', style: { [pn.align === 'right' ? 'right' : 'left']: pn.align === 'right' ? `${(e.w - pn.x) * k}px` : pn.align === 'center' ? `${pn.x * k - 10}px` : `${pn.x * k}px`, top: `${(pn.y - 3) * k}px`, fontSize: `${Math.max(7, 2.8 * k)}px`, color: luminance(bg) < 0.45 ? '#fff' : '#333' } }, String(i + 1)));
  if (!frames.some((f) => f.kind === 'image') && LAYOUTS[p.layout]?.group !== 'text' && p.layout !== 'leer') el.append(h('div', { class: 'hint-drop' }, t('dropHere')));
  // guides
  const sf = e.safety || 5;
  el.append(h('div', { class: 'guide', style: { left: `${sf * k}px`, top: `${sf * k}px`, width: `${(W - 2 * sf) * k}px`, height: `${(e.h - 2 * sf) * k}px` } }));
  const n = e.pages.length;
  if (e.glue && (i === 0 || i === n - 1 || (spread && i + 1 === n - 1))) {
    if (i === 0) el.append(h('div', { class: 'glue', style: { left: 0, width: `${e.glue * k}px` }, title: t('glue') }));
    else el.append(h('div', { class: 'glue', style: { right: 0, width: `${e.glue * k}px` }, title: t('glue') }));
  }
  // drop on page = add images
  el.addEventListener('dragover', (ev) => { if (ev.target === el || ev.target.classList.contains('hint-drop')) { ev.preventDefault(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', async (ev) => {
    el.classList.remove('drop');
    if (ev.target !== el && !ev.target.classList.contains('hint-drop')) return;
    ev.preventDefault();
    if (ev.dataTransfer.files.length) return uploadFiles(ev.dataTransfer.files, i);
    const keys = ev.dataTransfer.getData('text/fbs-keys');
    if (keys) mutate((pr) => ops.addImages(pr, e.id, i, JSON.parse(keys)));
    const slot = ev.dataTransfer.getData('text/fbs-slot');
    if (slot) { const s = JSON.parse(slot); if (s.kind === 'page') mutate((pr) => ops.swapSlots(pr, e.id, { page: s.page, slot: s.slot }, { page: i, slot: null })); }
  });
  return el;
}

function getSlots(target) {
  const e = ed();
  return target.kind === 'cover' ? (e.coverDesign.slots ||= []) : e.pages[target.page].slots;
}
function getTexts(target) {
  const e = ed();
  return target.kind === 'cover' ? (e.coverDesign.texts ||= []) : e.pages[target.page].texts;
}
function removeFromTarget(s) {
  if (s.kind === 'cover') mutate(() => { ed().coverDesign.slots[s.slot] = null; });
  else mutate((p) => ops.removeImage(p, ed().id, s.page, s.slot));
}
const isSel = (target, slot) => S.sel && S.sel.kind === target.kind && S.sel.page === target.page && S.sel.slot === slot;

function frameEl(f, target, k, owner, { textColor = '#1a1a1a' } = {}) {
  const style = { left: `${f.x * k}px`, top: `${f.y * k}px`, width: `${f.w * k}px`, height: `${f.h * k}px` };
  if (f.kind === 'text') {
    const texts = getTexts(target);
    const role = f.role || 'body';
    const tx = texts[f.text] || {};
    const st = resolveStyle(ed(), role, tx);
    const sizePx = st.size * PT_TO_MM * k;
    // While editing, the browser sets the text with the same font files and values. Otherwise the
    // frame shows the server's outlines, so line breaks are exactly those of the PDF.
    const edit = h('div', {
      class: `text-edit${role === 'spine' ? ' spine' : ''}`, contenteditable: 'plaintext-only', spellcheck: 'true', lang: getLang(),
      'data-placeholder': `${STRINGS[getLang()].roles[role] || ''} – ${t('typeHere')}`,
      style: {
        fontFamily: cssFamily(st), fontWeight: st.weight, fontStyle: st.italic ? 'italic' : 'normal', fontSize: `${sizePx}px`,
        lineHeight: String(st.leading), letterSpacing: `${st.tracking / 1000}em`, textTransform: st.caps ? 'uppercase' : 'none',
        textAlign: role === 'spine' ? 'center' : st.align, color: st.color || textColor,
      },
    });
    edit.textContent = tx.value || '';
    const el = h('div', { class: `text-frame${role === 'spine' ? ' spine' : ''}${S.textSel && S.textSel.kind === target.kind && S.textSel.page === target.page && S.textSel.index === f.text ? ' tsel' : ''}`, style }, edit);
    if (tx.value?.trim() && S.project.version != null) {
      const q = target.kind === 'cover' ? 'cover=1' : `page=${target.page}`;
      const img = h('img', { class: 'text-svg', alt: '', draggable: 'false', src: `/api/project/${S.project.id}/text.svg?edition=${ed().id}&${q}&frame=${f.text}&v=${S.project.version}-${encodeURIComponent(JSON.stringify(st)).length}-${(tx.value || '').length}` });
      el.append(img);
      el.classList.add('outlined');
    }
    edit.addEventListener('focus', () => {
      el.classList.add('editing');
      S.textSel = { kind: target.kind, page: target.page, index: f.text, role };
      document.querySelectorAll('.text-frame.tsel').forEach((n) => n.classList.remove('tsel'));
      el.classList.add('tsel');
      renderInspector();
    });
    edit.addEventListener('blur', () => {
      el.classList.remove('editing');
      const v = edit.innerText.replace(/\n$/, '');
      if ((texts[f.text]?.value || '') === v) return;
      mutate(() => { const arr = getTexts(target); arr[f.text] = { ...(arr[f.text] || {}), value: v }; }, { skipRender: true });
      renderStrip();
      // New outlines once the save has gone through.
      setTimeout(() => S.view !== 'overview' && !document.activeElement?.isContentEditable && renderStage(), 700);
    });
    edit.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') edit.blur(); });
    if (target.kind === 'page' && ed().pages[target.page]?.layout === 'frei') {
      el.addEventListener('pointerdown', (ev) => { if (ev.altKey) startFrameMove(ev, el, target, f, k); });
      const mv = h('div', { class: 'handle move', title: t('moveFrame') }, '✥');
      mv.addEventListener('pointerdown', (ev) => startFrameMove(ev, el, target, f, k));
      el.append(mv);
    }
    return el;
  }
  const slots = getSlots(target);
  const slot = slots[f.slot];
  const it = slot && S.poolMap.get(slot.key);
  const el = h('div', { class: `frame${it ? ' has' : ' img-empty'}${slot?.fit === 'contain' ? ' contain' : ''}${isSel(target, f.slot) ? ' sel' : ''}`, style });
  if (!slot) el.append('+');
  if (slot && !it) { el.classList.add('img-empty'); el.append('?'); }
  let img, pl;
  const layoutImg = () => {
    const s = slots[f.slot];
    pl = placement(f.w, f.h, it.w, it.h, s, it.focal);
    Object.assign(img.style, {
      width: `${it.w * pl.s * k}px`, height: `${it.h * pl.s * k}px`,
      left: `${(pl.dx - pl.sx * pl.s) * k}px`, top: `${(pl.dy - pl.sy * pl.s) * k}px`,
    });
  };
  if (it) {
    img = h('img', { src: thumbOf(slot, f.w * k > 420 ? 1600 : 800), alt: '', draggable: 'false' });
    el.append(img);
    layoutImg();
    const ppi = Math.round(pl.ppi);
    if (!it.hasFile) el.append(h('span', { class: 'badge err', title: t('fNoFile') }, 'RAW'));
    else if (ppi < 150) el.append(h('span', { class: 'badge err' }, `${ppi} ppi`));
    else if (ppi < Math.min(240, (ed().ppi || 300) * 0.8)) el.append(h('span', { class: 'badge warn' }, `${ppi} ppi`));
    if (target.kind === 'page' && ed().pages[target.page]?.layout === 'frei') {
      const mv = h('div', { class: 'handle move', title: t('moveFrame') }, '✥');
      mv.addEventListener('pointerdown', (ev) => startFrameMove(ev, el, target, f, k));
      el.append(mv);
    }
    const handle = h('div', { class: 'handle', draggable: 'true', title: '⇄' }, '⇄');
    handle.addEventListener('dragstart', (ev) => { ev.stopPropagation(); ev.dataTransfer.setData('text/fbs-slot', JSON.stringify({ ...target, slot: f.slot })); ev.dataTransfer.effectAllowed = 'move'; });
    el.append(handle);
    // pan
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || ev.target === handle || ev.target.classList.contains('rz')) return;
      if (ev.altKey && target.kind === 'page' && ed().pages[target.page]?.layout === 'frei') return startFrameMove(ev, el, target, f, k);
      select(target, f.slot, f.idx);
      const s = slots[f.slot];
      if (s.fit === 'contain' || !pl.crop) return;
      const before = snapshot();
      const start = { x: ev.clientX, y: ev.clientY, ox: s.ox ?? pl.ox ?? 0, oy: s.oy ?? pl.oy ?? 0 };
      try { el.setPointerCapture(ev.pointerId); } catch {} el.classList.add('panning');
      const move = (m) => {
        const dx = (m.clientX - start.x) / k, dy = (m.clientY - start.y) / k;
        const c = pl.crop;
        if (c.ex > 0.01) s.ox = clamp(start.ox - (2 * dx) / c.ex, -1, 1);
        if (c.ey > 0.01) s.oy = clamp(start.oy - (2 * dy) / c.ey, -1, 1);
        layoutImg();
      };
      const up = () => {
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.classList.remove('panning');
        if (snapshot() !== before) { S.hist.push(before); S.fut = []; changed(true); renderStrip(); }
      };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    });
    el.addEventListener('wheel', (ev) => {
      if (!isSel(target, f.slot)) return;
      ev.preventDefault();
      const s = slots[f.slot];
      if (!S.wheelSnap) { S.wheelSnap = snapshot(); }
      s.zoom = clamp((s.zoom || 1) * (1 - ev.deltaY * 0.0025), 1, 6);
      layoutImg();
      clearTimeout(S.wheelT);
      S.wheelT = setTimeout(() => { S.hist.push(S.wheelSnap); S.wheelSnap = null; S.fut = []; changed(true); renderInspector(); renderStrip(); }, 400);
    }, { passive: false });
  } else {
    el.addEventListener('click', (ev) => { if (!ev.altKey) select(target, f.slot, f.idx); });
    el.addEventListener('pointerdown', (ev) => { if (ev.altKey && target.kind === 'page' && ed().pages[target.page]?.layout === 'frei') startFrameMove(ev, el, target, f, k); });
  }
  el.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.stopPropagation(); el.classList.add('drop'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', async (ev) => {
    ev.preventDefault(); ev.stopPropagation(); el.classList.remove('drop');
    const e = ed();
    if (ev.dataTransfer.files.length) {
      const added = (await uploadFiles(ev.dataTransfer.files)) || [];
      if (added[0]) dropKeys([added[0]]);
      return;
    }
    const keys = ev.dataTransfer.getData('text/fbs-keys');
    if (keys) return dropKeys(JSON.parse(keys));
    const src = ev.dataTransfer.getData('text/fbs-slot');
    if (src) {
      const s = JSON.parse(src);
      if (s.kind === 'page' && target.kind === 'page') mutate((p) => ops.swapSlots(p, e.id, { page: s.page, slot: s.slot }, { page: target.page, slot: f.slot }));
      else mutate(() => {
        const a = getSlots(s), b = getSlots(target);
        const tmp = a[s.slot]; a[s.slot] = b[f.slot] ? { key: b[f.slot].key } : null; b[f.slot] = tmp ? { key: tmp.key } : null;
        ops.normalize(e);
      });
    }
    function dropKeys(list) {
      mutate((p) => {
        if (target.kind === 'cover') { getSlots(target)[f.slot] = { key: list[0] }; return; }
        ops.placeImage(p, e.id, target.page, f.slot, list[0]);
        if (list.length > 1) ops.addImages(p, e.id, target.page, list.slice(1));
      });
      select(target, f.slot);
    }
  });
  return el;
}
function select(target, slot, idx) {
  S.sel = { ...target, slot, idx };
  S.textSel = null;
  if (target.kind === 'page') S.page = target.page;
  document.querySelectorAll('.frame.sel').forEach((n) => n.classList.remove('sel'));
  renderStage(); renderInspector();
}

// ---------- free frames: Alt+drag moves, corner handle resizes, snapping to margins and edges ----------
// Snap targets: page edges, margins, centre, thirds and the canon block (inner/top 1/9, outer/bottom 2/9).
function snapLines(W, H, side = 'R') {
  const e = ed(), m = e.margin ?? 12;
  const xs = [0, m, W / 2, W - m, W], ys = [0, m, H / 2, H - m, H, H / 3, (2 * H) / 3, H / 9, (7 * H) / 9];
  const pages = W > e.w * 1.5 ? [[0, 'L'], [e.w, 'R']] : [[0, side]];
  for (const [x0, sd] of pages) {
    const pw = e.w;
    xs.push(x0 + pw / 3, x0 + (2 * pw) / 3, x0 + (sd === 'L' ? (2 * pw) / 9 : pw / 9), x0 + (sd === 'L' ? (8 * pw) / 9 : (7 * pw) / 9));
  }
  if (W > e.w * 1.5) xs.push(e.w, e.w - m, e.w + m);
  return { xs, ys };
}
const snap = (v, lines, tol) => { for (const l of lines) if (Math.abs(v - l) < tol) return l; return v; };
function startFrameMove(ev, el, target, f, k) {
  ev.preventDefault(); ev.stopPropagation();
  const e = ed(); const p = e.pages[target.page];
  const W = p.spread ? 2 * e.w : e.w, H = e.h;
  const before = snapshot();
  const fr = p.frames[f.idx];
  const start = { x: ev.clientX, y: ev.clientY, fx: fr.x, fy: fr.y };
  const { xs, ys } = snapLines(W, H, target.page % 2 === 1 ? 'L' : 'R');
  const move = (m) => {
    let nx = start.fx * W + (m.clientX - start.x) / k, ny = start.fy * H + (m.clientY - start.y) / k;
    const w = fr.w * W, h = fr.h * H;
    nx = snap(nx, xs, 2); nx = snap(nx + w, xs, 2) - w; ny = snap(ny, ys, 2); ny = snap(ny + h, ys, 2) - h;
    fr.x = nx / W; fr.y = ny / H;
    el.style.left = `${nx * k}px`; el.style.top = `${ny * k}px`;
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (snapshot() !== before) { S.hist.push(before); S.fut = []; changed(); } };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
function addResize(el, target, f, k, W, H) {
  const hd = h('div', { class: 'rz', title: '↘' });
  hd.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const p = ed().pages[target.page]; const fr = p.frames[f.idx];
    const before = snapshot();
    const start = { x: ev.clientX, y: ev.clientY, w: fr.w * W, h: fr.h * H };
    const { xs, ys } = snapLines(W, H);
    const move = (m) => {
      let w = Math.max(8, start.w + (m.clientX - start.x) / k), hh = Math.max(8, start.h + (m.clientY - start.y) / k);
      if (m.shiftKey) { const it = p.slots[f.slot] && S.poolMap.get(p.slots[f.slot].key); if (it) hh = w * it.h / it.w; } // Shift keeps the photo's aspect
      w = snap(fr.x * W + w, xs, 2) - fr.x * W; hh = snap(fr.y * H + hh, ys, 2) - fr.y * H;
      fr.w = w / W; fr.h = hh / H;
      el.style.width = `${w * k}px`; el.style.height = `${hh * k}px`;
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (snapshot() !== before) { S.hist.push(before); S.fut = []; changed(); } };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  el.append(hd);
}

// Cover
function renderCoverStage(st) {
  const e = ed();
  const { cs, frames } = coverFrames(e, aspectOf);
  const avW = st.clientWidth - 60, avH = st.clientHeight - 60;
  const k = Math.min(avW / cs.W, avH / cs.H);
  const bg = e.coverDesign.bg || '#ffffff';
  const wrap = h('div', { class: 'cover-wrap', style: { width: `${cs.W * k}px`, height: `${cs.H * k}px`, background: bg } });
  const target = { kind: 'cover' };
  if (e.coverDesign.bgGraphic?.id) wrap.append(graphicEl(e.coverDesign.bgGraphic, cs.W, cs.H, k, bg, cs.bleed + (e.safety ?? 6)));
  for (const f of frames) wrap.append(frameEl(f, target, k, null, { textColor: luminance(bg) < 0.45 ? '#fff' : '#1a1a1a' }));
  const bcEl = barcodeEl(e, cs, k);
  if (bcEl) wrap.append(bcEl);
  const v = cs.visible;
  wrap.append(h('div', { class: 'cover-trim', style: { left: `${v.x * k}px`, top: `${v.y * k}px`, width: `${v.w * k}px`, height: `${v.h * k}px` } }));
  for (const x of [cs.spine.x, cs.spine.x + cs.spine.w]) wrap.append(h('div', { class: 'cover-line', style: { left: `${x * k}px` } }));
  if (cs.hinge) {
    wrap.append(h('div', { class: 'cover-hinge', style: { left: `${(cs.spine.x - cs.hinge) * k}px`, width: `${cs.hinge * k}px` } }));
    wrap.append(h('div', { class: 'cover-hinge', style: { left: `${(cs.spine.x + cs.spine.w) * k}px`, width: `${cs.hinge * k}px` } }));
  }
  st.append(h('div', { class: 'stage-label num' }, `${t('cover')} · ${cs.W.toFixed(1)} × ${cs.H.toFixed(1)} mm · ${t('spine').replace(' (mm)', '')} ${spineOf(e).mm.toFixed(1)} mm${spineOf(e).exact ? '' : ` (${t('spEstimate')})`}`));
  st.append(wrap);
}

// Overview + strip
function miniSpread(idx, height) {
  const e = ed();
  const [li, ri] = spreadsOf(e.pages.length)[idx];
  const k = height / e.h;
  const box = h('div', { class: 'mini', style: { width: `${2 * e.w * k}px`, height: `${height}px` } });
  const drawPage = (i, left, spread) => {
    const p = e.pages[i];
    const W = spread ? 2 * e.w : e.w;
    const pg0 = pageGraphic(e, p);
    const gfxBase = pg0 && ['paper-warm', 'paper-cool', 'kraft', 'linen'].includes(pg0.id) ? (pg0.color || GRAPHICS.find((g) => g.id === pg0.id)?.color) : null;
    const pg = h('div', { class: 'mp', style: { left: `${left}px`, width: `${W * k}px`, background: gfxBase || p.bg || e.bg || '#fff' } });
    for (const f of buildFrames(e, i, aspectOf)) {
      const st = { left: `${f.x * k}px`, top: `${f.y * k}px`, width: `${f.w * k}px`, height: `${f.h * k}px` };
      if (f.kind === 'text') { pg.append(h('div', { class: 'mt', style: { ...st, height: `${Math.min(f.h, 4) * k}px` } })); continue; }
      const s = p.slots[f.slot];
      const it = s && S.poolMap.get(s.key);
      if (it) {
        const pl = placement(f.w, f.h, it.w, it.h, s, it.focal);
        st.backgroundImage = `url("${thumbOf({ key: s.key, tone: s.tone, toneStrength: s.toneStrength }, 200)}")`;
        st.backgroundSize = `${it.w * pl.s * k}px ${it.h * pl.s * k}px`;
        st.backgroundPosition = `${(pl.dx - pl.sx * pl.s) * k}px ${(pl.dy - pl.sy * pl.s) * k}px`;
        st.backgroundColor = 'transparent';
      }
      pg.append(h('div', { class: 'mf', style: st }));
    }
    box.append(pg);
  };
  if (li != null && pageOwner(e, li).spread) drawPage(li, 0, true);
  else { if (li != null) drawPage(li, 0); if (ri != null) drawPage(ri, e.w * k); }
  const label = li != null && ri != null ? `${li + 1}–${ri + 1}` : `${(li ?? ri) + 1}`;
  const w = h('div', { class: `mini-wrap${idx === S.spread ? ' cur' : ''}`, 'data-spread': idx, draggable: idx > 0 ? 'true' : null }, box, h('div', { class: 'mini-label num' }, label));
  w.addEventListener('click', () => { S.spread = idx; S.sel = null; S.page = null; if (S.view !== 'pages') S.view = 'pages'; renderAll(); });
  w.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/fbs-spread', String(idx)));
  w.addEventListener('dragover', (ev) => { const ty = ev.dataTransfer.types; if (ty.includes('text/fbs-spread') || ty.includes('text/fbs-keys') || ty.includes('text/fbs-slot')) { ev.preventDefault(); w.classList.add('drop'); } });
  w.addEventListener('dragleave', () => w.classList.remove('drop'));
  w.addEventListener('drop', (ev) => {
    ev.preventDefault(); w.classList.remove('drop');
    const from = ev.dataTransfer.getData('text/fbs-spread');
    if (from !== '' && from != null && from !== String(idx)) {
      const f = Number(from);
      mutate((p) => ops.movePages(p, e.id, 2 * f - 1, Math.min(2, e.pages.length - (2 * f - 1)), Math.max(1, 2 * idx - 1)));
      S.spread = idx;
      return;
    }
    const keys = ev.dataTransfer.getData('text/fbs-keys');
    if (keys) { const target = ri ?? li; mutate((p) => ops.addImages(p, e.id, target, JSON.parse(keys))); return; }
    // A photo dragged by its handle from a frame: move it to this spread (right page, or left if there is none).
    const slot = ev.dataTransfer.getData('text/fbs-slot');
    if (slot) {
      const s = JSON.parse(slot);
      if (s.kind !== 'page') return;
      mutate((p) => ops.moveImage(p, e.id, { page: s.page, slot: s.slot }, ri ?? li));
      toast(t('moveToSpread'));
    }
  });
  return w;
}
function renderStrip() {
  const el = $('#strip');
  if (!S.project) return;
  const keep = el.scrollLeft;
  el.innerHTML = '';
  const n = spreadsOf(ed().pages.length).length;
  if (ed().pages.length) for (let i = 0; i < n; i++) el.append(miniSpread(i, 70));
  el.append(h('button', { class: 'add-spread', title: t('insertSpread'), onclick: () => { mutate((p) => ops.insertPages(p, ed().id, null, ed().pages.length % 2 ? 2 : 1)); S.spread = spreadsOf(ed().pages.length).length - 1; renderAll(); } }, '+'));
  el.scrollLeft = keep;
  highlightStrip();
}
function highlightStrip() {
  document.querySelectorAll('.strip .mini-wrap').forEach((w) => w.classList.toggle('cur', Number(w.dataset.spread) === S.spread));
  const cur = $(`.strip .mini-wrap[data-spread="${S.spread}"]`);
  cur?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function renderOverview(st) {
  const o = h('div', { class: 'overview' });
  const n = spreadsOf(ed().pages.length).length;
  if (ed().cover?.mode !== 'none') {
    const e = ed();
    const img = h('img', { src: `/api/project/${S.project.id}/spread.jpg?edition=${e.id}&cover=1&guides=0&w=600&v=${S.project.version || 0}`, alt: t('cover'), loading: 'lazy', style: { height: '120px', width: 'auto', display: 'block' } });
    const w = h('div', { class: 'mini-wrap cover-tile' }, h('div', { class: 'mini', style: { height: '120px' } }, img), h('div', { class: 'mini-label' }, t('cover')));
    w.addEventListener('click', () => { S.view = 'cover'; S.sel = null; renderAll(); });
    o.append(w);
  }
  for (let i = 0; i < n; i++) o.append(miniSpread(i, 120));
  st.append(o);
}

// ---------- inspector ----------
function layoutIcon(id, e, pageIdx) {
  const L = LAYOUTS[id];
  const spread = L.group === 'spread';
  const W = spread ? 2 * e.w : e.w;
  const owner = e.pages[pageIdx];
  const n = L.slots === 'auto' ? Math.max(3, owner?.slots?.length || 0) : L.slots;
  const aspects = (owner?.slots || []).map((s) => (s?.key ? aspectOf(s.key) : null));
  while (aspects.length < n) aspects.push(aspects.length % 2 ? 0.75 : 1.5);
  const c = layoutCtx(e, pageIdx, aspects.slice(0, n), spread);
  const frames = L.build(c);
  const svg = `<svg viewBox="0 0 ${W} ${e.h}"><rect class="pg" width="${W}" height="${e.h}"/>${frames.map((f) => `<rect class="${f.kind === 'image' ? 'im' : 'tx'}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.kind === 'image' ? f.h : Math.min(f.h, e.h * 0.05)}"/>`).join('')}${spread ? `<line x1="${e.w}" y1="0" x2="${e.w}" y2="${e.h}" stroke="#222" stroke-width="${e.w / 60}"/>` : ''}</svg>`;
  return svg;
}
function renderInspector() {
  const el = $('#inspector'); el.innerHTML = '';
  if (!S.project) return;
  const e = ed();
  if (S.view === 'cover') return renderCoverInspector(el);
  // What is selected comes first: the frame or text you just clicked.
  if (S.sel && S.sel.kind === 'page') renderFrameSection(el);
  if (S.textSel && S.textSel.kind === 'page') renderTextSection(el);
  const pg = currentPage();
  if (pg != null && e.pages[pg]) {
    const own = pageOwner(e, pg);
    const p = e.pages[own.owner];
    const title = own.spread ? t('pagesN', { a: own.owner + 1, b: own.owner + 2 }) : t('pageN', { n: own.owner + 1 });
    const lays = h('div', { class: 'layouts' });
    const spreadsOk = own.owner % 2 === 1;
    const list = LAYOUT_ORDER.filter((id) => LAYOUTS[id].group !== 'spread' || spreadsOk);
    if (p.layout === 'frei') list.unshift('frei');
    let lastGroup = null;
    // Plain layouts first, then the photo-book (monograph) family, single pages before spreads.
    list.sort((a, b) => rank(a) - rank(b));
    function rank(id) { const L = LAYOUTS[id]; return (L.group === 'spread' ? 2 : 0) + (L.family === 'monograph' ? 1 : 0) + (id === 'frei' ? -1 : 0); }
    for (const id of list) {
      const L0 = LAYOUTS[id];
      const g = `${L0.group === 'spread' ? 'spread' : 'single'}${L0.family === 'monograph' ? '-mono' : ''}`;
      if (g !== lastGroup && g !== 'single') lays.append(h('div', { class: 'lay-group', style: { gridColumn: '1 / -1' } }, g === 'single-mono' ? t('layoutsMono') : g === 'spread' ? t('layoutsSpread') : t('layoutsMonoSpread')));
      lastGroup = g;
      const b = h('button', { class: 'lay', title: tl(id), 'aria-pressed': p.layout === id, html: layoutIcon(id, e, own.owner), style: g.startsWith('spread') ? { gridColumn: 'span 2' } : null });
      b.addEventListener('click', () => { if (id !== 'frei') mutate((pr) => ops.setLayout(pr, e.id, own.owner, id)); });
      lays.append(b);
    }
    const mine = (S.project.customLayouts || []).filter((L) => !L.spread || spreadsOk);
    if (mine.length) {
      lays.append(h('div', { class: 'lay-group', style: { gridColumn: '1 / -1' } }, t('myLayouts')));
      for (const L of mine) {
        const W = L.spread ? 2 * e.w : e.w, H = e.h;
        const svg = `<svg viewBox="0 0 ${W} ${H}"><rect class="pg" width="${W}" height="${H}"/>${L.frames.map((f) => `<rect class="${f.kind === 'text' ? 'tx' : 'im'}" x="${f.x * W}" y="${f.y * H}" width="${f.w * W}" height="${f.h * H}"/>`).join('')}</svg>`;
        const b = h('button', { class: 'lay mine', title: L.name, html: svg, style: L.spread ? { gridColumn: 'span 2' } : null });
        b.addEventListener('click', () => mutate((pr) => ops.applyCustomLayout(pr, e.id, own.owner, L.id)));
        b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (confirm(`${t('delete')}: ${L.name}?`)) mutate((pr) => ops.deleteCustomLayout(pr, L.id)); });
        lays.append(b);
      }
    }
    const copyTo = (mode) => {
      let targets = [];
      const n = (p.slots || []).filter(Boolean).length;
      if (mode === 'next') targets = [own.owner + (own.spread ? 2 : 1)];
      else if (mode === 'all') targets = e.pages.map((x, i) => i).filter((i) => pageOwner(e, i).owner === i && i !== own.owner && (e.pages[i].slots || []).filter(Boolean).length === n);
      else if (mode === 'range') {
        const r = prompt(t('clRangePrompt'));
        if (!r) return;
        for (const part of r.split(',')) {
          const [a, b] = part.split('-').map((x) => parseInt(x, 10));
          if (Number.isFinite(a)) for (let i = a; i <= (Number.isFinite(b) ? b : a); i++) targets.push(i - 1);
        }
      }
      let res;
      mutate((pr) => { res = ops.copyLayout(pr, e.id, own.owner, targets); });
      toast(t('layoutCopied', { n: res?.changed ?? 0 }));
    };
    const selKey = [...S.poolSel][0] || (S.sel?.kind === 'page' ? e.pages[pageOwner(e, S.sel.page).owner]?.slots?.[S.sel.slot]?.key : null);
    el.append(h('div', { class: 'sec' },
      h('h3', {}, t('layout'), h('span', {}, `${title} · ${tl(p.layout)}`)), lays,
      h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('background')),
        h('input', { class: 'input', type: 'color', value: p.bg || e.bg || '#ffffff', style: { width: '60px' }, onchange: (ev) => mutate((pr) => ops.setPageProps(pr, e.id, own.owner, { bg: ev.target.value })) })),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', title: 'Space', onclick: () => mutate((pr) => ops.shuffleLayout(pr, e.id, own.owner)) }, `⟳ ${t('shuffle')}`),
        p.layout !== 'frei' ? h('button', { class: 'btn small', onclick: () => mutate((pr) => ops.toFreeLayout(pr, e.id, own.owner, aspectOf)) }, t('freeEdit')) : null,
        p.layout === 'frei' ? h('button', { class: 'btn small', onclick: () => mutate((pr) => ops.addFreeFrame(pr, e.id, own.owner, 'image')) }, `+ ${t('imageFrame')}`) : null,
        p.layout === 'frei' ? h('button', { class: 'btn small', onclick: () => mutate((pr) => ops.addFreeFrame(pr, e.id, own.owner, 'text')) }, `+ ${t('textFrame')}`) : null,
        p.layout === 'frei' && S.sel?.idx != null && S.sel.page === own.owner ? h('button', { class: 'btn small danger', onclick: () => { mutate((pr) => ops.removeFreeFrame(pr, e.id, own.owner, S.sel.idx)); S.sel = null; renderAll(); } }, t('removeFrame')) : null,
        buildFrames(e, own.owner, aspectOf).some((f) => f.kind === 'text') ? h('button', { class: 'btn small', onclick: () => captions(own.owner) }, t('captionsFromMeta')) : null),
      p.layout === 'frei' ? h('small', { class: 'muted' }, t('freeHint')) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => mutate((pr) => ops.insertPages(pr, e.id, own.owner, 1)) }, `+ ${t('insertBefore')}`),
        h('button', { class: 'btn small', onclick: () => { mutate((pr) => ops.insertPages(pr, e.id, own.owner + (own.spread ? 2 : 1), 1)); } }, `+ ${t('insertAfter')}`),
        h('button', { class: 'btn small danger', onclick: () => { mutate((pr) => ops.deletePages(pr, e.id, own.owner, own.spread ? 2 : 1)); S.page = null; S.sel = null; fixIndexes(); renderAll(); } }, own.spread ? t('deleteSpread') : t('deletePage'))),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', title: '⌘D', onclick: () => mutate((pr) => ops.duplicatePages(pr, e.id, own.owner, own.spread ? 2 : 1)) }, t('duplicatePage')),
        h('button', { class: 'btn small', onclick: () => { const name = prompt(t('layoutName'), tl(p.layout)); if (name != null) mutate((pr) => ops.saveCustomLayout(pr, e.id, own.owner, name)); } }, t('saveLayout'))),
      h('label', { class: 'field' }, h('span', {}, t('copyLayoutTo')),
        sel([['', '…'], ['next', t('clNext')], ['all', t('clAll')], ['range', t('clRange')]], '', (v) => { if (v) copyTo(v); }))),
    h('details', { class: 'sec page-more', open: S.pageMoreOpen || null, ontoggle: (ev) => { S.pageMoreOpen = ev.target.open; } }, h('summary', {}, t('bgGraphic'), ' · ', t('bgPhoto'), ' · ', t('pageMargin')),
      graphicPicker(pageGraphic(e, p), own.spread ? 2 * e.w : e.w, e.h, p.bg || e.bg || '#ffffff', (g) => mutate((pr) => ops.setPageProps(pr, e.id, own.owner, { bgGraphic: g || (e.bgGraphic ? { id: 'none' } : null) }))),
      h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('bgPhoto')),
        p.bgPhoto ? h('img', { class: 'bgthumb', src: thumb(p.bgPhoto.key, 120), alt: '' }) : h('span', { class: 'muted' }, t('bgPhotoNone'))),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', disabled: selKey ? null : true, onclick: () => mutate((pr) => ops.setPageProps(pr, e.id, own.owner, { bgPhoto: { key: selKey, opacity: p.bgPhoto?.opacity ?? 0.35 } })) }, t('bgPhotoSet')),
        p.bgPhoto ? h('button', { class: 'btn small danger', onclick: () => mutate((pr) => ops.setPageProps(pr, e.id, own.owner, { bgPhoto: null })) }, t('remove')) : null),
      p.bgPhoto ? h('label', { class: 'field' }, h('span', {}, `${t('opacity')} ${Math.round((p.bgPhoto.opacity ?? 0.35) * 100)} %`),
        h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: p.bgPhoto.opacity ?? 0.35, onchange: (ev) => mutate((pr) => ops.setPageProps(pr, e.id, own.owner, { bgPhoto: { ...p.bgPhoto, opacity: Number(ev.target.value) } })) })) : null,
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', {}, `${t('pageMargin')} (mm)`), h('input', { class: 'input num', type: 'number', step: 1, min: 0, value: p.margin ?? '', placeholder: String(e.margin ?? 12), onchange: (ev) => mutate((pr) => ops.setPageProps(pr, e.id, own.owner, { margin: ev.target.value === '' ? null : Number(ev.target.value) })) })),
        h('label', { class: 'field' }, h('span', {}, `${t('pageGap')} (mm)`), h('input', { class: 'input num', type: 'number', step: 0.5, min: 0, value: p.gap ?? '', placeholder: String(e.gap ?? 4), onchange: (ev) => mutate((pr) => ops.setPageProps(pr, e.id, own.owner, { gap: ev.target.value === '' ? null : Number(ev.target.value) })) }))),
      e.pageNumbers && e.pageNumbers !== 'none' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!p.hideNumber, onchange: (ev) => mutate((pr) => ops.setPageProps(pr, e.id, own.owner, { hideNumber: ev.target.checked || null })) }), ' ', t('hideNumber')) : null));
  }
  // edition + preflight
  const pf = S.preflight;
  const sec = h('div', { class: 'sec' }, h('h3', {}, t('preflight'), h('span', { class: 'num' }, pf ? `${pf.warnings.filter((w) => w.level === 'error').length} / ${pf.warnings.length}` : '')));
  if (pf) {
    if (!pf.warnings.length) sec.append(h('div', { class: 'okline' }, `✓ ${t('allGood')}`));
    const list = h('div', { class: 'pf' });
    for (const w of pf.warnings.slice(0, 80)) {
      list.append(h('button', {
        onclick: () => { if (w.page != null) { S.spread = Math.floor((w.page + 1) / 2); S.page = w.page; S.view = 'pages'; S.sel = w.slot != null ? { kind: 'page', page: w.page, slot: w.slot } : null; renderAll(); } else if (w.code === 'no-spine') editionModal(e); },
      }, h('span', { class: `lv ${w.level}` }), h('span', {}, `${w.page != null ? `${t('pageShort')} ${w.page + 1}: ` : ''}${t(`pf.${w.code}`, w.params || {})}`)));
    }
    sec.append(list);
  }
  sec.append(h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => editionModal(e) }, t('editionSettings'))));
  el.append(sec);
}
async function captions(page) {
  if (S.pendingSave) await save();
  const r = await api(`/api/project/${S.project.id}/op`, { body: { op: 'fillCaptions', args: { edition: ed().id, page } } });
  S.hist.push(snapshot()); S.project = r.project; changed();
  toast(t('captionsFilled', { n: r.result.filled }));
}
function renderFrameSection(el) {
  const e = ed();
  const { page, slot } = S.sel;
  const p = e.pages[pageOwner(e, page).owner];
  const s = p?.slots[slot];
  if (!s) return;
  const it = S.poolMap.get(s.key);
  const frames = buildFrames(e, pageOwner(e, page).owner, aspectOf);
  const f = frames.find((x) => x.kind === 'image' && x.slot === slot);
  const ppi = it && f ? Math.round(placement(f.w, f.h, it.w, it.h, s, it.focal).ppi) : null;
  const upd = (patch) => mutate((pr) => ops.updateSlot(pr, e.id, page, slot, patch));
  el.append(h('div', { class: 'sec' },
    h('h3', {}, t('frame'), h('span', { class: 'num' }, ppi ? `${ppi} ppi` : '')),
    it ? h('div', { class: 'sel-thumb' }, h('img', { src: thumb(s.key, 200), alt: '' }), h('div', {}, h('div', { class: 'name' }, it.name), h('div', { class: 'muted num' }, `${it.w} × ${it.h} px${it.estimated ? ' (LR)' : ''}`))) : null,
    h('div', { class: 'seg' },
      h('button', { 'aria-selected': s.fit !== 'contain', onclick: () => upd({ fit: undefined }) }, t('fill')),
      h('button', { 'aria-selected': s.fit === 'contain', onclick: () => upd({ fit: 'contain', zoom: 1, ox: 0, oy: 0 }) }, t('contain'))),
    h('label', { class: 'field' }, h('span', {}, `${t('zoom')} ${Math.round((s.zoom || 1) * 100)} %`),
      h('input', { type: 'range', min: 1, max: 4, step: 0.01, value: s.zoom || 1, disabled: s.fit === 'contain', onchange: (ev) => upd({ zoom: Number(ev.target.value) }) })),
    h('label', { class: 'field' }, h('span', {}, t('cropAspect')), sel(CROP_ASPECTS.map(([v, l]) => [v, l || t('cropOriginal')]),
      String(s.aspect || ''), (v) => upd({ aspect: v ? Number(v) : undefined, zoom: 1, ox: 0, oy: 0 }))),
    p.layout === 'frei' && f ? freeFrameFields(e, pageOwner(e, page).owner, f) : null,
    toneRow(s, (tone, strength) => mutate((pr) => ops.setTone(pr, e.id, { page }, slot, tone, strength))),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => mutate((pr) => ops.makeFullBleed(pr, e.id, page, slot)) }, t('fullBleed')),
      h('button', { class: 'btn small', onclick: () => upd({ zoom: 1, ox: 0, oy: 0 }) }, t('resetCrop')),
      h('button', { class: 'btn small danger', onclick: () => { mutate((pr) => ops.removeImage(pr, e.id, page, slot)); S.sel = null; renderInspector(); } }, t('remove')))));
}
function barcodeEl(e, cs, k) {
  const bc = e.coverDesign.barcode;
  if (!bc?.mode || bc.mode === 'none') return null;
  let box, inner = '';
  if (bc.mode === 'placeholder') {
    box = { ...KDP_BOX, ...(bc.x != null ? { x: bc.x, y: bc.y } : defaultBarcodeBox(cs, KDP_BOX, 6.35)) };
    inner = `<text x="${box.width / 2}" y="${box.height / 2}" font-size="3" text-anchor="middle" fill="#999" font-family="system-ui">${t('bcPlaceholder')}</text>`;
  } else {
    const p = parseIsbn(bc.isbn);
    if (!p.ok) return null;
    const g = barcodeBars(p.isbn13, { scale: bc.scale || 1, addon: parseAddon(bc.addon), label: isbnLabel(bc.isbn, p.isbn13) });
    box = { width: g.width, height: g.height, ...(bc.x != null ? { x: bc.x, y: bc.y } : defaultBarcodeBox(cs, g, e.safety ?? 6)) };
    inner = g.bars.map((b) => `<rect x="${b.x.toFixed(3)}" y="${b.y.toFixed(3)}" width="${b.w.toFixed(3)}" height="${b.h.toFixed(3)}"/>`).join('')
      + g.texts.map((x) => `<text x="${x.x}" y="${x.y + x.size}" font-size="${x.size / 0.72}" text-anchor="${x.align === 'center' ? 'middle' : 'start'}" font-family="'bb-work-sans', sans-serif">${String(x.text).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</text>`).join('');
  }
  return h('div', { class: 'barcode', style: { left: `${box.x * k}px`, top: `${box.y * k}px`, width: `${box.width * k}px`, height: `${box.height * k}px` },
    html: `<svg viewBox="0 0 ${box.width} ${box.height}" width="100%" height="100%"><rect width="${box.width}" height="${box.height}" fill="#fff"/><g fill="#000">${inner}</g></svg>` });
}

// ISBN barcode or the print shop's placeholder on the back cover.
function barcodeSection(e) {
  const cd = e.coverDesign;
  const bc = cd.barcode || {};
  const prov = findProvider(e.provider);
  const set = (patch) => mutate((p) => ops.setCover(p, e.id, { barcode: patch }));
  const isbn = bc.isbn ? parseIsbn(bc.isbn) : null;
  const hint = prov.barcode === 'required' ? t('bcRequired', { shop: prov.name }) : prov.barcode === 'placeholder' ? t('bcPlaceholderHint', { shop: prov.name }) : t('bcOptional');
  return h('details', { class: 'sec', open: bc.mode || prov.barcode ? true : null }, h('summary', {}, t('barcode')),
    h('small', { class: 'muted' }, hint),
    h('div', { class: 'seg' },
      h('button', { 'aria-selected': !bc.mode || bc.mode === 'none', onclick: () => set({ mode: 'none' }) }, t('bcNone')),
      h('button', { 'aria-selected': bc.mode === 'isbn', onclick: () => set({ mode: 'isbn' }) }, 'ISBN'),
      h('button', { 'aria-selected': bc.mode === 'placeholder', onclick: () => set({ mode: 'placeholder' }) }, t('bcPlaceholder'))),
    bc.mode === 'isbn' ? h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'ISBN'), h('input', { class: 'input num', value: bc.isbn || '', placeholder: '978-3-…', onchange: (ev) => set({ isbn: ev.target.value.trim() }) }),
        isbn ? h('small', { style: { color: isbn.ok ? 'var(--ok)' : 'var(--error)' } }, isbn.ok ? `✓ ${isbn.isbn13}${isbn.converted ? ` (${t('bcConverted')})` : ''}` : t(`bcErr.${isbn.error}`)) : null),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', {}, t('bcAddon')), h('input', { class: 'input num', value: bc.addon || '', placeholder: '90000', maxlength: 5, onchange: (ev) => set({ addon: ev.target.value.trim() }) })),
        h('label', { class: 'field' }, h('span', {}, `${t('bcScale')} %`), h('input', { class: 'input num', type: 'number', min: 80, max: 200, step: 5, value: Math.round((bc.scale || 1) * 100), onchange: (ev) => set({ scale: Number(ev.target.value) / 100 }) })))) : null);
}

// ---------- text, graphics, tone ----------
function renderTextSection(el) {
  const e = ed();
  const ts = S.textSel;
  const target = ts.kind === 'cover' ? { cover: true } : { page: ts.page };
  const arr = ts.kind === 'cover' ? e.coverDesign.texts || [] : e.pages[pageOwner(e, ts.page).owner]?.texts || [];
  const tx = arr[ts.index];
  if (ts.kind === 'page' && !e.pages[pageOwner(e, ts.page).owner]) return;
  const st = resolveStyle(e, ts.role, tx || {});
  const set = (patch) => mutate((pr) => ops.setTextProps(pr, e.id, target, ts.index, patch));
  const styles = [['', `${t('styleOfRole')}: ${STRINGS[getLang()].roles[ts.role] || ts.role}`], ...customStyles(e).map((x) => [x.id, x.name || x.id])];
  const fams = (S.catalog?.families || []).map((f) => [f.id, f.name]);
  const own = (k) => tx && tx[k] != null;
  el.append(h('div', { class: 'sec' },
    h('h3', {}, t('textSec'), h('span', {}, STRINGS[getLang()].roles[ts.role] || ts.role)),
    h('label', { class: 'field' }, h('span', {}, t('textStyle')), sel(styles, tx?.style || '', (v) => set({ style: v || null }))),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('fontLbl')), sel([['', `– ${S.catalog?.families?.find((f) => f.id === st.family)?.name || st.family}`], ...fams], own('family') ? tx.family : '', (v) => set({ family: v || null }))),
      h('label', { class: 'field' }, h('span', {}, `${t('size')} (pt)`), h('input', { class: 'input num', type: 'number', step: 0.5, min: 4, value: own('size') ? tx.size : '', placeholder: String(st.size), onchange: (ev) => set({ size: ev.target.value === '' ? null : Number(ev.target.value) }) }))),
    h('div', { class: 'seg' },
      ...['left', 'center', 'right'].map((a) => h('button', { 'aria-selected': st.align === a, onclick: () => set({ align: a }) }, { left: '⇤', center: '↔', right: '⇥' }[a])),
      h('button', { 'aria-selected': st.weight >= 600, onclick: () => set({ weight: st.weight >= 600 ? 400 : 700 }), style: { fontWeight: 700 } }, 'B'),
      h('button', { 'aria-selected': !!st.italic, onclick: () => set({ italic: !st.italic }), style: { fontStyle: 'italic' } }, 'I'),
      h('button', { 'aria-selected': !!st.caps, onclick: () => set({ caps: !st.caps }) }, 'AA')),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('tracking')), h('input', { class: 'input num', type: 'number', step: 10, value: own('tracking') ? tx.tracking : '', placeholder: String(st.tracking), onchange: (ev) => set({ tracking: ev.target.value === '' ? null : Number(ev.target.value) }) })),
      h('label', { class: 'field' }, h('span', {}, t('leading')), h('input', { class: 'input num', type: 'number', step: 0.05, min: 0.8, value: own('leading') ? tx.leading : '', placeholder: String(st.leading), onchange: (ev) => set({ leading: ev.target.value === '' ? null : Number(ev.target.value) }) }))),
    h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('textColor')),
      h('div', { class: 'row' }, h('input', { class: 'input', type: 'color', value: st.color || '#1a1a1a', style: { width: '60px' }, onchange: (ev) => set({ color: ev.target.value }) }),
        own('color') ? h('button', { class: 'btn small', onclick: () => set({ color: null }) }, t('autoColor')) : null)),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => {
        const name = prompt(t('styleName'), '');
        if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || `s${Date.now()}`;
        const patch = { name };
        for (const k of STYLE_KEYS) if (st[k] != null) patch[k] = st[k];
        mutate((pr) => { ops.setTextStyle(pr, e.id, id, patch); ops.setTextProps(pr, e.id, target, ts.index, { style: id, ...Object.fromEntries(STYLE_KEYS.map((k) => [k, null])) }); });
      } }, t('saveAsStyle')),
      h('button', { class: 'btn small', onclick: () => stylesModal() }, t('fontsAndStyles')),
      STYLE_KEYS.some((k) => own(k)) ? h('button', { class: 'btn small', onclick: () => set(Object.fromEntries(STYLE_KEYS.map((k) => [k, null]))) }, t('clearFormatting')) : null)));
}

// Position and size of a free frame in mm (numbers instead of dragging).
function freeFrameFields(e, owner, f) {
  const p = e.pages[owner];
  const W = p.spread ? 2 * e.w : e.w, H = e.h;
  const idx = buildFrames(e, owner, aspectOf).indexOf(buildFrames(e, owner, aspectOf).find((x) => x.x === f.x && x.y === f.y && x.kind === f.kind));
  const fr = p.frames?.[idx];
  if (!fr) return null;
  const field = (key, label, total) => h('label', { class: 'field' }, h('span', {}, `${label} (mm)`),
    h('input', { class: 'input num', type: 'number', step: 0.5, value: Math.round(fr[key] * total * 10) / 10, onchange: (ev) => mutate((pr) => ops.updateFreeFrame(pr, e.id, owner, idx, { [key]: Number(ev.target.value) / total })) }));
  return h('div', { class: 'grid4' }, field('x', 'X', W), field('y', 'Y', H), field('w', t('width'), W), field('h', t('height'), H));
}

function graphicPicker(current, W, H, bg, onPick) {
  const grid = h('div', { class: 'gfx-grid' });
  grid.append(h('button', { 'aria-pressed': !current, title: t('none'), onclick: () => onPick(null), html: `<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="${safeColor(bg)}"/><path d="M1 9L9 1" stroke="#c33" stroke-width="0.4"/></svg>` }));
  for (const g of GRAPHICS) {
    const svg = graphicSvg(g.id, 60, 60, { bg, inset: 8, seed: 7 }).replace(/width="[^"]+mm" height="[^"]+mm"/, '');
    grid.append(h('button', { 'aria-pressed': current?.id === g.id, title: nameOf(g), html: svg, onclick: () => onPick({ id: g.id, color: current?.id === g.id ? current.color : undefined, opacity: current?.opacity }) }));
  }
  return h('div', {}, h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('bgGraphic')),
    current ? h('input', { class: 'input', type: 'color', title: t('graphicColor'), value: current.color || GRAPHICS.find((g) => g.id === current.id)?.color || '#888888', style: { width: '46px' }, onchange: (ev) => onPick({ ...current, color: ev.target.value }) }) : null),
  grid,
  current ? h('label', { class: 'field' }, h('span', {}, `${t('opacity')} ${Math.round((current.opacity ?? 1) * 100)} %`), h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: current.opacity ?? 1, onchange: (ev) => onPick({ ...current, opacity: Number(ev.target.value) }) })) : null);
}

function toneRow(slot, onPick) {
  const row = h('div', { class: 'tone-row' });
  const opts = [{ id: null, name: { en: 'Original', de: 'Original' } }, ...TONES];
  for (const o of opts) {
    const st = { backgroundImage: `url("${thumbOf({ key: slot.key, tone: o.id, toneStrength: slot.toneStrength }, 120)}")` };
    row.append(h('button', { 'aria-pressed': (slot.tone || null) === o.id, title: nameOf(o), style: st, onclick: () => onPick(o.id, slot.toneStrength) }));
  }
  return h('div', {}, h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('tone')), h('span', { class: 'muted' }, slot.tone ? nameOf(TONES.find((x) => x.id === slot.tone)) : '')),
    row,
    slot.tone && slot.tone !== 'bw' ? h('label', { class: 'field' }, h('span', {}, `${t('toneStrength')} ${Math.round((slot.toneStrength ?? 0.6) * 100)} %`), h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: slot.toneStrength ?? 0.6, onchange: (ev) => onPick(slot.tone, Number(ev.target.value)) })) : null);
}

// Fonts and text styles of the edition: presets, role styles, own styles, own font files.
function stylesModal() {
  const e = ed();
  modal((close) => {
    const body = h('div', {});
    const draw = () => {
      body.innerHTML = '';
      const e2 = ed();
      const fams = (S.catalog?.families || []).map((f) => [f.id, f.name]);
      const presets = h('div', { class: 'row' }, ...(S.catalog?.presets || []).map((pr) => h('button', { class: 'btn small', style: { fontFamily: cssFamily({ family: pr.family }) }, onclick: () => { mutate((p) => ops.applyStylePreset(p, e2.id, pr.id)); draw(); } }, nameOf(pr))));
      const rows = [...ROLES.map((r) => ({ id: r, label: STRINGS[getLang()].roles[r] || r, role: r })), ...customStyles(e2).map((x) => ({ id: x.id, label: x.name || x.id, role: 'body' }))];
      const list = h('div', { class: 'list' });
      for (const r of rows) {
        const st = resolveStyle(e2, r.role, ROLES.includes(r.id) ? {} : { style: r.id });
        const set = (patch) => { mutate((p) => ops.setTextStyle(p, e2.id, r.id, patch)); draw(); };
        list.append(h('div', { class: 'li', style: { display: 'block' } },
          h('div', { class: 'row between' }, h('strong', {}, r.label),
            !ROLES.includes(r.id) ? h('button', { class: 'btn small danger', onclick: () => set(null) }, t('delete')) : (e2.textStyles?.[r.id] ? h('button', { class: 'btn small', onclick: () => set(null) }, t('reset')) : null)),
          h('div', { class: 'style-preview', style: { fontFamily: cssFamily(st), fontWeight: st.weight, fontStyle: st.italic ? 'italic' : 'normal', fontSize: `${Math.min(28, st.size * 1.4)}px`, letterSpacing: `${st.tracking / 1000}em`, textTransform: st.caps ? 'uppercase' : 'none' } }, t('stylePreviewText')),
          h('div', { class: 'grid2' },
            h('label', { class: 'field' }, h('span', {}, t('fontLbl')), sel(fams, st.family, (v) => set({ family: v }))),
            h('label', { class: 'field' }, h('span', {}, `${t('size')} (pt)`), h('input', { class: 'input num', type: 'number', step: 0.5, value: st.size, onchange: (ev) => set({ size: Number(ev.target.value) }) }))),
          h('div', { class: 'grid2' },
            h('label', { class: 'field' }, h('span', {}, t('weight')), sel([[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [700, 'Bold']], st.weight, (v) => set({ weight: Number(v) }))),
            h('label', { class: 'field' }, h('span', {}, t('tracking')), h('input', { class: 'input num', type: 'number', step: 10, value: st.tracking, onchange: (ev) => set({ tracking: Number(ev.target.value) }) }))),
          h('div', { class: 'row' },
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.italic, onchange: (ev) => set({ italic: ev.target.checked }) }), ' ', t('italic')),
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.caps, onchange: (ev) => set({ caps: ev.target.checked }) }), ' ', t('caps')),
            h('label', { class: 'field', style: { flex: 1 } }, h('span', {}, t('leading')), h('input', { class: 'input num', type: 'number', step: 0.05, value: st.leading, onchange: (ev) => set({ leading: Number(ev.target.value) }) })))));
      }
      body.append(
        h('label', { class: 'field' }, h('span', {}, t('bookFont')), sel(fams, e2.font && !['sans', 'serif'].includes(e2.font) ? e2.font : resolveStyle(e2, 'body').family, (v) => { mutate((p) => ops.updateEdition(p, e2.id, { font: v })); draw(); })),
        h('h3', { class: 'small-h' }, t('stylePresets')), presets,
        h('h3', { class: 'small-h' }, t('textStyles')), list,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => { const name = prompt(t('styleName')); if (name) { mutate((p) => ops.setTextStyle(p, e2.id, name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-'), { name })); draw(); } } }, `+ ${t('newStyle')}`),
          h('button', { class: 'btn small', onclick: async () => {
            try {
              const pth = await pickPath('file', t('addFont'));
              if (!pth) return;
              if (S.pendingSave) await save();
              const r = await api(`/api/project/${S.project.id}/op`, { body: { op: 'addFont', args: { path: pth } } });
              S.project = r.project; S.catalog = await api(`/api/design-catalog?p=${S.project.id}`);
              $('#fontcss').href = `/api/fonts.css?p=${S.project.id}&v=${Date.now()}`;
              toast(t('fontAdded', { name: r.result.added[0]?.name || '' })); draw(); renderAll();
            } catch (err) { toast(err.message); }
          } }, `+ ${t('addFont')}`)),
        h('small', { class: 'muted' }, t('fontNote')));
    };
    draw();
    return [h('h2', {}, `${t('fontsStylesTitle')} · ${e.name}`), body, h('div', { class: 'foot' }, h('button', { class: 'btn primary', onclick: close }, t('close')))];
  }, { wide: true });
}

function renderCoverInspector(el) {
  const e = ed();
  if (S.textSel?.kind === 'cover') renderTextSection(el);
  const cd = e.coverDesign;
  const lays = h('div', { class: 'layouts', style: { gridTemplateColumns: '1fr 1fr' } });
  const cs = coverSpec(e);
  for (const id of COVER_ORDER) {
    const frames = COVER_LAYOUTS[id].build(cs);
    const svg = `<svg viewBox="0 0 ${cs.W} ${cs.H}"><rect class="pg" width="${cs.W}" height="${cs.H}"/>${frames.map((f) => `<rect class="${f.kind === 'image' ? 'im' : 'tx'}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.kind === 'image' ? f.h : Math.min(f.h, 12)}"/>`).join('')}</svg>`;
    const b = h('button', { class: 'lay', title: tl(id), 'aria-pressed': (cd.layout || 'cover-front') === id, html: svg });
    b.addEventListener('click', () => mutate(() => { ops.setCoverLayout(e, id); }));
    lays.append(b);
  }
  const spineIn = h('input', { class: 'input num', type: 'number', step: '0.1', min: 0, value: e.spine ?? '', placeholder: spineOf({ ...e, spine: null }).mm.toFixed(1), onchange: (ev) => mutate((p) => ops.updateEdition(p, e.id, { spine: ev.target.value === '' ? null : Number(ev.target.value) })) });
  el.append(h('div', { class: 'sec' }, h('h3', {}, t('layout')), lays,
    h('label', { class: 'field' }, h('span', {}, t('spine')), spineIn, h('small', {}, t('spineHint', { n: e.pages.length, e: spineOf({ ...e, spine: null }).mm.toFixed(1) }))),
    h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('background')), h('input', { class: 'input', type: 'color', value: cd.bg || '#ffffff', style: { width: '60px' }, onchange: (ev) => mutate(() => { cd.bg = ev.target.value; }) })),
    graphicPicker(cd.bgGraphic, cs.W, cs.H, cd.bg || '#ffffff', (g) => mutate((p) => ops.setCover(p, e.id, { bgGraphic: g })))));
  el.append(barcodeSection(e));
  if (S.sel?.kind === 'cover') {
    const s = cd.slots[S.sel.slot];
    if (s) el.append(h('div', { class: 'sec' }, h('h3', {}, t('frame')),
      h('div', { class: 'seg' },
        h('button', { 'aria-selected': s.fit !== 'contain', onclick: () => mutate(() => { delete s.fit; }) }, t('fill')),
        h('button', { 'aria-selected': s.fit === 'contain', onclick: () => mutate(() => { s.fit = 'contain'; }) }, t('contain'))),
      h('label', { class: 'field' }, h('span', {}, t('zoom')), h('input', { type: 'range', min: 1, max: 4, step: 0.01, value: s.zoom || 1, onchange: (ev) => mutate(() => { s.zoom = Number(ev.target.value); }) })),
      toneRow(s, (tone, strength) => mutate((p) => ops.setTone(p, e.id, { cover: true }, S.sel.slot, tone, strength))),
      h('button', { class: 'btn small danger', onclick: () => mutate(() => { cd.slots[S.sel.slot] = null; }) }, t('remove'))));
  }
}

// ---------- modals ----------
function modal(content, { wide = false } = {}) {
  const root = $('#modal-root');
  const back = h('div', { class: 'backdrop' });
  const box = h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' });
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
  const esc = (ev) => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  back.addEventListener('mousedown', (ev) => { if (ev.target === back) close(); });
  box.append(...[].concat(content(close)).filter((x) => x != null && x !== false));
  back.append(box); root.append(back);
  box.querySelector('input,select,button')?.focus();
  return close;
}
async function pickPath(kind, prompt) {
  if (window.billerbook?.pick) return window.billerbook.pick(kind, prompt);
  const r = await api('/api/pick', { body: { kind, prompt } });
  return r.path;
}
function pathField(label, value, { kind = 'folder', hint, onChange } = {}) {
  const input = h('input', { class: 'input', value: value || '', placeholder: t('pathPlaceholder'), onchange: (ev) => onChange?.(ev.target.value.trim()) });
  const btn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    try { const pth = await pickPath(kind, label); if (pth) { input.value = pth; onChange?.(pth); } } catch (e) { toast(e.message); }
  } }, t('choose'));
  return h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, input, btn), hint ? h('small', {}, hint) : null);
}
function sel(options, value, onChange) {
  const s = h('select', { class: 'input', onchange: (ev) => onChange(ev.target.value) });
  for (const [v, l] of options) s.append(h('option', { value: v, selected: String(v) === String(value) }, l));
  return s;
}

function projectsModal(force = false) {
  modal((close) => {
    const list = h('div', { class: 'list' }, '…');
    api('/api/projects').then((ps) => {
      list.innerHTML = '';
      if (!ps.length) list.append(h('div', { class: 'li muted' }, '—'));
      for (const p of ps) list.append(h('div', { class: 'li' }, h('span', { class: 'grow' }, p.name), h('span', { class: 'muted' }, p.editions.map((e) => `${e.name} ${e.pages}`).join(' · ')),
        h('button', { class: 'btn small', onclick: () => { close(); openProject(p.id); } }, t('open'))));
    });
    const st = { name: '', folder: '' };
    return [
      !S.project ? h('div', { class: 'welcome' }, h('img', { src: 'icon.png', alt: '' }), h('div', {}, h('h2', {}, t('welcomeTitle')), h('p', { class: 'muted' }, t('welcomeText')))) : null,
      h('h2', {}, t('projects')), list,
      h('h2', { style: { fontSize: '14px' } }, t('newProject')),
      h('label', { class: 'field' }, h('span', {}, t('projectName')), h('input', { class: 'input', placeholder: t('projectPlaceholder'), oninput: (ev) => { st.name = ev.target.value; } })),
      pathField(t('folders'), '', { onChange: (v) => { st.folder = v; } }),
      h('small', { class: 'muted' }, `${t('lightroom')}: ${t('sources')} →`),
      h('div', { class: 'foot' }, !force ? h('button', { class: 'btn', onclick: close }, t('cancel')) : null,
        h('button', { class: 'btn primary', onclick: async () => {
          const p = await api('/api/projects', { body: { name: st.name || 'Photo book', folder: st.folder || undefined } });
          close(); await openProject(p.id); document.body.classList.remove('no-project');
          if (!st.folder) sourcesModal();
        } }, t('create'))),
    ];
  });
}

function sourcesModal() {
  const pr = S.project;
  const src = structuredClone(pr.sources || { folders: [] });
  src.folders ||= [];
  modal((close) => {
    const folderList = h('div', { class: 'list' });
    const drawFolders = () => {
      folderList.innerHTML = '';
      if (!src.folders.length) folderList.append(h('div', { class: 'li muted' }, '—'));
      src.folders.forEach((f, i) => folderList.append(h('div', { class: 'li' }, h('span', { class: 'grow', title: f }, f), h('button', { class: 'btn small', onclick: () => { src.folders.splice(i, 1); drawFolders(); } }, '×'))));
    };
    drawFolders();
    const lr = (src.lightroom ||= { catalog: '', collections: [], exportFolder: '' });
    lr.collections ||= [];
    const colList = h('div', { class: 'list' }, h('div', { class: 'li muted' }, '—'));
    const fmt = { provider: 'wmd', format: 'hc-a4-quer' };
    const loadCols = async () => {
      if (!lr.catalog) return;
      colList.innerHTML = '<div class="li muted">…</div>';
      try {
        const cols = await api('/api/lightroom/collections', { body: { catalog: lr.catalog } });
        colList.innerHTML = '';
        for (const c of cols) {
          const cb = h('input', { type: 'checkbox', checked: lr.collections.includes(c.id), onchange: (ev) => { if (ev.target.checked) lr.collections.push(c.id); else lr.collections = lr.collections.filter((x) => x !== c.id); } });
          colList.append(h('label', { class: 'li' }, cb, h('span', { class: 'grow', title: c.path }, c.path), h('span', { class: `tag${c.type === 'book' ? ' book' : ''}` }, c.type === 'book' ? t('books') : t('collection')), h('span', { class: 'muted num' }, c.count),
            c.type === 'book' ? h('button', { class: 'btn small', type: 'button', title: t('importBookHint'), onclick: async (ev) => {
              ev.preventDefault();
              await saveSources();
              const r = await api(`/api/project/${pr.id}/lightroom-book`, { body: { collectionId: c.id, name: c.name, ...fmt } });
              toast(t('imported', { n: r.pages }));
              close(); await reloadProject({ pool: true }); S.ed = S.project.editions.length - 1; S.spread = 0; renderAll();
            } }, t('importBook')) : null));
        }
      } catch (e) { colList.innerHTML = ''; colList.append(h('div', { class: 'li', style: { color: 'var(--error)' } }, e.message)); }
    };
    loadCols();
    const c1 = { collections: [...(src.captureone?.collections || [])], exportFolder: src.captureone?.exportFolder || '', changed: false };
    const c1List = h('div', { class: 'list' }, h('div', { class: 'li muted' }, src.captureone ? `${src.captureone.document || 'Capture One'}: ${src.captureone.snapshot?.length || 0} ${t('photos')}` : '—'));
    const loadC1 = async () => {
      c1List.innerHTML = '<div class="li muted">…</div>';
      try {
        const r = await api('/api/captureone/collections', { body: {} });
        c1List.innerHTML = '';
        if (!r.collections.length) c1List.append(h('div', { class: 'li muted' }, '—'));
        for (const c of r.collections) {
          const cb = h('input', { type: 'checkbox', checked: c1.collections.includes(c.id), onchange: (ev) => { c1.changed = true; c1.collections = ev.target.checked ? [...c1.collections, c.id] : c1.collections.filter((x) => x !== c.id); } });
          c1List.append(h('label', { class: 'li' }, cb, h('span', { class: 'grow', title: c.path.join(' › ') }, c.path.join(' › ')), h('span', { class: 'tag' }, c.kind), h('span', { class: 'muted num' }, c.count ?? '')));
        }
      } catch (e) { c1List.innerHTML = ''; c1List.append(h('div', { class: 'li', style: { color: 'var(--error)' } }, e.message)); }
    };
    const saveC1 = async () => {
      if (!c1.changed) return;
      const r = await api(`/api/project/${pr.id}/captureone`, { body: { collections: c1.collections, exportFolder: c1.exportFolder || null } });
      if (r.variants) toast(t('c1Result', { n: r.usable, m: r.needExport }));
    };
    const prov = findProvider(fmt.provider);
    const saveSources = async () => {
      const clean = { ...src, lightroom: lr.catalog ? lr : undefined };
      await api(`/api/project/${pr.id}/op`, { body: { op: 'setSources', args: { sources: clean }, returnProject: false } });
    };
    return [
      h('h2', {}, t('sources')),
      h('div', { class: 'field' }, h('span', {}, t('folders')), folderList),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => {
        try { const pth = await pickPath('folder', t('addFolder')); if (pth) { src.folders.push(pth); drawFolders(); } }
        catch { const p = prompt(t('pathPlaceholder')); if (p) { src.folders.push(p); drawFolders(); } }
      } }, `+ ${t('addFolder')}`)),
      h('h2', { style: { fontSize: '14px' } }, t('lightroom')),
      pathField(t('catalog'), lr.catalog, { kind: 'file', onChange: (v) => { lr.catalog = v; loadCols(); } }),
      h('div', { class: 'field' }, h('span', {}, t('collections')), colList),
      h('div', { class: 'row muted small' }, t('lrPluginHint'), ' ',
        h('button', { class: 'btn small', onclick: async () => { try { const r = await api('/api/lightroom/install-plugin', { method: 'POST', body: {} }); toast(t('lrPluginInstalled')); console.log(r); } catch (err) { alert(err.message); } } }, t('lrPlugin'))),
      h('div', { class: 'row muted' }, `${t('importBook')} → `, sel(prov.formats.map((f) => [f.id, f.label[getLang()] || f.label.en]), fmt.format, (v) => { fmt.format = v; })),
      pathField(t('exportFolder'), lr.exportFolder, { hint: t('exportFolderHint'), onChange: (v) => { lr.exportFolder = v; } }),
      h('h2', { style: { fontSize: '14px' } }, 'Capture One'),
      h('div', { class: 'row muted small' }, t('c1Hint'), ' ', h('button', { class: 'btn small', type: 'button', onclick: loadC1 }, t('c1Load'))),
      h('div', { class: 'field' }, h('span', {}, t('collections')), c1List),
      pathField(t('c1ExportFolder'), c1.exportFolder, { hint: t('c1ExportHint'), onChange: (v) => { c1.exportFolder = v; c1.changed = true; } }),
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('cancel')),
        h('button', { class: 'btn primary', onclick: async () => { await saveSources(); try { await saveC1(); } catch (err) { alert(err.message); return; } close(); setStatus('…'); await reloadProject({ pool: true }); setStatus(''); } }, t('apply'))),
    ];
  }, { wide: true });
}

const lab = (o) => (o && typeof o === 'object' ? o[getLang()] || o.en : o || '');
const SPEC_KEYS = ['provider', 'format', 'binding', 'w', 'h', 'paper', 'bleed', 'safety', 'glue', 'interior', 'blankEnds', 'pageMin', 'pageMax', 'pageStep',
  'colourWanted', 'spineTextMin', 'cover', 'spineRule', 'profileStatus'];
const EDIT_KEYS = ['name', ...SPEC_KEYS.filter((k) => !['provider', 'format'].includes(k)), 'spine', 'margin', 'gutter', 'gap', 'ppi', 'colorMode', 'icc', 'font', 'bg', 'pageNumbers', 'sharpen'];

async function refreshProviders() {
  const list = await api('/api/profiles');
  registerProfiles(list.filter((p) => p.user));
  S.sys.providers = list;
}

function downloadJson(name, data) {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' }, onchange: () => { resolve(inp.files[0] || null); inp.remove(); } });
    document.body.append(inp); inp.click();
  });
}

function editionModal(existing) {
  const isNew = !existing;
  const e = existing ? structuredClone(existing) : { name: '', provider: 'wmd', format: 'sc-a4-hoch', copyFrom: '' };
  if (isNew) Object.assign(e, ops.addEdition({ editions: [] }, { provider: 'wmd', format: 'sc-a4-hoch' }), { name: '' });
  const L = getLang();
  modal((close) => {
    const body = h('div', { style: { display: 'grid', gap: '14px' } });
    const draw = () => {
      body.innerHTML = '';
      const prov = findProvider(e.provider);
      const f = prov.formats.find((x) => x.id === e.format) || prov.formats[0];
      const papers = papersOf(prov, e.binding);
      const applyFormat = (provider, format, paper) => {
        const spec = editionSpecFrom(provider, format, paper);
        for (const k of SPEC_KEYS) e[k] = structuredClone(spec[k]);
        e.colorMode = spec.colourWanted === 'srgb' ? 'rgb' : 'cmyk';
        delete e.coverTemplate; e.spine = null;
        draw();
      };
      const num = (key, label, step = 0.5) => h('label', { class: 'field' }, h('span', {}, label), h('input', { class: 'input num', type: 'number', step, value: e[key] ?? '', onchange: (ev) => { e[key] = ev.target.value === '' ? null : Number(ev.target.value); draw(); } }));
      const cnum = (key, label) => h('label', { class: 'field' }, h('span', {}, label), h('input', { class: 'input num', type: 'number', step: 0.1, value: e.cover?.[key] ?? 0, onchange: (ev) => { e.cover = { ...e.cover, [key]: Number(ev.target.value) || 0 }; draw(); } }));
      const iccOpts = [['', t('noIcc')], ...S.sys.icc.map((p) => [p, p.split('/').pop()])];
      if (e.icc && !S.sys.icc.includes(e.icc)) iccOpts.push([e.icc, e.icc.split('/').pop()]);
      const preview = { ...e, pages: existing?.pages || [] };
      const sp = spineOf(preview), cs = coverSpec(preview);
      const status = e.profileStatus || 'manual';
      const srcLabel = { formula: t('spFormula'), table: t('spTable'), estimate: t('spEstimate'), template: t('spTemplate'), manual: t('spManual') }[sp.source] || sp.source;
      const ruleUrl = e.spineRule?.url;
      const pagesRule = [e.pageMin ? `${t('min')} ${e.pageMin}` : null, e.pageMax ? `${t('max')} ${e.pageMax}` : null, e.pageStep ? `${t('step')} ${e.pageStep}` : null].filter(Boolean).join(' · ');
      body.append(...[
        h('label', { class: 'field' }, h('span', {}, 'Name'), h('input', { class: 'input', value: e.name, placeholder: isNew ? t('editionPlaceholder') : '', oninput: (ev) => { e.name = ev.target.value; } })),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, t('provider')), sel(allProviders().map((p) => [p.id, `${p.user ? '★ ' : ''}${p.name}${p.region ? ` · ${p.region}` : ''}`]), e.provider, (v) => applyFormat(v, findProvider(v).formats[0].id))),
          h('label', { class: 'field' }, h('span', {}, t('format')), sel(prov.formats.map((x) => [x.id, `${lab(x.label)} · ${x.w} × ${x.h} mm`]), e.format, (v) => applyFormat(e.provider, v)))),
        h('div', { class: `profile-note st-${status}` },
          h('b', {}, t(`st.${status}`)), ' ', prov.notes ? lab(prov.notes) : '',
          prov.sources?.length ? h('div', { class: 'srcs' }, `${t('sources')}: `, ...prov.sources.map((u, i) => h('a', { href: u, target: '_blank', rel: 'noopener' }, `[${i + 1}]`)), prov.checked ? ` · ${t('checked')} ${prov.checked}` : '') : null),
        f.custom ? h('div', { class: 'grid3' }, num('w', `${t('width')} (mm)`, 1), num('h', `${t('height')} (mm)`, 1),
          h('label', { class: 'field' }, h('span', {}, t('binding')), sel(Object.keys(prov.bindings).map((b) => [b, t(b)]), e.binding, (v) => { const fm = prov.formats.find((x) => x.binding === v) || f; applyFormat(e.provider, fm.id); e.binding = v; }))) : null,
        papers.length ? h('label', { class: 'field' }, h('span', {}, t('paper')), sel(papers.map((x) => [x.id, lab(x.label)]), e.paper, (v) => applyFormat(e.provider, e.format, v))) : null,
        h('fieldset', { class: 'box' }, h('legend', {}, t('spineAndCover')),
          h('div', { class: 'spine-line' },
            h('span', { class: 'big' }, `${sp.mm.toFixed(1)} mm`), ' ', h('span', { class: `tag ${sp.exact ? 'ok' : 'warn'}` }, srcLabel),
            ' ', t('forPages', { n: preview.pages.length }),
            ruleUrl && !sp.exact ? h('a', { href: ruleUrl, target: '_blank', rel: 'noopener', class: 'calc-link' }, t('printerCalc')) : null),
          h('div', { class: 'muted small' }, t('coverSize', { w: cs.W.toFixed(1), h: cs.H.toFixed(1) })),
          h('div', { class: 'grid2' },
            h('label', { class: 'field' }, h('span', {}, t('spineManual')), h('input', { class: 'input num', type: 'number', step: 0.1, min: 0, value: e.spine ?? '', placeholder: sp.source !== 'manual' ? sp.mm.toFixed(1) : '', onchange: (ev) => { e.spine = ev.target.value === '' ? null : Number(ev.target.value); draw(); } })),
            h('div', { class: 'field' }, h('span', {}, t('coverTemplate')),
              e.coverTemplate ? h('div', { class: 'row' }, `${e.coverTemplate.W} × ${e.coverTemplate.H} mm `, h('button', { class: 'btn small', onclick: () => { delete e.coverTemplate; draw(); } }, t('remove')))
                : h('button', { class: 'btn small', onclick: async () => {
                  const file = await pickFile('application/pdf');
                  if (!file) return;
                  try {
                    const r = await fetch('/api/cover-template/read', { method: 'POST', headers: { 'content-type': 'application/pdf', 'x-client': CLIENT }, body: file });
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error || r.statusText);
                    e.coverTemplate = { W: j.W, H: j.H, source: 'pdf' }; toast(t('templateRead', { w: j.W, h: j.H })); draw();
                  } catch (err) { alert(err.message); }
                } }, t('importTemplate')))),
          h('details', {}, h('summary', {}, t('coverDetails')),
            h('div', { class: 'grid3' }, cnum('wrap', `${t('wrap')} (mm)`), cnum('overW', `${t('overW')} (mm)`), cnum('overH', `${t('overH')} (mm)`)),
            h('div', { class: 'grid3' }, cnum('joint', `${t('joint')} (mm)`), cnum('hinge', `${t('hingeZone')} (mm)`),
              h('label', { class: 'field' }, h('span', {}, t('coverMode')), sel([['spread', t('cmSpread')], ['pages', t('cmPages')], ['none', t('cmNone')]], e.cover?.mode || 'spread', (v) => { e.cover = { ...e.cover, mode: v }; }))))),
        h('fieldset', { class: 'box' }, h('legend', {}, t('interiorFile')),
          h('div', { class: 'grid2' },
            h('label', { class: 'field' }, h('span', {}, t('interiorLayout')), sel([['single', t('ilSingle')], ['spreads', t('ilSpreads')]], e.interior || 'single', (v) => { e.interior = v; draw(); })),
            h('label', { class: 'field' }, h('span', {}, t('colourWanted')), h('div', { class: 'muted', style: { paddingTop: '8px' } }, e.colourWanted === 'srgb' ? 'sRGB' : 'CMYK'))),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!e.blankEnds, onchange: (ev) => { e.blankEnds = ev.target.checked; } }), ' ', t('blankEnds')),
          h('div', { class: 'muted small' }, `${t('pageRules')}: ${pagesRule || '–'}`),
          h('div', { class: 'grid3' }, num('bleed', `${t('bleed')} (mm)`), num('safety', `${t('safety')} (mm)`), num('glue', `${t('glue')} (mm)`))),
        h('div', { class: 'grid3' }, num('margin', `${t('margin')} (mm)`), num('gutter', `${t('gutter')} (mm)`), num('gap', `${t('gap')} (mm)`)),
        h('div', { class: 'grid3' },
          h('label', { class: 'field' }, h('span', {}, t('colorMode')), sel([['cmyk', t('cmyk')], ['rgb', t('rgb')]], e.colorMode, (v) => { e.colorMode = v; })),
          h('label', { class: 'field' }, h('span', {}, t('icc')), sel(iccOpts, e.icc || '', (v) => { e.icc = v || null; })),
          num('ppi', t('resolution'), 10)),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, t('pageNumbers')), sel([['none', t('pnNone')], ['outer', t('pnOuter')], ['center', t('pnCenter')]], e.pageNumbers || 'none', (v) => { e.pageNumbers = v; })),
          h('label', { class: 'field' }, h('span', {}, t('sharpen')), sel([['none', t('none')], ['low', t('shLow')], ['standard', t('shStandard')], ['high', t('shHigh')]], e.sharpen || 'standard', (v) => { e.sharpen = v; }))),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, t('fontLbl')), sel((S.catalog?.families || []).map((f) => [f.id, f.name]), resolveStyle(e, 'body').family, (v) => { e.font = v; })),
          h('label', { class: 'field' }, h('span', {}, t('pageBg')), h('input', { class: 'input', type: 'color', value: e.bg || '#ffffff', onchange: (ev) => { e.bg = ev.target.value; } }))),
        isNew ? h('label', { class: 'field' }, h('span', {}, t('copyFrom')), sel([['', t('emptyEdition')], ...S.project.editions.map((x) => [x.id, x.name])], e.copyFrom, (v) => { e.copyFrom = v; })) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => { const pr = profileFromEdition({ ...e, pages: [] }, prompt(t('profileName'), `${prov.name} (${lab(f.label)})`) || undefined); downloadJson(`${pr.id}.billerbook-profile.json`, pr); } }, t('exportProfile')),
          h('button', { class: 'btn small', onclick: async () => {
            const file = await pickFile('application/json,.json');
            if (!file) return;
            try {
              const pr = JSON.parse(await file.text());
              const errs = validateProfile(pr);
              if (errs.length) throw new Error(`${t('invalidProfile')}: ${errs.join(', ')}`);
              pr.user = true;
              await api('/api/profiles', { method: 'POST', body: pr });
              await refreshProviders();
              applyFormat(pr.id, pr.formats[0].id);
            } catch (err) { alert(err.message); }
          } }, t('importProfile'))),
      ].filter(Boolean));
    };
    draw();
    return [
      h('h2', {}, isNew ? t('newEdition') : t('editionSettings')), body,
      h('div', { class: 'foot' },
        !isNew && S.project.editions.length > 1 ? h('button', { class: 'btn danger left', onclick: () => { if (confirm(`${t('delete')}: ${existing.name}?`)) { mutate((p) => { p.editions = p.editions.filter((x) => x.id !== existing.id); }); S.ed = 0; fixIndexes(); renderAll(); close(); } } }, t('delete')) : null,
        h('button', { class: 'btn', onclick: close }, t('cancel')),
        h('button', { class: 'btn primary', onclick: () => {
          const patch = {};
          for (const k of EDIT_KEYS) patch[k] = structuredClone(e[k]);
          const tpl = e.coverTemplate ? structuredClone(e.coverTemplate) : null;
          if (isNew) {
            mutate((p) => {
              const ne = ops.addEdition(p, { name: e.name || t('edition'), provider: e.provider, format: e.format, paper: e.paper, copyFrom: e.copyFrom || undefined });
              const { name, ...rest } = patch;
              Object.assign(ne, rest, { provider: e.provider, format: e.format });
              if (tpl) ne.coverTemplate = tpl;
              ops.normalize(ne);
            });
            S.ed = S.project.editions.length - 1; S.spread = 0;
          } else mutate((p) => { const x = ops.getEdition(p, existing.id); Object.assign(x, patch, { provider: e.provider, format: e.format }); if (tpl) x.coverTemplate = tpl; else delete x.coverTemplate; ops.normalize(x); });
          renderAll(); loadPreflight(); close();
        } }, isNew ? t('create') : t('save'))),
    ];
  }, { wide: true });
}

// A selection is laid out in the chosen order, not in the order the photos were clicked.
function orderedSelection(order) {
  return ops.orderItems(S.pool.filter((it) => S.poolSel.has(it.key)), order).map((it) => it.key);
}

function autoModal() {
  const o = { perPage: 3, highlightRating: 5, filter: 'unplaced', minRating: 0, breakHours: 36, replace: false, style: 'grid', rightHand: false, order: S.project.sources?.lightroom?.catalog ? 'lightroom' : 'time' };
  modal((close) => [
    h('h2', {}, t('autoTitle')),
    h('label', { class: 'field' }, h('span', {}, t('autoStyle')), sel([['grid', t('autoGrid')], ['monograph', t('autoMono')]], o.style, (v) => { o.style = v; })),
    h('label', { class: 'row' }, h('input', { type: 'checkbox', onchange: (ev) => { o.rightHand = ev.target.checked; } }), t('autoRightHand')),
    h('label', { class: 'field' }, h('span', {}, t('autoOrder')), sel([
      ...(S.project.sources?.lightroom?.catalog ? [['lightroom', t('orderLightroom')]] : []),
      ['time', t('orderTime')], ['name', t('orderName')], ['rating', t('orderRating')]], o.order, (v) => { o.order = v; })),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('perPage')), h('input', { class: 'input num', type: 'number', min: 1, max: 12, value: o.perPage, onchange: (ev) => { o.perPage = Number(ev.target.value); } })),
      h('label', { class: 'field' }, h('span', {}, t('highlight')), sel([[0, t('none')], [3, '★★★'], [4, '★★★★'], [5, '★★★★★']], o.highlightRating, (v) => { o.highlightRating = Number(v); }))),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('which')), sel([['unplaced', t('onlyUnplaced')], ['nowhere', t('onlyNowhere')], ['all', t('allImages')]], o.filter, (v) => { o.filter = v; })),
      h('label', { class: 'field' }, h('span', {}, t('minStars')), sel([[0, '–'], [1, '★'], [2, '★★'], [3, '★★★'], [4, '★★★★'], [5, '★★★★★']], o.minRating, (v) => { o.minRating = Number(v); }))),
    h('label', { class: 'field' }, h('span', {}, t('breakGaps')), h('input', { class: 'input num', type: 'number', min: 0, value: o.breakHours, onchange: (ev) => { o.breakHours = Number(ev.target.value); } })),
    S.poolSel.size > 1 ? h('small', { class: 'muted' }, t('onlySelected', { n: S.poolSel.size })) : null,
    h('label', { class: 'row' }, h('input', { type: 'checkbox', onchange: (ev) => { o.replace = ev.target.checked; } }), t('replacePages')),
    h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('cancel')),
      h('button', { class: 'btn primary', onclick: async () => {
        const args = { edition: ed().id, ...o, pad: true, keys: S.poolSel.size > 1 ? orderedSelection(o.order) : undefined };
        if (S.pendingSave) await save();
        const r = await api(`/api/project/${S.project.id}/op`, { body: { op: 'autoFill', args } });
        S.hist.push(snapshot()); S.project = r.project; changed();
        toast(t('pagesCreated', { n: r.result.pages }));
        close();
      } }, t('start'))),
  ]);
}

// Everything that makes files lives here, grouped by what the file is for. The preflight state
// sits at the top, so checking comes before printing without a separate wizard.
function exportModal() {
  const e = ed();
  const o = { parts: new Set(['interior', 'cover']), outDir: '', pages: '', images: { mode: 'spreads', format: 'jpeg', width: 3000 } };
  modal((close) => {
    const prog = h('div', { class: 'progress', style: { display: 'none' } }, h('i'));
    const info = h('div', { class: 'muted' });
    const results = h('div', { class: 'list', style: { display: 'none' } });
    const label = (part, f) => {
      if (part === 'interior' || part === 'cover') return `${t(part)} · ${f.size} · ${f.colorMode}`;
      if (part === 'filelist') return `${t('xFilelist')} · ${f.photos} ${t('photos')}${f.withoutFile ? ` · ${f.withoutFile} ${t('withoutFile')}` : ''}`;
      if (part === 'package') return `${t('xPackage')} · ${f.photos} ${t('photos')}`;
      if (part === 'html') return `${t('xHtml')} · ${f.spreads} ${t('spreads')}`;
      if (part === 'originals') return `${t('xOriginals')} · ${f.copied}${f.skipped?.length ? ` · ${f.skipped.length} ${t('withoutFile')}` : ''}`;
      return `${t(`x${part[0].toUpperCase()}${part.slice(1)}`)}${f.files ? ` · ${f.files} ${t('files')}` : ''}`;
    };
    const startBtn = h('button', { class: 'btn primary', onclick: async () => {
      if (!o.parts.size) return;
      startBtn.disabled = true; prog.style.display = ''; results.innerHTML = ''; results.style.display = 'none';
      if (S.pendingSave) await save();
      const job = await api(`/api/project/${S.project.id}/export`, { body: { edition: e.id, parts: [...o.parts], outDir: o.outDir || undefined, images: o.images, lang: getLang(), pages: o.pages || undefined } });
      const poll = async () => {
        const j = await api(`/api/jobs/${job.id}`);
        $('i', prog).style.width = `${j.total ? (j.done / j.total) * 100 : 5}%`;
        info.textContent = `${j.step ? `${t(`x${j.step[0].toUpperCase()}${j.step.slice(1)}`)} · ` : ''}${t('exporting', { a: j.done, b: j.total })}`;
        if (j.state === 'running') return setTimeout(poll, 700);
        startBtn.disabled = false;
        if (j.state === 'error') { info.textContent = j.error; return; }
        info.textContent = t('exportDone');
        results.style.display = '';
        for (const f of j.files) {
          const target = f.file || f.dir || f.csv;
          results.append(h('div', { class: 'li' }, h('span', { class: 'grow', title: target }, label(f.part, f)),
            target ? h('button', { class: 'btn small', onclick: () => (window.billerbook?.reveal ? window.billerbook.reveal(target) : api('/api/reveal', { body: { path: target } })) }, t('reveal')) : null));
        }
      };
      poll();
    } }, t('start'));
    const pf = S.preflight?.warnings || [];
    const opt = (part, title, hint, extra = null) => h('label', { class: 'export-opt' },
      h('input', { type: 'checkbox', checked: o.parts.has(part), onchange: (ev) => { ev.target.checked ? o.parts.add(part) : o.parts.delete(part); } }),
      h('span', {}, title), hint ? h('small', {}, hint) : null, extra);
    const group = (title, ...kids) => h('div', { class: 'export-group' }, h('h3', {}, title), ...kids);
    const errs = pf.filter((w) => w.level === 'error').length;
    return [
      h('h2', {}, `${t('exportTitle')} · ${e.name}`),
      h('div', { class: 'muted num' }, `${e.pages.length} ${t('pages')} · ${e.w} × ${e.h} mm + ${e.bleed} mm ${t('bleed')} · ${e.colorMode === 'cmyk' ? `CMYK${e.icc ? ` (${e.icc.split('/').pop()})` : ''}` : 'RGB'} · ${e.ppi} ppi · ${findProvider(e.provider).name}`),
      pf.length ? h('div', { style: { color: errs ? 'var(--error)' : 'var(--warn)' } }, `${t('preflight')}: ${errs} ${t('errors')}, ${pf.length - errs} ${t('warnings')} – ${t('proofHint')}`) : h('div', { class: 'okline' }, `✓ ${t('allGood')}`),
      h('div', { class: 'export-cols' }, h('div', {}, group(t('xgPrint'),
        opt('interior', t('interior'), t(e.interior === 'spreads' ? 'xInteriorSpreads' : 'xInteriorSingle')),
        e.cover?.mode !== 'none' ? opt('cover', t('cover'), t('xCoverHint')) : null),
      group(t('xgCheck'),
        opt('proof', t('xProof'), t('xProofHint')),
        opt('overview', t('xOverview'), t('xOverviewHint')),
        h('small', { class: 'muted' }, t('xSoftproofHint')))),
      h('div', {}, group(t('xgShare'),
        opt('screen', t('xScreen'), t('xScreenHint')),
        opt('images', t('xImages'), t('xImagesHint'), h('div', { class: 'row compact', style: { gridColumn: 2 } },
          sel([['spreads', t('spreads')], ['pages', t('pages')]], o.images.mode, (v) => { o.images.mode = v; }),
          sel([['jpeg', 'JPEG'], ['png', 'PNG']], o.images.format, (v) => { o.images.format = v; }),
          sel([[2000, '2000 px'], [3000, '3000 px'], [5000, '5000 px']], o.images.width, (v) => { o.images.width = Number(v); }))),
        opt('carousel', t('xCarousel'), t('xCarouselHint')),
        opt('html', t('xHtml'), t('xHtmlHint')),
        opt('epub', t('xEpub'), t('xEpubHint')),
        opt('cbz', t('xCbz'), t('xCbzHint')),
        opt('idml', t('xIdml'), t('xIdmlHint'))),
      group(t('xgFiles'),
        opt('filelist', t('xFilelist'), t('xFilelistHint')),
        opt('originals', t('xOriginals'), t('xOriginalsHint')),
        opt('package', t('xPackage'), t('xPackageHint'))))),
      h('label', { class: 'field' }, h('span', {}, t('xPages')), h('input', { class: 'input num', placeholder: t('xPagesAll'), oninput: (ev) => { o.pages = ev.target.value.trim(); } }), h('small', { class: 'muted' }, t('xPagesHint'))),
      pathField(t('exportTo'), '', { onChange: (v) => { o.outDir = v; }, hint: '~/Desktop/Billerbook-Export' }),
      prog, info, results,
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('close')), startBtn),
    ];
  }, { wide: true });
}

// Soft proof: every photo through the printer's CMYK profile. Shift/Alt adds the gamut warning.
function toggleProof(gamut = false) {
  if (gamut && S.proof) S.gamut = !S.gamut;
  else { S.proof = !S.proof; S.gamut = S.proof && gamut; }
  renderTop(); renderStage(); renderStrip();
  if (S.proof) toast(t(S.gamut ? 'proofOnGamut' : 'proofOn', { profile: ed().icc ? ed().icc.split('/').pop() : t('genericCmyk') }));
}

// ---------- import: PDF, web page / HTML, Billerbook project file ----------
function importModal() {
  const e = ed();
  modal((close) => {
    const info = h('div', { class: 'muted', 'aria-live': 'polite' });
    const o = { pdfMode: 'elements', url: '', newEdition: false };
    const pdfInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'input' });
    return [
      h('h2', {}, t('import')),
      h('div', { class: 'export-group' }, h('h3', {}, 'PDF'),
        h('p', { class: 'muted' }, t('impPdfHint')),
        pdfInput,
        h('div', { class: 'seg' },
          h('button', { 'aria-selected': 'true', onclick: (ev) => { o.pdfMode = 'elements'; ev.target.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === ev.target)); } }, t('impPdfElements')),
          h('button', { 'aria-selected': 'false', onclick: (ev) => { o.pdfMode = 'page'; ev.target.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === ev.target)); } }, t('impPdfPages'))),
        h('button', { class: 'btn primary', onclick: async () => {
          const f = pdfInput.files?.[0];
          if (!f) return toast(t('impChoosePdf'));
          try { const n = await importPdf(f, o.pdfMode, (msg) => { info.textContent = msg; }); toast(t('impDone', { n })); close(); } catch (err) { info.textContent = err.message; }
        } }, t('impPdfStart'))),
      h('div', { class: 'export-group' }, h('h3', {}, t('impWeb')),
        h('p', { class: 'muted' }, t('impWebHint')),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
          h('input', { class: 'input grow', placeholder: 'https://… / ~/…/page.html', oninput: (ev) => { o.url = ev.target.value.trim(); } }),
          h('button', { class: 'btn', onclick: async () => { const pth = await pickPath('file', 'HTML'); if (pth) { o.url = pth; info.textContent = pth; } } }, t('choose'))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (ev) => { o.newEdition = ev.target.checked; } }), ' ', t('impNewEdition')),
        h('button', { class: 'btn primary', onclick: async () => {
          if (!o.url) return;
          info.textContent = t('impLoading');
          try {
            if (S.pendingSave) await save();
            const r = await api(`/api/project/${S.project.id}/import-html`, { body: { source: o.url, edition: e.id, newEdition: o.newEdition || undefined } });
            await reloadProject({ pool: true });
            if (o.newEdition) S.ed = S.project.editions.findIndex((x) => x.id === r.edition);
            renderAll();
            toast(t('impWebDone', { pages: r.pages, photos: r.photos }) + (r.failed ? ` · ${r.failed} ${t('impFailed')}` : ''));
            close();
          } catch (err) { info.textContent = err.message; }
        } }, t('impWebStart'))),
      h('div', { class: 'export-group' }, h('h3', {}, t('impProject')),
        h('p', { class: 'muted' }, t('impProjectHint')),
        h('button', { class: 'btn', onclick: async () => {
          const pth = await pickPath('file', '.billerbook');
          if (!pth) return;
          try { const r = await api('/api/projects/import', { body: { path: pth } }); close(); await openProject(r.id); } catch (err) { info.textContent = err.message; }
        } }, t('impProjectOpen'))),
      info,
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('close'))),
    ];
  }, { wide: true });
}

// PDF pages into book pages. "elements": photos and text blocks become free frames you can move;
// "page": every PDF page becomes one image. PDF.js runs here in the app; nothing is uploaded anywhere.
async function importPdf(file, mode, say) {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
  const e = ed();
  const base = file.name.replace(/\.pdf$/i, '').replace(/[^\w.-]+/g, '-').slice(0, 40);
  const upload = async (blob, name) => (await api(`/api/project/${S.project.id}/upload?name=${encodeURIComponent(name)}`, { method: 'PUT', body: blob, raw: true })).key;
  const toBlob = (canvas, type = 'image/jpeg') => new Promise((r) => canvas.toBlob(r, type, 0.92));
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    say(t('impPdfPage', { a: n, b: doc.numPages }));
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(4000 / Math.max(vp1.width, vp1.height), 300 / 72);
    const vp = page.getViewport({ scale });
    if (mode === 'page') {
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const key = await upload(await toBlob(c), `${base}-${String(n).padStart(3, '0')}.jpg`);
      pages.push({ layout: 'voll', slots: [{ key, fit: 'contain' }], texts: [] });
      continue;
    }
    // Elements: walk the drawing operations, keep each image with its position.
    const ops = await page.getOperatorList();
    const OPS = pdfjs.OPS;
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    const frames = [], slots = [], texts = [];
    const W = vp1.width, H = vp1.height;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const obj = fn === OPS.paintInlineImageXObject ? args[0] : await new Promise((res) => { const id = args[0]; (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, res); });
        if (!obj) continue;
        const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]], ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
        const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(W, Math.max(...xs)), y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(H, Math.max(...ys));
        if (x1 - x0 < W * 0.03 || y1 - y0 < H * 0.03) continue; // icons and rules
        const c = document.createElement('canvas'); c.width = obj.width; c.height = obj.height;
        const g = c.getContext('2d');
        if (obj.bitmap) g.drawImage(obj.bitmap, 0, 0);
        else if (obj.data) {
          const id = g.createImageData(obj.width, obj.height);
          const px = obj.width * obj.height;
          if (obj.data.length === px * 4) id.data.set(obj.data);
          else if (obj.data.length === px * 3) for (let k = 0; k < px; k++) { id.data[k * 4] = obj.data[k * 3]; id.data[k * 4 + 1] = obj.data[k * 3 + 1]; id.data[k * 4 + 2] = obj.data[k * 3 + 2]; id.data[k * 4 + 3] = 255; }
          else continue;
          g.putImageData(id, 0, 0);
        } else continue;
        // The image is drawn upside down in PDF space when the matrix flips it; mirror back.
        if (ctm[3] < 0) { const f = document.createElement('canvas'); f.width = c.width; f.height = c.height; const fg = f.getContext('2d'); fg.translate(0, c.height); fg.scale(1, -1); fg.drawImage(c, 0, 0); c.getContext('2d').clearRect(0, 0, c.width, c.height); c.getContext('2d').drawImage(f, 0, 0); }
        const key = await upload(await toBlob(c), `${base}-${String(n).padStart(3, '0')}-${slots.length + 1}.jpg`);
        frames.push({ kind: 'image', x: x0 / W, y: 1 - y1 / H, w: (x1 - x0) / W, h: (y1 - y0) / H });
        slots.push({ key, fit: 'fill' });
      }
    }
    // Text: lines from PDF.js, joined into blocks by position.
    const tc = await page.getTextContent();
    const lines = [];
    for (const it of tc.items) {
      if (!it.str?.trim()) continue;
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      const x = it.transform[4], yTop = H - it.transform[5] - size;
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.yTop - yTop) < size * 0.4 && x >= last.x) { last.text += (x - last.x1 > size * 0.2 ? ' ' : '') + it.str; last.x1 = x + it.width; last.w = last.x1 - last.x; }
      else lines.push({ text: it.str, x, x1: x + it.width, w: it.width, yTop, size });
    }
    const blocks = [];
    for (const l of lines) {
      const b = blocks[blocks.length - 1];
      if (b && Math.abs(b.size - l.size) < 0.6 && l.yTop - b.yBottom < l.size * 1.1 && Math.abs(l.x - b.x) < l.size * 3) { b.text += `\n${l.text}`; b.yBottom = l.yTop + l.size * 1.2; b.w = Math.max(b.w, l.x1 - b.x); }
      else blocks.push({ text: l.text, x: l.x, yTop: l.yTop, yBottom: l.yTop + l.size * 1.2, w: l.w, size: l.size });
    }
    for (const b of blocks) {
      frames.push({ kind: 'text', role: 'body', x: b.x / W, y: b.yTop / H, w: Math.min(1 - b.x / W, (b.w / W) * 1.08 + 0.01), h: Math.min(1 - b.yTop / H, (b.yBottom - b.yTop) / H + 0.01) });
      // Point size relative to the book page, so the text keeps its proportion to the page.
      texts.push({ value: b.text, size: Math.round(b.size * ((e.w / 25.4) * 72 / W) * 10) / 10 });
    }
    pages.push(frames.length ? { layout: 'frei', frames, slots, texts } : { layout: 'leer', slots: [], texts: [] });
  }
  await loadPool(true);
  const at = (currentPage() ?? -1) + 1;
  mutate((pr) => {
    const ed2 = pr.editions[S.ed];
    ed2.pages.splice(at, 0, ...pages.map((x) => ({ ...ops.newPage(x.layout, x.slots), frames: x.frames, texts: x.texts })));
    ops.normalize(ed2);
  });
  return pages.length;
}

// Book templates with a live preview made from this project's own photos.
function templatesModal() {
  const e = ed();
  const list = S.catalog?.templates || TEMPLATES;
  let pick = e.template || list[0].id;
  modal((close) => {
    const prevCover = h('img', { class: 'tpl-prev cover', alt: '' });
    const prevSpread = h('img', { class: 'tpl-prev', alt: '' });
    const about = h('p', { class: 'muted' });
    const cards = h('div', { class: 'tpl-list' });
    const show = () => {
      const tp = list.find((x) => x.id === pick);
      about.textContent = nameOf({ name: tp.about });
      const base = `/api/project/${S.project.id}/template-preview.jpg?edition=${e.id}&template=${tp.id}&lang=${getLang()}`;
      prevCover.src = `${base}&what=cover&w=900`;
      prevSpread.src = `${base}&what=spread1&w=900`;
      cards.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === pick)));
    };
    for (const tp of list) {
      cards.append(h('button', { class: 'tpl-card', 'data-id': tp.id, onclick: () => { pick = tp.id; show(); } },
        h('span', { class: 'tpl-swatch', style: { background: tp.cover.bg } }, h('i', { style: { background: tp.page.bg } })),
        h('span', { style: { fontFamily: cssFamily({ family: tp.font }) } }, nameOf(tp))));
    }
    setTimeout(show);
    const apply = async (relayout) => {
      if (relayout && e.pages.length && !confirm(t('tplRelayoutConfirm'))) return;
      if (S.pendingSave) await save();
      const r = await api(`/api/project/${S.project.id}/op`, { body: { op: 'applyTemplate', args: { edition: e.id, template: pick, relayout, lang: getLang() } } });
      S.hist.push(snapshot()); S.project = r.project; changed();
      toast(t('tplApplied', { name: nameOf(list.find((x) => x.id === pick)) }));
      close();
    };
    return [
      h('h2', {}, t('templates')),
      h('div', { class: 'tpl-grid' }, cards, h('div', { class: 'tpl-view' }, h('div', { class: 'tpl-imgs' }, prevCover, prevSpread), about, h('small', { class: 'muted' }, t('tplPreviewNote')))),
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('cancel')),
        h('button', { class: 'btn', onclick: () => apply(false) }, t('tplStyleOnly')),
        h('button', { class: 'btn primary', onclick: () => apply(true) }, t('tplApply'))),
    ];
  }, { wide: true });
}

// Connect an AI assistant: Claude Desktop in one click, local tools by command or URL,
// ChatGPT and claude.ai through a public address with OAuth and a pairing code.
function connectModal() {
  modal((close) => {
    const box = h('div', { class: 'connect' });
    const copy = (txt) => h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(txt); toast(t('copied')); } }, t('copy'));
    const codeLine = (txt) => h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('code', { class: 'code grow' }, txt), copy(txt));
    const draw = async () => {
      const st = await api('/api/remote');
      const cmd = [st.stdio.command, ...st.stdio.args].map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ');
      const envPrefix = st.stdio.env ? Object.entries(st.stdio.env).map(([k, v]) => `${k}=${v}`).join(' ') + ' ' : '';
      const remoteUrl = st.publicUrl ? `${st.publicUrl}/mcp` : null;
      box.innerHTML = '';
      box.append(
        h('div', { class: 'export-group' }, h('h3', {}, 'Claude Desktop'),
          h('p', { class: 'muted' }, t('ccDesktop')),
          h('button', { class: 'btn primary', onclick: async () => { try { const r = await api('/api/connect/claude-desktop', { body: {} }); toast(t('ccDesktopDone')); void r; } catch (e) { toast(e.message); } } }, t('ccDesktopBtn'))),
        h('div', { class: 'export-group' }, h('h3', {}, 'Claude Code · Codex · Cursor'),
          h('p', { class: 'muted' }, t('ccLocal')),
          codeLine(`claude mcp add --transport http billerbook ${st.local}`),
          codeLine(`${envPrefix}${cmd}`),
          h('small', { class: 'muted' }, t('ccLocalHint'))),
        h('div', { class: 'export-group' }, h('h3', {}, 'ChatGPT · claude.ai'),
          h('p', { class: 'muted' }, t('ccRemote')),
          remoteUrl ? codeLine(remoteUrl) : null,
          h('div', { class: 'row' },
            st.tunnel ? h('button', { class: 'btn', onclick: async () => { await api('/api/remote/tunnel', { body: { action: 'stop' } }); draw(); } }, t('ccTunnelStop'))
              : h('button', { class: 'btn', disabled: st.cloudflared ? null : true, onclick: async (ev) => { ev.target.disabled = true; ev.target.textContent = '…'; try { await api('/api/remote/tunnel', { body: { action: 'start' } }); } catch (e) { toast(e.message); } draw(); } }, t('ccTunnelStart')),
            h('button', { class: 'btn', onclick: async () => { const u = prompt(t('ccOwnUrl'), st.publicUrl || 'https://'); if (u != null) { try { await api('/api/remote/url', { body: { url: u.trim() || null } }); } catch (e) { toast(e.message); } draw(); } } }, t('ccOwnUrlBtn'))),
          !st.cloudflared ? h('small', { class: 'muted' }, t('ccNoCloudflared')) : null,
          remoteUrl ? h('div', {}, h('p', { class: 'muted' }, t('ccPairHint')),
            h('button', { class: 'btn primary', onclick: async () => {
              try { const r = await api('/api/remote/pair', { body: {} }); pairOut.textContent = r.code.replace(/(\d{3})(\d{3})/, '$1 $2'); } catch (err) {
                // Locked after too many wrong codes from outside: the user can unlock with a confirmation here.
                if (err.status === 423 && confirm(t('ccUnlock'))) { const r = await api('/api/remote/pair', { body: { unlock: true } }); pairOut.textContent = r.code.replace(/(\d{3})(\d{3})/, '$1 $2'); }
                else pairOut.textContent = err.message;
              } } }, t('ccPair')),
            pairOut) : null,
          st.connections.length ? h('div', { class: 'list' }, ...st.connections.map((c) => h('div', { class: 'li' }, h('span', { class: 'grow' }, `${c.name}${c.active ? '' : ` (${t('ccInactive')})`}`),
            h('button', { class: 'btn small danger', onclick: async () => { await api('/api/remote/revoke', { body: { id: c.id } }); draw(); } }, t('ccRevoke'))))) : null),
      );
    };
    const pairOut = h('div', { class: 'pair-code num', 'aria-live': 'polite' });
    draw();
    return [h('h2', {}, t('connectAi')), box, h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('close')))];
  }, { wide: true });
}

function helpModal() {
  const cfg = JSON.stringify({ mcpServers: { billerbook: S.sys.mcp } }, null, 2);
  modal((close) => [
    h('h2', {}, t('shortcuts')),
    h('div', { class: 'keys' }, STRINGS[getLang()].keys.flatMap(([k, d]) => [h('kbd', {}, k), h('span', {}, d)])),
    h('h2', { style: { fontSize: '14px' } }, t('mcp')), h('p', { class: 'muted', style: { margin: 0 } }, t('mcpText')),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { close(); connectModal(); } }, `${t('connectAi')}…`)), h('pre', { class: 'code' }, cfg),
    h('div', { class: 'row' }, h('span', { class: 'muted' }, t('language')), sel([['de', 'Deutsch'], ['en', 'English']], getLang(), (v) => { setLang(v); document.documentElement.lang = v; renderAll(); close(); helpModal(); })),
    h('div', { class: 'row' }, h('span', { class: 'muted' }, t('theme')), sel([['system', t('themeSystem')], ['light', t('themeLight')], ['dark', t('themeDark')]], getTheme(), (v) => setTheme(v))),
    h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('close'))),
  ]);
}

// ---------- keyboard ----------
const QUICK = { 1: 'voll', 2: 'zwei-a', 3: 'drei-gross', 4: 'vier-raster', 5: 'auto', 6: 'sechs-raster', 7: 'auto', 8: 'auto', 9: 'neun-kontakt' };
function bindGlobal() {
  $('#autoBtn').textContent = t('autoFill');
  $('#exportBtn').textContent = t('export');
  $('#projBtn').onclick = () => projectsModal();
  $('#autoBtn').onclick = () => autoModal();
  $('#exportBtn').onclick = () => exportModal();
  $('#proofBtn').onclick = (ev) => toggleProof(ev.altKey);
  $('#aiBtn').onclick = () => connectModal();
  $('#tplBtn').onclick = () => templatesModal();
  $('#helpBtn').onclick = () => helpModal();
  document.addEventListener('keydown', (ev) => {
    if (!S.project || $('#modal-root').children.length) return;
    const tag = ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target.isContentEditable) return;
    const e = ed();
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (mod && currentPage() != null) {
      const k = ev.key.toLowerCase(), own = pageOwner(e, currentPage());
      if (k === 'd') { ev.preventDefault(); return mutate((p) => ops.duplicatePages(p, e.id, own.owner, own.spread ? 2 : 1)); }
      if (k === 'c' && ev.shiftKey) { ev.preventDefault(); S.layoutClip = own.owner; toast(t('copyLayout')); return; }
      if (k === 'v' && ev.shiftKey && S.layoutClip != null) { ev.preventDefault(); return mutate((p) => ops.copyLayout(p, e.id, S.layoutClip, [own.owner])); }
    }
    if (mod) return;
    if (ev.key === 'p' || ev.key === 'P') return toggleProof(ev.shiftKey);
    if (ev.key === 'ArrowLeft') return go(-1);
    if (ev.key === 'ArrowRight') return go(1);
    const sl = S.sel?.kind === 'page' ? S.sel : null;
    const slotObj = sl && e.pages[pageOwner(e, sl.page).owner]?.slots[sl.slot];
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && slotObj) { mutate((p) => ops.removeImage(p, e.id, sl.page, sl.slot)); S.sel = null; renderInspector(); return; }
    if (ev.key === 'f' && slotObj) return mutate((p) => ops.updateSlot(p, e.id, sl.page, sl.slot, slotObj.fit === 'contain' ? { fit: undefined } : { fit: 'contain', zoom: 1, ox: 0, oy: 0 }));
    if (ev.key === 'v' && slotObj) return mutate((p) => ops.makeFullBleed(p, e.id, sl.page, sl.slot));
    if ((ev.key === '+' || ev.key === '=') && slotObj) return mutate((p) => ops.updateSlot(p, e.id, sl.page, sl.slot, { zoom: clamp((slotObj.zoom || 1) * 1.1, 1, 6) }));
    if (ev.key === '-' && slotObj) return mutate((p) => ops.updateSlot(p, e.id, sl.page, sl.slot, { zoom: clamp((slotObj.zoom || 1) / 1.1, 1, 6) }));
    const pg = currentPage();
    if (pg == null) return;
    if (/^[1-9]$/.test(ev.key)) return mutate((p) => ops.setLayout(p, e.id, pg, QUICK[ev.key]));
    if (ev.key === ' ') { ev.preventDefault(); return mutate((p) => ops.shuffleLayout(p, e.id, pg)); }
    if (ev.key === 'a') return mutate((p) => ops.setLayout(p, e.id, pg, isSpreadPage(e.pages[pageOwner(e, pg).owner]) ? 'dps-auto' : 'auto'));
    if (ev.key === 'n') { mutate((p) => ops.insertPages(p, e.id, pageOwner(e, pg).owner + 1, 1)); S.page = pg + 1; renderAll(); }
  });
}

boot().catch((e) => { document.body.innerHTML = `<pre style="padding:20px;color:#f88">${e.stack || e}</pre>`; });
