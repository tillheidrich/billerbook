import { placement, spreadsOf, coverSpec, clamp, luminance, estimateSpine } from './lib/geometry.js';
import { LAYOUTS, LAYOUT_ORDER, COVER_ORDER, COVER_LAYOUTS, buildFrames, pageOwner, isSpreadPage, layoutCtx, coverFrames, pageNumberFor } from './lib/layouts.js';
import { PROVIDERS, findProvider } from './lib/providers.js';
import * as ops from './lib/ops.js';
import { t, tl, getLang, setLang, STRINGS } from './lib/i18n.js';

// ---------- state ----------
const CLIENT = ops.rid();
const S = {
  sys: null, project: null, pool: [], poolMap: new Map(), usage: new Map(),
  ed: 0, spread: 0, page: null, sel: null, view: 'pages', filter: 'all', search: '', poolSel: new Set(),
  hist: [], fut: [], saveTimer: null, saving: false, pendingSave: false, preflight: null,
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
    if (e.status === 409) { await reloadProject(); toast('Projekt wurde extern geändert – neu geladen.'); }
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
    if (ev.type === 'project' && S.project && ev.id === S.project.id && ev.by !== CLIENT && ev.version > S.project.version && !S.pendingSave) {
      const srcBefore = JSON.stringify(S.project.sources);
      reloadProject().then(() => { if (JSON.stringify(S.project.sources) !== srcBefore) loadPool().then(renderAll); });
    }
  };
}

// ---------- boot ----------
async function boot() {
  document.documentElement.lang = getLang();
  S.sys = await api('/api/system');
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
  S.ed = 0; S.spread = 0; S.sel = null; S.page = null; S.hist = []; S.fut = []; S.poolSel.clear();
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
    }, h('span', { class: 'dot' }), e.name, h('span', { class: 'meta num' }, `${e.pages.length} S.`)));
  });
  tabs.append(h('button', { class: 'ed-tab add', onclick: () => editionModal(null), title: t('newEdition') }, '+'));
  const views = $('#views'); views.innerHTML = '';
  for (const v of ['pages', 'cover', 'overview']) views.append(h('button', { role: 'tab', 'aria-selected': S.view === v, onclick: () => { S.view = v; S.sel = null; renderAll(); } }, t(v)));
  $('#autoBtn').textContent = t('autoFill');
  $('#exportBtn').textContent = t('export');
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
  S.spread = clamp(S.spread + d, 0, n - 1); S.sel = null; S.page = null;
  renderStage(); renderInspector(); highlightStrip();
}

function pageEl(i, left, k, spread = false) {
  const e = ed();
  const p = e.pages[i];
  const W = spread ? 2 * e.w : e.w;
  const bg = p.bg || e.bg || '#ffffff';
  const el = h('div', { class: 'page', style: { left: `${left}px`, width: `${W * k}px`, height: `${e.h * k}px`, background: bg }, 'data-page': i });
  el.addEventListener('mousedown', (ev) => { if (ev.target === el) { S.page = i; S.sel = null; renderInspector(); el.closest('.spread')?.querySelectorAll('.frame.sel').forEach((f) => f.classList.remove('sel')); } });
  const frames = buildFrames(e, i, aspectOf);
  const target = { kind: 'page', page: i };
  frames.forEach((f, idx) => {
    const fe = frameEl({ ...f, idx }, target, k, p, { textColor: luminance(bg) < 0.45 ? '#fff' : '#1a1a1a' });
    if (p.layout === 'frei') addResize(fe, target, { ...f, idx }, k, W, e.h);
    el.append(fe);
  });
  const pn = !spread && pageNumberFor(e, i);
  if (pn) el.append(h('div', { class: 'pnum', style: { [pn.align === 'right' ? 'right' : 'left']: pn.align === 'right' ? `${(e.w - pn.x) * k}px` : pn.align === 'center' ? `${pn.x * k - 10}px` : `${pn.x * k}px`, top: `${(pn.y - 3) * k}px`, fontSize: `${Math.max(7, 2.8 * k)}px`, color: luminance(bg) < 0.45 ? '#fff' : '#333' } }, String(i + 1)));
  if (!frames.some((f) => f.kind === 'image') && p.layout !== 'text' && p.layout !== 'leer') el.append(h('div', { class: 'hint-drop' }, t('dropHere')));
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
    const size = { title: 26, body: 11, caption: 9, spine: 11, back: 9 }[role] || 11;
    const el = h('div', {
      class: `text-frame${role === 'spine' ? ' spine' : ''}`, contenteditable: 'plaintext-only', 'data-placeholder': `${STRINGS[getLang()].roles[role] || ''} – ${t('typeHere')}`,
      style: { ...style, fontSize: `${(size * 25.4 / 72) * k}px`, color: textColor, textAlign: role === 'title' || role === 'spine' ? 'center' : 'left', fontFamily: ed().font === 'serif' ? 'Times New Roman, Times, serif' : 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: role === 'title' || role === 'spine' ? 700 : 400 },
    });
    el.textContent = texts[f.text]?.value || '';
    el.addEventListener('blur', () => {
      const v = el.innerText.replace(/\n$/, '');
      if ((texts[f.text]?.value || '') === v) return;
      mutate(() => { const arr = getTexts(target); arr[f.text] = { ...(arr[f.text] || {}), value: v }; }, { skipRender: true });
      renderStrip();
    });
    el.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') el.blur(); });
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
    img = h('img', { src: thumb(slot.key, f.w * k > 420 ? 1600 : 800), alt: '', draggable: 'false' });
    el.append(img);
    layoutImg();
    const ppi = Math.round(pl.ppi);
    if (!it.hasFile) el.append(h('span', { class: 'badge err', title: t('fNoFile') }, 'RAW'));
    else if (ppi < 150) el.append(h('span', { class: 'badge err' }, `${ppi} ppi`));
    else if (ppi < Math.min(240, (ed().ppi || 300) * 0.8)) el.append(h('span', { class: 'badge warn' }, `${ppi} ppi`));
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
  if (target.kind === 'page') S.page = target.page;
  document.querySelectorAll('.frame.sel').forEach((n) => n.classList.remove('sel'));
  renderStage(); renderInspector();
}

// ---------- free frames: Alt+drag moves, corner handle resizes, snapping to margins and edges ----------
function snapLines(W, H) {
  const e = ed(), m = e.margin ?? 12;
  const xs = [0, m, W / 2, W - m, W], ys = [0, m, H / 2, H - m, H];
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
  const { xs, ys } = snapLines(W, H);
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
  for (const f of frames) wrap.append(frameEl(f, target, k, null, { textColor: luminance(bg) < 0.45 ? '#fff' : '#1a1a1a' }));
  const v = cs.visible;
  wrap.append(h('div', { class: 'cover-trim', style: { left: `${v.x * k}px`, top: `${v.y * k}px`, width: `${v.w * k}px`, height: `${v.h * k}px` } }));
  for (const x of [cs.spine.x, cs.spine.x + cs.spine.w]) wrap.append(h('div', { class: 'cover-line', style: { left: `${x * k}px` } }));
  if (cs.hinge) {
    wrap.append(h('div', { class: 'cover-hinge', style: { left: `${(cs.spine.x - cs.hinge) * k}px`, width: `${cs.hinge * k}px` } }));
    wrap.append(h('div', { class: 'cover-hinge', style: { left: `${(cs.spine.x + cs.spine.w) * k}px`, width: `${cs.hinge * k}px` } }));
  }
  st.append(h('div', { class: 'stage-label num' }, `${t('cover')} · ${cs.W.toFixed(1)} × ${cs.H.toFixed(1)} mm · ${t('spine').replace(' (mm)', '')} ${e.spine ?? '?'} mm`));
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
    const pg = h('div', { class: 'mp', style: { left: `${left}px`, width: `${W * k}px`, background: p.bg || e.bg || '#fff' } });
    for (const f of buildFrames(e, i, aspectOf)) {
      const st = { left: `${f.x * k}px`, top: `${f.y * k}px`, width: `${f.w * k}px`, height: `${f.h * k}px` };
      if (f.kind === 'text') { pg.append(h('div', { class: 'mt', style: { ...st, height: `${Math.min(f.h, 4) * k}px` } })); continue; }
      const s = p.slots[f.slot];
      const it = s && S.poolMap.get(s.key);
      if (it) {
        const pl = placement(f.w, f.h, it.w, it.h, s, it.focal);
        st.backgroundImage = `url("${thumb(s.key, 200)}")`;
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
  w.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('text/fbs-spread') || ev.dataTransfer.types.includes('text/fbs-keys')) { ev.preventDefault(); w.classList.add('drop'); } });
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
    if (keys) { const target = ri ?? li; mutate((p) => ops.addImages(p, e.id, target, JSON.parse(keys))); }
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
    for (const id of list) {
      const g = LAYOUTS[id].group === 'spread' ? 'spread' : 'single';
      if (g !== lastGroup && g === 'spread') lays.append(h('div', { class: 'lay-group', style: { gridColumn: '1 / -1' } }, t('layoutsSpread')));
      lastGroup = g;
      const b = h('button', { class: 'lay', title: tl(id), 'aria-pressed': p.layout === id, html: layoutIcon(id, e, own.owner), style: g === 'spread' ? { gridColumn: 'span 2' } : null });
      b.addEventListener('click', () => { if (id !== 'frei') mutate((pr) => ops.setLayout(pr, e.id, own.owner, id)); });
      lays.append(b);
    }
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
        h('button', { class: 'btn small danger', onclick: () => { mutate((pr) => ops.deletePages(pr, e.id, own.owner, own.spread ? 2 : 1)); S.page = null; S.sel = null; fixIndexes(); renderAll(); } }, own.spread ? t('deleteSpread') : t('deletePage')))));
  }
  if (S.sel && S.sel.kind === 'page') renderFrameSection(el);
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
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => mutate((pr) => ops.makeFullBleed(pr, e.id, page, slot)) }, t('fullBleed')),
      h('button', { class: 'btn small', onclick: () => upd({ zoom: 1, ox: 0, oy: 0 }) }, t('resetCrop')),
      h('button', { class: 'btn small danger', onclick: () => { mutate((pr) => ops.removeImage(pr, e.id, page, slot)); S.sel = null; renderInspector(); } }, t('remove')))));
}
function renderCoverInspector(el) {
  const e = ed();
  const cd = e.coverDesign;
  const lays = h('div', { class: 'layouts', style: { gridTemplateColumns: '1fr 1fr' } });
  const cs = coverSpec(e);
  for (const id of COVER_ORDER) {
    const frames = COVER_LAYOUTS[id].build(cs);
    const svg = `<svg viewBox="0 0 ${cs.W} ${cs.H}"><rect class="pg" width="${cs.W}" height="${cs.H}"/>${frames.map((f) => `<rect class="${f.kind === 'image' ? 'im' : 'tx'}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.kind === 'image' ? f.h : Math.min(f.h, 12)}"/>`).join('')}</svg>`;
    const b = h('button', { class: 'lay', title: tl(id), 'aria-pressed': (cd.layout || 'cover-front') === id, html: svg });
    b.addEventListener('click', () => mutate(() => { cd.layout = id; }));
    lays.append(b);
  }
  const spineIn = h('input', { class: 'input num', type: 'number', step: '0.1', min: 0, value: e.spine ?? '', placeholder: String(e.spineEstimate ?? estimateSpine(e.pages.length, e.spinePerPage)), onchange: (ev) => mutate((p) => ops.updateEdition(p, e.id, { spine: ev.target.value === '' ? null : Number(ev.target.value) })) });
  el.append(h('div', { class: 'sec' }, h('h3', {}, t('layout')), lays,
    h('label', { class: 'field' }, h('span', {}, t('spine')), spineIn, h('small', {}, t('spineHint', { n: e.pages.length, e: estimateSpine(e.pages.length, e.spinePerPage) }))),
    h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('background')), h('input', { class: 'input', type: 'color', value: cd.bg || '#ffffff', style: { width: '60px' }, onchange: (ev) => mutate(() => { cd.bg = ev.target.value; }) }))));
  if (S.sel?.kind === 'cover') {
    const s = cd.slots[S.sel.slot];
    if (s) el.append(h('div', { class: 'sec' }, h('h3', {}, t('frame')),
      h('div', { class: 'seg' },
        h('button', { 'aria-selected': s.fit !== 'contain', onclick: () => mutate(() => { delete s.fit; }) }, t('fill')),
        h('button', { 'aria-selected': s.fit === 'contain', onclick: () => mutate(() => { s.fit = 'contain'; }) }, t('contain'))),
      h('label', { class: 'field' }, h('span', {}, t('zoom')), h('input', { type: 'range', min: 1, max: 4, step: 0.01, value: s.zoom || 1, onchange: (ev) => mutate(() => { s.zoom = Number(ev.target.value); }) })),
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
      h('div', { class: 'row muted' }, `${t('importBook')} → `, sel(prov.formats.map((f) => [f.id, f.label[getLang()] || f.label.en]), fmt.format, (v) => { fmt.format = v; })),
      pathField(t('exportFolder'), lr.exportFolder, { hint: t('exportFolderHint'), onChange: (v) => { lr.exportFolder = v; } }),
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('cancel')),
        h('button', { class: 'btn primary', onclick: async () => { await saveSources(); close(); setStatus('…'); await reloadProject({ pool: true }); setStatus(''); } }, t('apply'))),
    ];
  }, { wide: true });
}

function editionModal(existing) {
  const isNew = !existing;
  const e = existing ? structuredClone(existing) : { name: '', provider: 'wmd', format: 'sc-a4-hoch', copyFrom: '' };
  if (isNew) Object.assign(e, ops.addEdition({ editions: [] }, { provider: 'wmd', format: 'sc-a4-hoch' }), { name: '' });
  modal((close) => {
    const body = h('div', { style: { display: 'grid', gap: '14px' } });
    const draw = () => {
      body.innerHTML = '';
      const prov = findProvider(e.provider);
      const f = prov.formats.find((x) => x.id === e.format) || prov.formats[0];
      const applyFormat = (provider, format) => {
        const tmp = ops.addEdition({ editions: [] }, { provider, format });
        for (const k of ['provider', 'format', 'binding', 'w', 'h', 'bleed', 'safety', 'glue', 'cover', 'spinePerPage', 'pageStep']) e[k] = tmp[k];
        draw();
      };
      const num = (key, label, step = 0.5) => h('label', { class: 'field' }, h('span', {}, label), h('input', { class: 'input num', type: 'number', step, value: e[key] ?? '', onchange: (ev) => { e[key] = ev.target.value === '' ? null : Number(ev.target.value); } }));
      const iccOpts = [['', t('noIcc')], ...S.sys.icc.map((p) => [p, p.split('/').pop()])];
      if (e.icc && !S.sys.icc.includes(e.icc)) iccOpts.push([e.icc, e.icc.split('/').pop()]);
      body.append(
        h('label', { class: 'field' }, h('span', {}, 'Name'), h('input', { class: 'input', value: e.name, placeholder: isNew ? 'Softcover Familie' : '', oninput: (ev) => { e.name = ev.target.value; } })),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, t('provider')), sel(PROVIDERS.map((p) => [p.id, `${p.name}${p.verified ? ' ✓' : ''}`]), e.provider, (v) => applyFormat(v, findProvider(v).formats[0].id))),
          h('label', { class: 'field' }, h('span', {}, t('format')), sel(prov.formats.map((x) => [x.id, `${x.label[getLang()] || x.label.en} · ${x.w} × ${x.h}`]), e.format, (v) => applyFormat(e.provider, v)))),
        f.custom ? h('div', { class: 'grid3' }, num('w', `${t('width')} (mm)`, 1), num('h', `${t('height')} (mm)`, 1),
          h('label', { class: 'field' }, h('span', {}, t('binding')), sel(Object.keys(prov.bindings).map((b) => [b, t(b)]), e.binding, (v) => { e.binding = v; Object.assign(e, { ...prov.bindings[v], cover: { ...prov.bindings[v].cover } }); draw(); }))) : null,
        h('div', { class: 'grid3' }, num('spine', t('spine'), 0.1), num('ppi', t('resolution'), 10), num('pageStep', 'Seiten-Schritt', 1)),
        h('small', { class: 'muted' }, t('spineHint', { n: existing?.pages.length ?? 0, e: estimateSpine(existing?.pages.length ?? 0, e.spinePerPage) })),
        h('div', { class: 'grid3' }, num('margin', `${t('margin')} (mm)`), num('gutter', `${t('gutter')} (mm)`), num('gap', `${t('gap')} (mm)`)),
        h('div', { class: 'grid3' }, num('bleed', `${t('bleed')} (mm)`), num('safety', `${t('safety')} (mm)`), num('glue', `${t('glue')} (mm)`)),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, t('colorMode')), sel([['cmyk', t('cmyk')], ['rgb', t('rgb')]], e.colorMode, (v) => { e.colorMode = v; })),
          h('label', { class: 'field' }, h('span', {}, t('icc')), sel(iccOpts, e.icc || '', (v) => { e.icc = v || null; }))),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, t('pageNumbers')), sel([['none', t('pnNone')], ['outer', t('pnOuter')], ['center', t('pnCenter')]], e.pageNumbers || 'none', (v) => { e.pageNumbers = v; })),
          h('label', { class: 'field' }, h('span', {}, t('sharpen')), sel([['none', t('none')], ['low', t('shLow')], ['standard', t('shStandard')], ['high', t('shHigh')]], e.sharpen || 'standard', (v) => { e.sharpen = v; }))),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, t('font')), sel([['sans', t('sans')], ['serif', t('serif')]], e.font, (v) => { e.font = v; })),
          h('label', { class: 'field' }, h('span', {}, t('pageBg')), h('input', { class: 'input', type: 'color', value: e.bg || '#ffffff', onchange: (ev) => { e.bg = ev.target.value; } }))),
        isNew ? h('label', { class: 'field' }, h('span', {}, t('copyFrom')), sel([['', t('emptyEdition')], ...S.project.editions.map((x) => [x.id, x.name])], e.copyFrom, (v) => { e.copyFrom = v; })) : null,
      );
    };
    draw();
    return [
      h('h2', {}, isNew ? t('newEdition') : t('editionSettings')), body,
      h('div', { class: 'foot' },
        !isNew && S.project.editions.length > 1 ? h('button', { class: 'btn danger left', onclick: () => { if (confirm(`${t('delete')}: ${existing.name}?`)) { mutate((p) => { p.editions = p.editions.filter((x) => x.id !== existing.id); }); S.ed = 0; fixIndexes(); renderAll(); close(); } } }, t('delete')) : null,
        h('button', { class: 'btn', onclick: close }, t('cancel')),
        h('button', { class: 'btn primary', onclick: () => {
          const patch = {};
          for (const k of ['name', 'w', 'h', 'binding', 'bleed', 'safety', 'glue', 'cover', 'spine', 'spinePerPage', 'pageStep', 'margin', 'gutter', 'gap', 'ppi', 'colorMode', 'icc', 'font', 'bg', 'pageNumbers', 'sharpen']) patch[k] = e[k];
          if (isNew) {
            mutate((p) => {
              const ne = ops.addEdition(p, { name: e.name || t('edition'), provider: e.provider, format: e.format, copyFrom: e.copyFrom || undefined });
              const { name, ...rest } = patch;
              Object.assign(ne, rest, { provider: e.provider, format: e.format });
              ops.normalize(ne);
            });
            S.ed = S.project.editions.length - 1; S.spread = 0;
          } else mutate((p) => { const x = ops.getEdition(p, existing.id); Object.assign(x, patch, { provider: e.provider, format: e.format }); ops.normalize(x); });
          renderAll(); loadPreflight(); close();
        } }, isNew ? t('create') : t('save'))),
    ];
  });
}

function autoModal() {
  const o = { perPage: 3, highlightRating: 5, filter: 'unplaced', minRating: 0, breakHours: 36, replace: false };
  modal((close) => [
    h('h2', {}, t('autoTitle')),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('perPage')), h('input', { class: 'input num', type: 'number', min: 1, max: 12, value: o.perPage, onchange: (ev) => { o.perPage = Number(ev.target.value); } })),
      h('label', { class: 'field' }, h('span', {}, t('highlight')), sel([[0, t('none')], [3, '★★★'], [4, '★★★★'], [5, '★★★★★']], o.highlightRating, (v) => { o.highlightRating = Number(v); }))),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('which')), sel([['unplaced', t('onlyUnplaced')], ['nowhere', t('onlyNowhere')], ['all', t('allImages')]], o.filter, (v) => { o.filter = v; })),
      h('label', { class: 'field' }, h('span', {}, t('minStars')), sel([[0, '–'], [1, '★'], [2, '★★'], [3, '★★★'], [4, '★★★★'], [5, '★★★★★']], o.minRating, (v) => { o.minRating = Number(v); }))),
    h('label', { class: 'field' }, h('span', {}, t('breakGaps')), h('input', { class: 'input num', type: 'number', min: 0, value: o.breakHours, onchange: (ev) => { o.breakHours = Number(ev.target.value); } })),
    S.poolSel.size > 1 ? h('small', { class: 'muted' }, `${S.poolSel.size} ausgewählt → nur diese`) : null,
    h('label', { class: 'row' }, h('input', { type: 'checkbox', onchange: (ev) => { o.replace = ev.target.checked; } }), t('replacePages')),
    h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('cancel')),
      h('button', { class: 'btn primary', onclick: async () => {
        const args = { edition: ed().id, ...o, keys: S.poolSel.size > 1 ? [...S.poolSel] : undefined };
        if (S.pendingSave) await save();
        const r = await api(`/api/project/${S.project.id}/op`, { body: { op: 'autoFill', args } });
        S.hist.push(snapshot()); S.project = r.project; changed();
        toast(t('pagesCreated', { n: r.result.pages }));
        close();
      } }, t('start'))),
  ]);
}

function exportModal() {
  const e = ed();
  const o = { interior: true, cover: true, preview: false, outDir: '' };
  modal((close) => {
    const prog = h('div', { class: 'progress', style: { display: 'none' } }, h('i'));
    const info = h('div', { class: 'muted' });
    const results = h('div', { class: 'list', style: { display: 'none' } });
    const startBtn = h('button', { class: 'btn primary', onclick: async () => {
      startBtn.disabled = true; prog.style.display = '';
      if (S.pendingSave) await save();
      const parts = [o.interior && 'interior', o.cover && 'cover'].filter(Boolean);
      const job = await api(`/api/project/${S.project.id}/export`, { body: { edition: e.id, parts, preview: o.preview, outDir: o.outDir || undefined } });
      const poll = async () => {
        const j = await api(`/api/jobs/${job.id}`);
        $('i', prog).style.width = `${j.total ? (j.done / j.total) * 100 : 5}%`;
        info.textContent = t('exporting', { a: j.done, b: j.total });
        if (j.state === 'running') return setTimeout(poll, 700);
        if (j.state === 'error') { info.textContent = j.error; startBtn.disabled = false; return; }
        info.textContent = t('exportDone');
        results.style.display = '';
        for (const f of j.files) results.append(h('div', { class: 'li' }, h('span', { class: 'grow', title: f.file }, `${f.part === 'cover' ? t('cover') : t('interior')} · ${f.size} · ${f.colorMode}`),
          h('button', { class: 'btn small', onclick: () => (window.billerbook?.reveal ? window.billerbook.reveal(f.file) : api('/api/reveal', { body: { path: f.file } })) }, t('reveal'))));
      };
      poll();
    } }, t('start'));
    const pf = S.preflight?.warnings || [];
    return [
      h('h2', {}, `${t('exportTitle')} · ${e.name}`),
      h('div', { class: 'muted num' }, `${e.pages.length} ${t('pages')} · ${e.w} × ${e.h} mm + ${e.bleed} mm ${t('bleed')} · ${e.colorMode === 'cmyk' ? `CMYK${e.icc ? ` (${e.icc.split('/').pop()})` : ''}` : 'RGB'} · ${e.ppi} ppi`),
      pf.length ? h('div', { style: { color: pf.some((w) => w.level === 'error') ? 'var(--error)' : 'var(--warn)' } }, `${t('preflight')}: ${pf.length}`) : h('div', { class: 'okline' }, `✓ ${t('allGood')}`),
      h('div', { class: 'row' },
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: true, onchange: (ev) => { o.interior = ev.target.checked; } }), t('interior')),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: true, onchange: (ev) => { o.cover = ev.target.checked; } }), t('cover'))),
      h('div', { class: 'seg' },
        h('button', { 'aria-selected': 'true', onclick: (ev) => { o.preview = false; ev.target.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === ev.target)); } }, t('exportPrint')),
        h('button', { 'aria-selected': 'false', onclick: (ev) => { o.preview = true; ev.target.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === ev.target)); } }, t('exportPreview'))),
      pathField(t('exportTo'), '', { onChange: (v) => { o.outDir = v; }, hint: '~/Desktop/Billerbook-Export' }),
      prog, info, results,
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: close }, t('close')), startBtn),
    ];
  });
}

function helpModal() {
  const cfg = JSON.stringify({ mcpServers: { billerbook: S.sys.mcp } }, null, 2);
  modal((close) => [
    h('h2', {}, t('shortcuts')),
    h('div', { class: 'keys' }, STRINGS[getLang()].keys.flatMap(([k, d]) => [h('kbd', {}, k), h('span', {}, d)])),
    h('h2', { style: { fontSize: '14px' } }, t('mcp')), h('p', { class: 'muted', style: { margin: 0 } }, t('mcpText')), h('pre', { class: 'code' }, cfg),
    h('div', { class: 'row' }, h('span', { class: 'muted' }, t('language')), sel([['de', 'Deutsch'], ['en', 'English']], getLang(), (v) => { setLang(v); document.documentElement.lang = v; renderAll(); close(); helpModal(); })),
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
  $('#helpBtn').onclick = () => helpModal();
  document.addEventListener('keydown', (ev) => {
    if (!S.project || $('#modal-root').children.length) return;
    const tag = ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target.isContentEditable) return;
    const e = ed();
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (mod) return;
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
