#!/usr/bin/env node
// Billerbook – local server (UI + HTTP API). Everything runs on this machine.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as ops from './public/lib/ops.js';
import { loadProfiles, saveProfile, deleteProfile, providers, readCoverTemplate } from './lib/profiles.mjs';
import { LAYOUT_ORDER, COVER_ORDER, coverFrames, pageOwner, buildFrames } from './public/lib/layouts.js';
import { findProvider, profileFromEdition } from './public/lib/providers.js';
import { spineOf, coverSpec, luminance } from './public/lib/geometry.js';
import { listProjects, loadProject, saveProject, createProject, buildPool, dropPool, thumbnail, uploadDir, focalProgress, DATA } from './lib/store.mjs';
import { listCollections, readLightroomBook, bookToPages } from './lib/catalog.mjs';
import { exportInterior, exportCover } from './lib/pdf.mjs';
import { renderSpread, renderCover, renderPage } from './lib/preview.mjs';
import { renderOverview, exportOverview } from './lib/overview.mjs';
import { exportIdml } from './lib/idml.mjs';
import { listCaptureOneCollections, captureOneVariants, PRINTABLE as C1_PRINTABLE } from './lib/captureone.mjs';
import { extraChecks } from './lib/checks.mjs';
import { exportImages, exportCarousel, exportEpub, writeFileList, collectOriginals, usedFiles, exportHtml, exportCbz, subsetEdition } from './lib/exports.mjs';
import { FONT_DIR, inspectFontFile, textFrameCommands, svgPath } from './lib/fonts.mjs';
import { fontFaceCss, allFamilies, STYLE_PRESETS, resolveStyle } from './public/lib/text.js';
import { GRAPHICS } from './public/lib/graphics.js';
import { TEMPLATES, findTemplate } from './public/lib/templates.js';
import { TONES } from './public/lib/tones.js';
import { applyTone, softProof, proofProfile } from './lib/imagefx.mjs';
import sharp from 'sharp';
import { Remote, consentPage, installClaudeDesktop } from './lib/remote.mjs';
import { exportPackage, importPackage } from './lib/package.mjs';
import { loadHtmlSource, blocksToPages, fetchLimited } from './lib/htmlimport.mjs';
import { readSpecSheet } from './lib/specsheet.mjs';
import { safeColor } from './public/lib/safe.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// How an MCP client should start our MCP server. Inside the Mac app the app binary doubles as Node.
function mcpConfig() {
  const script = path.join(ROOT, 'mcp.mjs');
  if (process.versions.electron) return { command: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } };
  return { command: process.execPath, args: ['--disable-warning=ExperimentalWarning', script] };
}
const PUBLIC = path.join(ROOT, 'public');
export const PORT = Number(process.env.BILLERBOOK_PORT || 4580);
const log = (...a) => console.error('[billerbook]', ...a); // stdout belongs to MCP when embedded

const MIME = { '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

// ---------- live updates ----------
const clients = new Set();
function broadcast(evt) {
  const data = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of clients) res.write(data);
}

// Serialize writes per project.
const locks = new Map();
async function withProject(id, fn, by = 'api') {
  const prev = locks.get(id) || Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  locks.set(id, prev.then(() => next));
  await prev;
  try {
    const p = await loadProject(id);
    const result = await fn(p);
    if (result?.__nosave) return result.value;
    await saveProject(p);
    broadcast({ type: 'project', id: p.id, version: p.version, by });
    return { result, project: p };
  } finally { release(); }
}

// Operations that can be called through POST /api/project/:id/op (UI, MCP, scripts).
const OPS = {
  addEdition: (p, a) => ops.addEdition(p, a),
  updateEdition: (p, a) => { ops.updateEdition(p, a.edition, a.patch || {}); return { ok: true }; },
  deleteEdition: (p, a) => { p.editions = p.editions.filter((e) => e.id !== a.edition); },
  insertPages: (p, a) => ops.insertPages(p, a.edition, a.at, a.count, a.layout),
  deletePages: (p, a) => ops.deletePages(p, a.edition, a.from, a.count),
  movePages: (p, a) => ops.movePages(p, a.edition, a.from, a.count, a.to),
  setLayout: (p, a) => ops.setLayout(p, a.edition, a.page, a.layout),
  placeImage: (p, a) => ops.placeImage(p, a.edition, a.page, a.slot, a.key, a.extra),
  addImages: (p, a) => ops.addImages(p, a.edition, a.page, a.keys || []),
  removeImage: (p, a) => ops.removeImage(p, a.edition, a.page, a.slot),
  swapSlots: (p, a) => ops.swapSlots(p, a.edition, a.a, a.b),
  updateSlot: (p, a) => ops.updateSlot(p, a.edition, a.page, a.slot, a.patch || {}),
  setText: (p, a) => ops.setText(p, a.edition, a.page, a.index, a.value),
  setPageProps: (p, a) => ops.setPageProps(p, a.edition, a.page, a.patch || {}),
  makeFullBleed: (p, a) => ops.makeFullBleed(p, a.edition, a.page, a.slot),
  setCover: (p, a) => ops.setCover(p, a.edition, a),
  shuffleLayout: (p, a) => ops.shuffleLayout(p, a.edition, a.page),
  toFreeLayout: (p, a) => ops.toFreeLayout(p, a.edition, a.page),
  updateFreeFrame: (p, a) => ops.updateFreeFrame(p, a.edition, a.page, a.index, a.rect || {}),
  addFreeFrame: (p, a) => ops.addFreeFrame(p, a.edition, a.page, a.kind),
  removeFreeFrame: (p, a) => ops.removeFreeFrame(p, a.edition, a.page, a.index),
  // Real file paths (drag & drop in the Mac app): single files are added as sources, folders as folders.
  addPaths: (p, a) => {
    p.sources.files ||= []; p.sources.folders ||= [];
    for (const f of a.paths || []) {
      let st; try { st = fs.statSync(f); } catch { continue; }
      if (st.isDirectory()) { if (!p.sources.folders.includes(f)) p.sources.folders.push(f); }
      else if (!p.sources.files.includes(f)) p.sources.files.push(f);
    }
    dropPool(p.id);
    return { keys: (a.paths || []).filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }).map((f) => `f:${f}`) };
  },
  setCoverTemplate: (p, a) => { const ed = ops.getEdition(p, a.edition); if (a.W > 0 && a.H > 0) ed.coverTemplate = { W: Number(a.W), H: Number(a.H), source: a.source || 'manual' }; else delete ed.coverTemplate; ops.normalize(ed); return { cover: ed.coverTemplate || null, spine: ed.spineCalc }; },
  duplicatePages: (p, a) => ops.duplicatePages(p, a.edition, a.from, a.count),
  copyLayout: (p, a) => ops.copyLayout(p, a.edition, a.from, a.to),
  saveCustomLayout: (p, a) => ops.saveCustomLayout(p, a.edition, a.page, a.name),
  applyCustomLayout: (p, a) => ops.applyCustomLayout(p, a.edition, a.page, a.id),
  deleteCustomLayout: (p, a) => ops.deleteCustomLayout(p, a.id),
  setTextStyle: (p, a) => ops.setTextStyle(p, a.edition, a.style, a.patch === undefined ? {} : a.patch),
  applyStylePreset: (p, a) => ops.applyStylePreset(p, a.edition, a.preset),
  setTextProps: (p, a) => ops.setTextProps(p, a.edition, a.target || { page: a.page }, a.index, a.patch || {}),
  setTone: (p, a) => ops.setTone(p, a.edition, a.target || { page: a.page }, a.slot, a.tone, a.strength),
  // Own fonts: copied into the data folder so the project keeps working if the original moves.
  addFont: (p, a) => {
    const files = Array.isArray(a.paths) ? a.paths : [a.path];
    const added = [];
    for (const f of files) {
      if (!/\.(ttf|otf|woff)$/i.test(String(f))) throw httpError(400, 'font files: .ttf, .otf or .woff');
      const info = inspectFontFile(f);
      const id = slug(info.family).toLowerCase();
      const dir = path.join(DATA, 'fonts', id);
      fs.mkdirSync(dir, { recursive: true });
      const key = `${info.weight}-${info.italic ? 'italic' : 'normal'}`;
      const dest = path.join(dir, `${key}${path.extname(f).toLowerCase()}`);
      fs.copyFileSync(f, dest);
      p.fonts ||= [];
      let fam = p.fonts.find((x) => x.id === id);
      if (!fam) { fam = { id, name: info.family, files: {} }; p.fonts.push(fam); }
      fam.files[key] = dest;
      added.push({ family: `custom:${id}`, name: info.family, style: key });
    }
    return { added };
  },
  removeFont: (p, a) => { p.fonts = (p.fonts || []).filter((f) => `custom:${f.id}` !== a.family && f.id !== a.family); },
  setSources: (p, a) => { p.sources = { ...p.sources, ...a.sources }; dropPool(p.id); },
  rename: (p, a) => { p.name = a.name; },
};

// Template: typography, cover and colours; with relayout the edition's photos are laid out again
// in the template's sequence (chronological; all pool photos if the edition is still empty).
function templateInto(p, args, pool) {
  const ed = ops.getEdition(p, args.edition);
  const r = ops.applyTemplate(p, ed.id, args.template);
  if (!args.relayout) return r;
  const keys = [];
  for (const pg of ed.pages) for (const s of pg.slots || []) if (s?.key && !keys.includes(s.key)) keys.push(s.key);
  let items = (keys.length ? keys : pool.items.map((i) => i.key)).map((k) => pool.map.get(k)).filter(Boolean);
  items = items.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const coverKey = ed.coverDesign.slots?.find(Boolean)?.key || items.find((i) => (i.rating || 0) >= 5)?.key || items[0]?.key;
  ops.autoFill(p, ed.id, items, { ...r.fill, replace: true, highlightRating: 5, lang: args.lang || 'de' });
  if (r.fill.captions) ops.fillCaptions(p, ed.id, (k) => pool.map.get(k)?.caption || '');
  const tp = findTemplate(args.template);
  if (tp.intro) {
    // Opening page with a personal line, before the first chapter.
    const [title, line] = tp.intro[args.lang === 'en' ? 'en' : 'de'];
    const intro = ops.newPage('text-kanon', []);
    intro.texts = [{ value: title }, { value: line }];
    ed.pages.unshift(intro);
    ops.normalize(ed);
  }
  if (coverKey) ed.coverDesign.slots = [{ key: coverKey }];
  // A cover title if there is none yet: the project name.
  const tf = coverFrames(ed).frames.filter((f) => f.kind === 'text');
  const ci = tf.findIndex((f) => f.role === 'cover');
  if (ci >= 0 && !ed.coverDesign.texts?.[ci]?.value) { ed.coverDesign.texts ||= []; ed.coverDesign.texts[ci] = { value: p.name }; }
  r.pages = ed.pages.length;
  return r;
}

async function applyOp(id, op, args, by) {
  if (op === 'autoFill') {
    return withProject(id, async (p) => {
      const pool = await buildPool(p);
      const ed = ops.getEdition(p, args.edition);
      const u = ops.usage(p);
      let items = args.keys ? args.keys.map((k) => pool.map.get(k)).filter(Boolean) : pool.items;
      if (args.filter === 'unplaced') items = items.filter((it) => !u.get(it.key)?.get(ed.id));
      if (args.filter === 'nowhere') items = items.filter((it) => !u.get(it.key));
      if (args.minRating) items = items.filter((it) => (it.rating || 0) >= args.minRating);
      if (args.from || args.to) items = items.filter((it) => (!args.from || it.time >= args.from) && (!args.to || it.time <= args.to));
      const r = ops.autoFill(p, ed.id, items, args);
      if (args.captions) ops.fillCaptions(p, ed.id, (k) => pool.map.get(k)?.caption || '');
      return r;
    }, by);
  }
  // Template: typography, cover and colours; with relayout the edition's photos are laid out again
  // in the template's sequence (chronological; all pool photos if the edition is still empty).
  if (op === 'applyTemplate') {
    return withProject(id, async (p) => templateInto(p, args, await buildPool(p)), by);
  }
  if (op === 'fillCaptions' || op === 'toFreeLayout') {
    return withProject(id, async (p) => {
      const pool = await buildPool(p);
      if (op === 'toFreeLayout') return ops.toFreeLayout(p, args.edition, args.page, (k) => { const it = pool.map.get(k); return it?.w ? it.w / it.h : null; });
      return ops.fillCaptions(p, args.edition, (k) => pool.map.get(k)?.caption || '', { page: args.page ?? null });
    }, by);
  }
  if (!OPS[op]) throw httpError(400, `unknown op: ${op}`);
  return withProject(id, (p) => OPS[op](p, args || {}), by);
}

function printSpecs(ed) {
  const prov = findProvider(ed.provider);
  const sp = spineOf(ed), cs = coverSpec(ed);
  const r = (v) => Math.round(v * 100) / 100;
  const n = ed.pages.length;
  return {
    printShop: prov.name, profileStatus: ed.profileStatus, format: ed.format, binding: ed.binding, paper: ed.paper,
    trim_mm: { w: ed.w, h: ed.h }, bleed_mm: ed.bleed, safety_mm: ed.safety, glue_mm: ed.glue,
    interior: {
      layout: ed.interior, blankEnds: ed.blankEnds, pages: n,
      pdfPages: ed.interior === 'spreads' ? Math.ceil((n + 1) / 2) : n,
      pdfPage_mm: ed.interior === 'spreads' ? { w: r(2 * ed.w + 2 * ed.bleed), h: r(ed.h + 2 * ed.bleed) } : { w: r(ed.w + 2 * ed.bleed), h: r(ed.h + 2 * ed.bleed) },
      rules: { min: ed.pageMin, max: ed.pageMax, step: ed.pageStep }, colour: ed.colourWanted, colorMode: ed.colorMode,
    },
    spine: { mm: r(sp.mm), source: sp.source, exact: sp.exact, printerCalculator: sp.url || ed.spineRule?.url || null, textFromPages: ed.spineTextMin || null },
    cover: {
      mode: ed.cover?.mode || 'spread', template: ed.coverTemplate || null, pdf_mm: { w: r(cs.W), h: r(cs.H) },
      wrap: cs.bleed, joint: cs.joint, hinge: cs.hinge,
      panels_mm: { back: { x: r(cs.back.x), w: r(cs.back.w) }, spine: { x: r(cs.spine.x), w: r(cs.spine.w) }, front: { x: r(cs.front.x), w: r(cs.front.w) } },
    },
    sources: prov.sources,
  };
}

const clean = (v) => String(v ?? '').replace(/[\t\n\r]+/g, ' ');

// Copies the Lightroom Classic plug-in into Lightroom's Modules folder, where Lightroom loads it on start.
async function installLightroomPlugin() {
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lightroom', 'Billerbook.lrplugin');
  const base = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'Lightroom', 'Modules')
    : path.join(process.env.APPDATA || os.homedir(), 'Adobe', 'Lightroom', 'Modules');
  const dest = path.join(base, 'Billerbook.lrplugin');
  await fsp.mkdir(base, { recursive: true });
  await fsp.cp(src, dest, { recursive: true, force: true });
  return { installed: dest, note: 'Restart Lightroom Classic. Then: Library › Plug-in Extras › Billerbook.' };
}

async function lightroomUsage({ missing = false } = {}) {
  const out = [];
  for (const meta of await listProjects()) {
    let pr; try { pr = await loadProject(meta.id); } catch { continue; }
    for (const ed of pr.editions) {
      const keys = new Set();
      for (const pg of ed.pages) for (const s of pg.slots || []) if (s?.key) keys.add(s.key);
      for (const s of ed.coverDesign?.slots || []) if (s?.key) keys.add(s.key);
      const ids = [], files = [];
      for (const k of keys) { if (k.startsWith('lr:')) ids.push(k.slice(3)); else if (k.startsWith('f:')) files.push(k.slice(2)); }
      const row = { projectId: pr.id, project: pr.name, editionId: ed.id, edition: ed.name, ids, files, pages: ed.pages.length };
      if (missing && pr.sources?.lightroom?.catalog) {
        try {
          const pool = await buildPool(pr);
          const used = new Set(ids);
          row.missing = pool.items.filter((it) => it.key.startsWith('lr:') && !used.has(it.key.slice(3))).map((it) => it.key.slice(3));
        } catch { row.missing = []; }
      }
      out.push(row);
    }
  }
  return out;
}

// ---------- jobs (export) ----------
const jobs = new Map();
// parts: interior, cover (print PDFs) · proof (proof PDF) · screen (small PDF for screens) ·
// images (JPEG/PNG of pages or spreads) · carousel (Instagram 4:5) · epub · filelist · originals
// At most two exports run at once; finished jobs are forgotten after an hour.
let jobsRunning = 0;
const jobWaiters = [];
const jobSlot = async () => { if (jobsRunning >= 2) await new Promise((r) => jobWaiters.push(r)); jobsRunning++; };
const jobDone = () => { jobsRunning--; jobWaiters.shift()?.(); };
function startExport(project, edId, { parts = ['interior', 'cover'], preview = false, outDir, images = {}, lang = 'de', pages = '' } = {}) {
  const job = { id: ops.rid(), state: 'queued', done: 0, total: 0, files: [], error: null, step: null };
  for (const [id, j] of jobs) if (j.finished && Date.now() - j.finished > 3600_000) jobs.delete(id);
  jobs.set(job.id, job);
  (async () => {
    await jobSlot();
    job.state = 'running';
    try {
      // Only some pages (e.g. "1-4, 8"): every part works on that selection.
      const ed = subsetEdition(ops.getEdition(project, edId), pages);
      const pool = await buildPool(project);
      const dir = outDir || path.join(os.homedir(), 'Desktop', 'Billerbook-Export');
      await fsp.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const base = `${slug(project.name)}_${slug(ed.name)}_${stamp}${preview ? '_vorschau' : ''}${ed.subset ? `_s${slug(pages)}` : ''}`;
      const n = ed.pages.length;
      const hasCover = ed.cover?.mode !== 'none';
      const weights = { interior: n, cover: hasCover ? 1 : 0, proof: n, screen: n, images: n, carousel: Math.ceil((n + 1) / 2), epub: n, html: Math.ceil((n + 1) / 2), cbz: n, package: 1, filelist: 1, originals: n, overview: Math.ceil((n + 1) / 2), idml: Math.ceil((n + 1) / 2) };
      job.total = parts.reduce((t, x) => t + (weights[x] || 0), 0);
      let offset = 0;
      const prog = (d) => { job.done = offset + d; };
      const title = `${project.name} – ${ed.name}`;
      const step = async (name, fn) => { job.step = name; const r = await fn(); job.files.push({ part: name, ...r }); offset += weights[name] || 0; job.done = offset; };
      if (parts.includes('interior')) await step('interior', () => exportInterior({ ed, pool: pool.map, project, file: path.join(dir, `${base}_interior.pdf`), preview, title, onProgress: prog }));
      if (parts.includes('cover') && hasCover) await step('cover', () => exportCover({ ed, pool: pool.map, project, file: path.join(dir, `${base}_cover.pdf`), preview, title: `${title} – Umschlag` }));
      if (parts.includes('proof')) {
        const warnings = [...ops.preflight(project, ed.id, pool.map), ...extraChecks(project, ed, pool.map)];
        await step('proof', () => exportInterior({ ed, pool: pool.map, project, file: path.join(dir, `${base}_proof.pdf`), preview: true, proof: { warnings, lang }, title, onProgress: prog }));
      }
      if (parts.includes('overview')) await step('overview', () => exportOverview({ project, ed, pool: pool.map, file: path.join(dir, `${base}_overview.pdf`), title, onProgress: (d, t) => prog(t ? Math.round((d / t) * Math.ceil((n + 1) / 2)) : 0) }));
      if (parts.includes('screen')) await step('screen', () => exportInterior({ ed, pool: pool.map, project, file: path.join(dir, `${base}_screen.pdf`), screen: true, title, onProgress: prog }));
      if (parts.includes('images')) await step('images', () => exportImages({ project, ed, pool: pool.map, dir, base, mode: images.mode || 'spreads', width: Math.min(8000, Number(images.width) || 3000), format: images.format || 'jpeg', onProgress: (d, t) => prog(Math.round((d / t) * n)) }));
      if (parts.includes('carousel')) await step('carousel', () => exportCarousel({ project, ed, pool: pool.map, dir, base, onProgress: prog }));
      if (parts.includes('epub')) await step('epub', () => exportEpub({ project, ed, pool: pool.map, file: path.join(dir, `${base}.epub`), title, lang, onProgress: prog }));
      if (parts.includes('html')) await step('html', () => exportHtml({ project, ed, pool: pool.map, dir, base, title, lang, onProgress: prog }));
      if (parts.includes('idml')) await step('idml', () => exportIdml({ project, ed, pool: pool.map, dir, base, onProgress: (d, t) => prog(Math.round((d / t) * Math.ceil((n + 1) / 2))) }));
      if (parts.includes('cbz')) await step('cbz', () => exportCbz({ project, ed, pool: pool.map, file: path.join(dir, `${base}.cbz`), onProgress: prog }));
      if (parts.includes('package')) await step('package', () => exportPackage({ project, pool: pool.map, file: path.join(dir, `${slug(project.name)}.billerbook`), media: true, version: PKG.version }));
      if (parts.includes('filelist')) await step('filelist', () => writeFileList({ ed, pool: pool.map, dir, base }));
      if (parts.includes('originals')) await step('originals', () => collectOriginals({ ed, pool: pool.map, dir, base, onProgress: (d, t) => prog(Math.round((d / t) * n)) }));
      job.dir = dir;
      job.state = 'done';
    } catch (e) { job.state = 'error'; job.error = e.message; log(e); } finally { job.finished = Date.now(); jobDone(); }
  })();
  return job;
}
const slug = (s) => String(s).normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'buch';

// ---------- helpers ----------
const httpError = (status, message) => Object.assign(new Error(message), { status });
async function body(req, limit = 32 << 20) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (limit && size > limit) throw httpError(413, 'request too large');
    chunks.push(c);
  }
  const b = Buffer.concat(chunks);
  // Only a real JSON content type is parsed. "text/plain; x=application/json" is what a foreign web
  // page can send without a CORS preflight, so it must not count as JSON.
  if (/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) {
    try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch { throw httpError(400, 'invalid JSON'); }
  }
  return b;
  return b;
}
function json(res, data, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
const leanItem = (it, u) => ({
  key: it.key, name: it.name, time: it.time, rating: it.rating || 0, label: it.label || '', pick: it.pick || 0,
  w: it.w, h: it.h, hasFile: !!it.file, estimated: !!it.estimated, source: it.source, caption: it.caption || '', focal: it.focal,
  used: u ? Object.fromEntries(u.get(it.key) || []) : undefined,
});
const ICC_CANDIDATES = [
  '/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc',
  '/Library/Application Support/Adobe/Color/Profiles/Recommended/PSOCoated_v3.icc',
  '/Library/ColorSync/Profiles/ISOcoated_v2_eci.icc',
  '/Library/ColorSync/Profiles/PSOcoated_v3.icc',
  path.join(os.homedir(), 'Library/ColorSync/Profiles/ISOcoated_v2_eci.icc'),
  path.join(os.homedir(), 'Library/ColorSync/Profiles/PSOcoated_v3.icc'),
  path.join(os.homedir(), 'Library/ColorSync/Profiles/CoatedFOGRA39.icc'),
  'C:/Windows/System32/spool/drivers/color/ISOcoated_v2_eci.icc',
];
function osascript(script) {
  return new Promise((resolve, reject) => execFile('osascript', ['-e', script], (err, out) => (err ? reject(err) : resolve(out.trim()))));
}

// ---------- remote MCP (HTTP + OAuth) ----------
let remote = null;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
async function handleMcp(req, res, { external, base }) {
  if (external) {
    if (!remote.checkBearer(req.headers.authorization)) {
      res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"` });
      return res.end(JSON.stringify({ error: 'invalid_token' }));
    }
  } else {
    // Local clients need no token, but a web page in the browser must not reach /mcp.
    const origin = req.headers.origin;
    if (origin && !LOCAL_HOSTS.includes(new URL(origin).hostname)) throw httpError(403, 'origin not allowed');
  }
  const { createServer } = await import('./mcp.mjs');
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const srv = createServer({ remote: external });
  res.on('close', () => { transport.close(); srv.close(); });
  await srv.connect(transport);
  let parsed;
  if (req.method === 'POST') { const raw = await body(req, 4 << 20); parsed = Buffer.isBuffer(raw) ? JSON.parse(raw.toString('utf8') || 'null') : raw; }
  await transport.handleRequest(req, res, parsed);
}
const formOf = async (req) => Object.fromEntries(new URLSearchParams((await body(req, 64 << 10)).toString('utf8')));
function oauthError(res, e) {
  return json(res, { error: e.oauth || 'invalid_request', error_description: e.message }, e.status && e.status < 500 ? e.status : 400);
}
// Routes reachable through the public (tunnel) address. Nothing else is.
async function remoteRoute(req, res, { external }) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const base = external ? remote.publicUrl : `http://${req.headers.host}`;
  // OAuth clients in a browser (claude.ai, ChatGPT) call these endpoints cross-origin through the
  // public address. On localhost nothing is shared with other origins.
  const cors = !external ? {} : { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS' && (p.startsWith('/.well-known/') || p.startsWith('/oauth/'))) { res.writeHead(204, cors); return res.end(); }
  if (p === '/.well-known/oauth-authorization-server' || p === '/.well-known/openid-configuration') { res.writeHead(200, { 'content-type': 'application/json', ...cors }); return res.end(JSON.stringify(remote.metadata(base))); }
  if (p.startsWith('/.well-known/oauth-protected-resource')) { res.writeHead(200, { 'content-type': 'application/json', ...cors }); return res.end(JSON.stringify(remote.resourceMetadata(base))); }
  if (p === '/oauth/register' && req.method === 'POST') {
    try {
      const b = await body(req, 64 << 10);
      const out = remote.register(Buffer.isBuffer(b) ? JSON.parse(b.toString('utf8')) : b);
      res.writeHead(201, { 'content-type': 'application/json', ...cors });
      return res.end(JSON.stringify(out));
    } catch (e) { return oauthError(res, e); }
  }
  if (p === '/oauth/authorize') {
    const q = req.method === 'POST' ? await formOf(req) : Object.fromEntries(url.searchParams);
    let client;
    try { client = remote.checkAuthorize(q); } catch (e) { res.writeHead(e.status || 400, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(e.message); }
    const lang = (req.headers['accept-language'] || '').startsWith('de') ? 'de' : 'en';
    // Chrome applies form-action to the redirect after the POST too, so the client's redirect origin
    // must be allowed (it is a registered redirect_uri, checked above).
    const csp = `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(q.redirect_uri).origin}; frame-ancestors 'none'; base-uri 'none'`;
    const html = (h, status = 200) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': csp }); res.end(h); };
    if (req.method !== 'POST') return html(consentPage(q, client, { lang }));
    if (!remote.checkPairing(q.pair)) return html(consentPage(q, client, { lang, error: lang === 'de' ? 'Code falsch oder abgelaufen. In Billerbook einen neuen Code holen.' : 'Wrong or expired code. Get a new code in Billerbook.' }), 403);
    const code = remote.issueCode(q);
    remote.log('approved', `${client.name} → ${new URL(q.redirect_uri).host}`);
    const to = new URL(q.redirect_uri);
    to.searchParams.set('code', code);
    if (q.state) to.searchParams.set('state', q.state);
    broadcast({ type: 'remote' });
    res.writeHead(302, { location: to.toString() });
    return res.end();
  }
  if (p === '/oauth/token' && req.method === 'POST') {
    try {
      const ct = req.headers['content-type'] || '';
      const form = ct.includes('json') ? await body(req, 64 << 10) : await formOf(req);
      const out = remote.token(form);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors });
      return res.end(JSON.stringify(out));
    } catch (e) { return oauthError(res, e); }
  }
  if (p === '/mcp') return handleMcp(req, res, { external, base });
  return false;
}

// The editor runs only its own scripts; inline styles stay allowed (frames are positioned that way).
const EDITOR_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

// ---------- router ----------
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const by = req.headers['x-client'] || 'api';
  let m;
  // API calls carry JSON; only uploads and file imports send raw bytes.
  const ct = req.headers['content-type'] || '';
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && ct && !/^application\/json\s*(;|$)/i.test(ct)
    && !/\/upload$|cover-template|\/projects\/import$|\/print-spec\/read$/.test(p)) throw httpError(415, 'send application/json');

  if (p === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/api/system') {
    return json(res, {
      app: 'Billerbook', version: PKG.version, platform: process.platform, data: DATA, node: process.version, mcp: mcpConfig(),
      icc: ICC_CANDIDATES.filter((f) => fs.existsSync(f)),
      providers: providers(), layouts: LAYOUT_ORDER, coverLayouts: COVER_ORDER,
    });
  }
  if (p === '/api/remote' && req.method === 'GET') return json(res, { ...remote.status(), local: `http://127.0.0.1:${remote.port}/mcp`, stdio: mcpConfig() });
  if (p === '/api/remote/pair' && req.method === 'POST') { const b = await body(req); return json(res, remote.newPairing({ unlock: !!b?.unlock })); }
  if (p === '/api/remote/tunnel' && req.method === 'POST') { const b = await body(req); if (b.action === 'stop') { remote.stopTunnel(); return json(res, remote.status()); } await remote.startTunnel(); return json(res, remote.status()); }
  if (p === '/api/remote/url' && req.method === 'POST') { const b = await body(req); remote.setPublicUrl(b.url || null); return json(res, remote.status()); }
  if (p === '/api/remote/revoke' && req.method === 'POST') { const b = await body(req); remote.revoke(b.id || '*'); return json(res, remote.status()); }
  if (p === '/api/connect/claude-desktop' && req.method === 'POST') return json(res, installClaudeDesktop(mcpConfig()));
  if (p === '/api/projects' && req.method === 'GET') return json(res, await listProjects());
  if (p === '/api/profiles' && req.method === 'GET') return json(res, providers());
  // Print shop data sheet (PDF): text, page sizes and the measurements found in it.
  if (p === '/api/print-spec/read' && req.method === 'POST') {
    const b = await body(req, 50 << 20);
    let buf;
    if (Buffer.isBuffer(b)) buf = b;
    else if (b.url) buf = (await fetchLimited(String(b.url), 50 << 20, 'application/pdf')).buf;
    else if (b.path) {
      if (!/\.pdf$/i.test(String(b.path))) throw httpError(400, 'a .pdf file');
      buf = await fsp.readFile(String(b.path));
    } else throw httpError(400, 'send the PDF, { url } or { path }');
    return json(res, await readSpecSheet(buf));
  }
  if (p === '/api/profiles' && req.method === 'POST') { const pr = saveProfile(await body(req)); broadcast({ type: 'profiles' }); return json(res, pr); }
  if ((m = p.match(/^\/api\/profiles\/([\w-]+)$/)) && req.method === 'DELETE') { deleteProfile(m[1]); broadcast({ type: 'profiles' }); return json(res, { ok: true }); }
  // Lightroom plug-in: which photos are in which edition (Lightroom ids and file paths).
  if (p === '/api/lightroom/usage') return json(res, await lightroomUsage());
  // Same data as tab-separated lines, easy to parse in Lightroom's Lua: H hash, E project edition id, I lr-uuid, F path, M missing lr-uuid
  if (p === '/api/lightroom/usage.txt') {
    const u = await lightroomUsage({ missing: true });
    const lines = [];
    for (const x of u) {
      lines.push(['E', clean(x.project), clean(x.edition), x.editionId].join('\t'));
      for (const id of x.ids) lines.push(`I\t${id}`);
      for (const f of x.files) lines.push(`F\t${clean(f)}`);
      for (const id of x.missing || []) lines.push(`M\t${id}`);
    }
    const body = lines.join('\n');
    const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 12);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(`H\t${hash}\n${body}\n`);
  }
  if (p === '/api/lightroom/install-plugin' && req.method === 'POST') return json(res, await installLightroomPlugin());
  // Only reads a cover template (the editor applies it itself when the edition is saved).
  if (p === '/api/cover-template/read' && req.method === 'POST') {
    const b = await body(req);
    const bytes = Buffer.isBuffer(b) ? b : b.path ? await fsp.readFile(b.path) : null;
    if (!bytes) throw httpError(400, 'send the template PDF as the request body');
    return json(res, await readCoverTemplate(bytes));
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/print-specs$/))) {
    const pr = await loadProject(m[1]);
    const ed = ops.getEdition(pr, url.searchParams.get('edition') ?? 0);
    ops.migrateEdition(ed);
    return json(res, printSpecs(ed));
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/profile-from-edition$/))) {
    const pr = await loadProject(m[1]);
    const ed = ops.getEdition(pr, url.searchParams.get('edition') ?? 0);
    ops.migrateEdition(ed);
    return json(res, profileFromEdition(ed, url.searchParams.get('name') || undefined));
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/cover-template$/)) && req.method === 'POST') {
    const edition = url.searchParams.get('edition');
    const b = await body(req);
    const bytes = Buffer.isBuffer(b) ? b : b.path ? await fsp.readFile(b.path) : null;
    if (!bytes) throw httpError(400, 'send the template PDF as the request body or { path }');
    const t = await readCoverTemplate(bytes);
    const r = await applyOp(m[1], 'setCoverTemplate', { edition, W: t.W, H: t.H, source: 'pdf' }, by);
    return json(res, { template: t, ...r });
  }
  if (p === '/api/projects' && req.method === 'POST') {
    const b = await body(req);
    const pr = await createProject(b);
    broadcast({ type: 'projects' });
    return json(res, pr);
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)$/))) {
    const id = m[1];
    if (req.method === 'GET') return json(res, await loadProject(id));
    if (req.method === 'PUT') {
      const b = await body(req);
      const r = await withProject(id, (cur) => {
        if (b.baseVersion != null && b.baseVersion !== cur.version) throw httpError(409, 'conflict');
        const keepId = cur.id;
        for (const k of Object.keys(cur)) delete cur[k];
        Object.assign(cur, b.project, { id: keepId, version: cur.version });
      }, by);
      return json(res, { version: r.project.version });
    }
    if (req.method === 'DELETE') {
      await fsp.rename(path.join(DATA, 'projects', `${id}.json`), path.join(DATA, 'projects', `${id}.json.deleted`));
      broadcast({ type: 'projects' });
      return json(res, { ok: true });
    }
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/op$/)) && req.method === 'POST') {
    const b = await body(req);
    const r = await applyOp(m[1], b.op, b.args, by);
    return json(res, { result: r.result ?? null, version: r.project.version, project: b.returnProject === false ? undefined : r.project });
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/pool$/))) {
    const pr = await loadProject(m[1]);
    const pool = await buildPool(pr, { refresh: url.searchParams.get('refresh') === '1' });
    const u = ops.usage(pr);
    return json(res, { items: pool.items.map((it) => leanItem(it, u)), builtAt: pool.builtAt, focal: focalProgress(pool.items) });
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/preflight$/))) {
    const pr = await loadProject(m[1]);
    const pool = await buildPool(pr);
    const ed = ops.getEdition(pr, url.searchParams.get('edition') || 0);
    return json(res, { warnings: [...ops.preflight(pr, ed.id, pool.map), ...extraChecks(pr, ed, pool.map)], stats: ops.editionStats(pr, ed.id, pool.items) });
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/summary$/))) {
    const pr = await loadProject(m[1]);
    const pool = await buildPool(pr);
    return json(res, ops.summary(pr, pool.items));
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/overview\.jpg$/))) {
    const pr = await loadProject(m[1]);
    const pool = await buildPool(pr);
    const ed = ops.getEdition(pr, url.searchParams.get('edition') || 0);
    const num = (k, d, lo, hi) => Math.max(lo, Math.min(hi, Number(url.searchParams.get(k)) || d));
    const r = await renderOverview(pr, ed, pool.map, { from: num('from', 0, 0, 100000), count: num('count', 12, 1, 48), cols: num('cols', 4, 1, 8), width: num('w', 2000, 600, 4000), cover: url.searchParams.get('cover') !== '0' });
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-overview': `${r.from}-${r.to}/${r.total}` });
    return res.end(r.buf);
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/spread\.jpg$/))) {
    const pr = await loadProject(m[1]);
    const pool = await buildPool(pr);
    const ed = ops.getEdition(pr, url.searchParams.get('edition') || 0);
    const w = Math.min(4000, Number(url.searchParams.get('w')) || 1600);
    const proof = url.searchParams.get('proof') ? { gamut: url.searchParams.get('gamut') === '1' } : null;
    const o = { proof };
    const buf = url.searchParams.get('cover') ? await renderCover(pr, ed, pool.map, w, { ...o, guides: url.searchParams.get('guides') !== '0' })
      : url.searchParams.get('page') != null ? await renderPage(pr, ed, pool.map, Number(url.searchParams.get('page')), w, o)
        : await renderSpread(pr, ed, pool.map, Number(url.searchParams.get('spread') || 0), w, o);
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
    return res.end(buf);
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/upload$/)) && req.method === 'PUT') {
    let name = path.basename(url.searchParams.get('name') || `bild-${Date.now()}.jpg`).replace(/[^\w.\- ]+/g, '_');
    if (!/\.(jpe?g|png|tiff?|webp|heic|heif|avif)$/i.test(name)) throw httpError(400, 'only image files (jpg, png, tif, webp, heic, avif)');
    const buf = await body(req, 400 << 20);
    if (!Buffer.isBuffer(buf) || !buf.length) throw httpError(400, 'empty upload');
    try { const md = await sharp(buf).metadata(); if (!md.width) throw new Error(); } catch { throw httpError(400, 'not a readable image'); }
    const dir = uploadDir(m[1]);
    if (fs.existsSync(path.join(dir, name))) name = name.replace(/(\.\w+)$/, `-${ops.rid()}$1`);
    await fsp.writeFile(path.join(dir, name), buf, { flag: 'wx' });
    dropPool(m[1]);
    return json(res, { key: `f:${path.join(dir, name)}` });
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/lightroom-book$/)) && req.method === 'POST') {
    const b = await body(req);
    const r = await withProject(m[1], async (pr) => {
      const catalog = b.catalog || pr.sources?.lightroom?.catalog;
      if (!catalog) throw httpError(400, 'no Lightroom catalog');
      const book = await readLightroomBook(catalog, b.collectionId);
      const lr = pr.sources.lightroom || (pr.sources.lightroom = { catalog, collections: [], exportFolder: null });
      lr.catalog = catalog;
      if (!lr.collections.includes(Number(b.collectionId))) lr.collections.push(Number(b.collectionId));
      dropPool(pr.id);
      const ed = ops.addEdition(pr, { name: b.name || 'Lightroom-Buch', provider: b.provider || 'wmd', format: b.format || 'hc-a4-quer' });
      ed.pages = bookToPages(book, ops.newPage);
      ops.normalize(ed);
      return { edition: ed.id, pages: ed.pages.length, paper: book.paper };
    }, by);
    return json(res, { ...r.result, version: r.project.version });
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/export$/)) && req.method === 'POST') {
    const b = await body(req);
    const pr = await loadProject(m[1]);
    const job = startExport(pr, b.edition, b);
    return json(res, job);
  }
  if ((m = p.match(/^\/api\/jobs\/([\w-]+)$/))) {
    const job = jobs.get(m[1]);
    if (!job) throw httpError(404, 'job not found');
    return json(res, job);
  }
  if (p === '/api/thumb') {
    const pr = await loadProject(url.searchParams.get('p'));
    const pool = await buildPool(pr);
    const it = pool.map.get(url.searchParams.get('k'));
    const f = it && (await thumbnail(pr, it, url.searchParams.get('s')));
    if (!f) { res.writeHead(404); return res.end(); }
    const tone = url.searchParams.get('tone'), proofEd = url.searchParams.get('proof');
    if (tone || proofEd) {
      // Toned and soft-proofed thumbnails are made on the fly from the cached thumbnail.
      let buf = tone ? await applyTone(sharp(f), tone, Number(url.searchParams.get('ts') || 0.6)).jpeg({ quality: 85 }).toBuffer() : await fsp.readFile(f);
      if (proofEd) {
        const ed = pr.editions.find((e) => e.id === proofEd);
        buf = await softProof(buf, proofProfile(ed), { gamut: url.searchParams.get('gamut') === '1' });
      }
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' });
      return res.end(buf);
    }
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' });
    return fs.createReadStream(f).pipe(res);
  }
  if (p === '/api/fonts.css') {
    const pr = url.searchParams.get('p') ? await loadProject(url.searchParams.get('p')).catch(() => null) : null;
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-cache' });
    return res.end(fontFaceCss(pr));
  }
  if ((m = p.match(/^\/api\/fonts\/([\w-]+)\/(\d+-(?:normal|italic))$/))) {
    const dir = path.join(DATA, 'fonts', m[1]);
    const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((x) => x.startsWith(m[2])) : null;
    if (!file) { res.writeHead(404); return res.end(); }
    const fontType = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': fontType, 'cache-control': 'private, max-age=86400' });
    return fs.createReadStream(path.join(dir, file)).pipe(res);
  }
  if (p === '/api/design-catalog') {
    const pr = url.searchParams.get('p') ? await loadProject(url.searchParams.get('p')).catch(() => null) : null;
    return json(res, { families: allFamilies(pr), presets: STYLE_PRESETS, templates: TEMPLATES, graphics: GRAPHICS, tones: TONES.map(({ id, name }) => ({ id, name })) });
  }
  // One text frame as SVG outlines: the editor shows exactly the line breaks the PDF will have.
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/text\.svg$/))) {
    const pr = await loadProject(m[1]);
    const ed = ops.getEdition(pr, url.searchParams.get('edition') || 0);
    const idx = Number(url.searchParams.get('frame'));
    let frames, tx, bg;
    if (url.searchParams.get('cover')) {
      frames = coverFrames(ed).frames; tx = ed.coverDesign?.texts?.[idx]; bg = ed.coverDesign?.bg || '#ffffff';
    } else {
      const own = pageOwner(ed, Number(url.searchParams.get('page')));
      frames = buildFrames(ed, own.owner); const pg = ed.pages[own.owner]; tx = pg.texts?.[idx]; bg = pg.bg || ed.bg || '#ffffff';
    }
    const f = frames.find((x) => x.kind === 'text' && x.text === idx);
    if (!f) throw httpError(404, 'no such text frame');
    let body = '', overflow = false;
    if (tx?.value?.trim()) {
      const st = resolveStyle(ed, f.role || 'body', tx);
      const local = { ...f, x: 0, y: 0 };
      const r = textFrameCommands(pr, st, tx.value, local, { rotate: f.role === 'spine' });
      overflow = r.overflow;
      body = `<path d="${svgPath(r.cmds, 1)}" fill="${safeColor(st.color, luminance(bg) < 0.45 ? '#ffffff' : '#1a1a1a')}"/>`;
    }
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store', 'x-overflow': overflow ? '1' : '0' });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f.w} ${f.h}" width="${f.w}mm" height="${f.h}mm" overflow="visible">${body}</svg>`);
  }
  // How a template would look with this project's photos (nothing is saved).
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/template-preview\.jpg$/))) {
    const pr = structuredClone(await loadProject(m[1]));
    const pool = await buildPool(pr);
    const edArg = url.searchParams.get('edition') || 0;
    templateInto(pr, { edition: edArg, template: url.searchParams.get('template'), relayout: true, lang: url.searchParams.get('lang') || 'de' }, pool);
    const ed = ops.getEdition(pr, edArg);
    const w = Math.min(1600, Number(url.searchParams.get('w')) || 900);
    const what = url.searchParams.get('what') || 'cover';
    const buf = what === 'cover' ? await renderCover(pr, ed, pool.map, w, { guides: false }) : await renderSpread(pr, ed, pool.map, Number(what.replace('spread', '')) || 1, w, { placeholders: false });
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=60' });
    return res.end(buf);
  }
  if (p === '/api/projects/import' && req.method === 'POST') {
    const b = await body(req);
    if (!b.path || !String(b.path).endsWith('.billerbook')) throw httpError(400, 'choose a .billerbook file');
    const r = await importPackage(b.path);
    broadcast({ type: 'projects' });
    return json(res, r);
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/import-html$/)) && req.method === 'POST') {
    const b = await body(req);
    if (!b.source) throw httpError(400, 'source (URL or .html file) required');
    const dir = path.join(DATA, 'imports', m[1], `web-${ops.rid()}`);
    const src = await loadHtmlSource(String(b.source), dir, { maxImages: Math.max(0, Math.min(400, Number(b.maxPhotos) || 0)) });
    const r = await withProject(m[1], (pr) => {
      let ed;
      if (b.newEdition) ed = ops.addEdition(pr, { name: (b.newEdition === true ? src.title : b.newEdition) || 'Web', provider: 'wmd', format: 'hc-a4-quer' });
      else ed = ops.getEdition(pr, b.edition ?? 0);
      const pages = blocksToPages(src.blocks, ops.newPage);
      if (b.at != null) ed.pages.splice(Number(b.at), 0, ...pages); else ed.pages.push(...pages);
      pr.sources.files = [...new Set([...(pr.sources.files || []), ...src.blocks.filter((x) => x.file).map((x) => x.file)])];
      ops.normalize(ed);
      dropPool(pr.id);
      return { edition: ed.id, pages: pages.length, photos: src.blocks.filter((x) => x.kind === 'image').length, failed: src.failed, title: src.title };
    }, by);
    return json(res, { ...r.result, version: r.project.version });
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/files$/))) {
    const pr = await loadProject(m[1]);
    const pool = await buildPool(pr);
    const ed = ops.getEdition(pr, url.searchParams.get('edition') || 0);
    return json(res, usedFiles(ed, pool.map));
  }
  if (p === '/api/captureone/collections' && req.method === 'POST') return json(res, await listCaptureOneCollections());
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/captureone$/)) && req.method === 'POST') {
    const b = await body(req);
    const ids = (Array.isArray(b.collections) ? b.collections : []).map(String).filter((s) => s && s.length < 200).slice(0, 200);
    const exportFolder = typeof b.exportFolder === 'string' && b.exportFolder.trim() ? path.resolve(b.exportFolder.trim()) : null;
    if (exportFolder && !fs.existsSync(exportFolder)) throw httpError(400, 'export folder not found');
    const snap = ids.length ? await captureOneVariants(ids) : { document: '', items: [] };
    const r = await withProject(m[1], async (pr) => {
      if (!ids.length) { delete pr.sources.captureone; dropPool(pr.id); return { variants: 0 }; }
      pr.sources.captureone = { document: snap.document, collections: ids, exportFolder, snapshot: snap.items, readAt: new Date().toISOString() };
      dropPool(pr.id);
      const pool = await buildPool(pr, { refresh: true });
      const inPool = pool.items.filter((it) => it.source === 'captureone').length;
      return { document: snap.document, variants: snap.items.length, usable: inPool, needExport: snap.items.length - inPool, rawOnly: snap.items.filter((v) => !C1_PRINTABLE.test(v.file)).length };
    }, by);
    return json(res, { ...r.result, version: r.project.version });
  }
  if (p === '/api/lightroom/collections' && req.method === 'POST') {
    const b = await body(req);
    return json(res, await listCollections(b.catalog));
  }
  if (p === '/api/pick' && req.method === 'POST') {
    const b = await body(req);
    if (process.platform !== 'darwin') throw httpError(501, 'native picker only on macOS');
    const prompt = (b.prompt || '').replace(/"/g, "'");
    const script = b.kind === 'file' ? `POSIX path of (choose file with prompt "${prompt}")` : `POSIX path of (choose folder with prompt "${prompt}")`;
    try { return json(res, { path: (await osascript(script)).replace(/\/$/, '') }); } catch { return json(res, { path: null }); }
  }
  if (p === '/api/reveal' && req.method === 'POST') {
    const b = await body(req);
    if (process.platform === 'darwin') execFile('open', ['-R', b.path]);
    return json(res, { ok: true });
  }

  // static
  // PDF.js for importing PDFs in the editor (rendered in the browser, nothing leaves the Mac).
  if (p.startsWith('/vendor/pdfjs/')) {
    const dir = path.join(ROOT, 'node_modules', 'pdfjs-dist', 'build');
    const ff = path.join(dir, path.basename(p));
    if (!/^pdf(\.worker)?\.min\.mjs$/.test(path.basename(p)) || !fs.existsSync(ff)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=604800' });
    return fs.createReadStream(ff).pipe(res);
  }
  if (p.startsWith('/fonts/')) {
    const ff = path.join(FONT_DIR, decodeURIComponent(p.slice(7)));
    if (!ff.startsWith(FONT_DIR) || !fs.existsSync(ff)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(ff)] || 'application/octet-stream', 'cache-control': 'public, max-age=604800' });
    return fs.createReadStream(ff).pipe(res);
  }
  let f = path.join(PUBLIC, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!f.startsWith(PUBLIC)) throw httpError(403, 'forbidden');
  try {
    const st = await fsp.stat(f);
    if (st.isDirectory()) f = path.join(f, 'index.html');
    const head = { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' };
    if (f.endsWith('.html')) head['content-security-policy'] = EDITOR_CSP;
    res.writeHead(200, head);
    fs.createReadStream(f).pipe(res);
  } catch { res.writeHead(404); res.end('not found'); }
}

function sameOrigin(req, hostHeader) {
  // Browsers set Sec-Fetch-Site themselves; pages cannot forge it.
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin' || site === 'none';
  const o = req.headers.origin;
  if (o === undefined) return true; // curl, Node, the Lightroom plug-in, the MCP bridge
  try { return new URL(o).host === hostHeader; } catch { return false; } // includes "null"
}

export function start({ port = PORT, open = false } = {}) {
  loadProfiles();
  remote = new Remote(DATA, { port });
  const server = http.createServer(async (req, res) => {
    // The editor and the API answer only on localhost. Through the public tunnel address only the
    // OAuth endpoints and /mcp (with a bearer token) are reachable.
    const hostHeader = req.headers.host || '';
    const host = hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0];
    const local = LOCAL_HOSTS.includes(host) && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'];
    // cloudflared may pass the public host or rewrite it to the origin; a running tunnel plus its
    // Cf-Connecting-Ip header also marks a request as coming from outside.
    const external = !local && (remote.isPublicHost(hostHeader) || remote.isPublicHost(req.headers['x-forwarded-host']) || (!!remote.tunnel && !!req.headers['cf-connecting-ip']));
    if (!local && !external) { res.writeHead(403); return res.end(); }
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    if (!res.hasHeader('x-frame-options')) res.setHeader('x-frame-options', 'DENY');
    // CSRF: the local API has no login, so a request that changes something must come from the
    // editor itself (same origin) or from a non-browser client (no Origin header at all).
    if (local && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin(req, hostHeader)) {
      res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('cross-origin request refused');
    }
    try {
      const done = await remoteRoute(req, res, { external });
      if (done !== false) return;
      if (external) { res.writeHead(404); return res.end(); }
      await route(req, res);
    } catch (e) {
      if (e.status !== 409) log(e.message);
      if (!res.headersSent) json(res, { error: e.message }, e.status || 500); else res.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      port = server.address().port;
      remote.port = port;
      try { fs.writeFileSync(path.join(DATA, 'server.json'), JSON.stringify({ port, pid: process.pid, version: PKG.version })); } catch {}
      log(`running on http://localhost:${port}  ·  data: ${DATA}`);
      if (open && process.platform === 'darwin') execFile('open', [`http://localhost:${port}`]);
      resolve(server);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  start({ open: process.argv.includes('--open') }).catch((e) => { log(e.message); process.exit(1); });
}
