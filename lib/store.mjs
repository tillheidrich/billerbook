// Projects on disk, the image pool and thumbnails.

import { checkProject } from '../public/lib/safe.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import exifr from 'exifr';
import { collectionImages, scanFolder, matchExports, lightroomPreview, lightroomCroppedSizes, hash, CACHE } from './catalog.mjs';
import { newProject, addEdition } from '../public/lib/ops.js';
import { captureOneItems, PRINTABLE } from './captureone.mjs';

// macOS: ~/Library/Application Support/Billerbook (shared by the app, the CLI server and the MCP server).
export const DATA = path.resolve(process.env.BILLERBOOK_DATA || (process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'Billerbook')
  : process.platform === 'win32' ? path.join(process.env.APPDATA || os.homedir(), 'Billerbook') : path.join(os.homedir(), '.billerbook')));
const PROJECTS = path.join(DATA, 'projects');
const UPLOADS = path.join(DATA, 'uploads');
const THUMBS = path.join(CACHE, 'thumbs');
for (const d of [PROJECTS, UPLOADS, THUMBS]) fs.mkdirSync(d, { recursive: true });

sharp.cache({ memory: 256, files: 0 });

// ---------- Projects ----------
const pfile = (id) => path.join(PROJECTS, `${id.replace(/[^\w-]/g, '')}.json`);

export async function listProjects() {
  const out = [];
  for (const f of await fsp.readdir(PROJECTS)) {
    if (!f.endsWith('.json')) continue;
    try {
      const p = JSON.parse(await fsp.readFile(path.join(PROJECTS, f), 'utf8'));
      out.push({ id: p.id, name: p.name, editions: p.editions.map((e) => ({ id: e.id, name: e.name, pages: e.pages.length })), updatedAt: p.updatedAt });
    } catch {}
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function loadProject(id) {
  return JSON.parse(await fsp.readFile(pfile(id), 'utf8'));
}

export async function saveProject(p) {
  // Colours and font names end up in SVG/CSS strings: refuse markup before it is stored.
  const bad = checkProject(p);
  if (bad.length) throw Object.assign(new Error(`invalid value at ${bad[0].path}`), { status: 400 });
  p.version = (p.version || 0) + 1;
  p.updatedAt = new Date().toISOString();
  const f = pfile(p.id);
  if (fs.existsSync(f)) await fsp.copyFile(f, `${f}.bak`);
  const tmp = `${f}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(p));
  await fsp.rename(tmp, f);
  return p.version;
}

export async function createProject({ name, folder, catalog, collections, editions } = {}) {
  const p = newProject(name || 'Photo book');
  if (folder) p.sources.folders.push(folder);
  if (catalog) p.sources.lightroom = { catalog, collections: (collections || []).map(Number), exportFolder: null };
  for (const e of editions || [{ name: 'Hardcover', provider: 'wmd', format: 'hc-a4-quer' }, { name: 'Softcover', provider: 'wmd', format: 'sc-a4-hoch' }]) addEdition(p, e);
  await saveProject(p);
  return p;
}

export const uploadDir = (id) => { const d = path.join(UPLOADS, id); fs.mkdirSync(d, { recursive: true }); return d; };

// ---------- Metadata ----------
const META_FILE = path.join(CACHE, 'meta.json');
let meta = {};
try { meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch {}
let metaTimer = null;
const persistMeta = () => { clearTimeout(metaTimer); metaTimer = setTimeout(() => fs.writeFile(META_FILE, JSON.stringify(meta), () => {}), 1500); };

export async function fileMeta(file) {
  let st;
  try { st = await fsp.stat(file); } catch { return null; }
  const sig = `${st.mtimeMs}|${st.size}`;
  const hit = meta[file];
  if (hit && hit.sig === sig) return hit;
  let w = 0, h = 0, time = null, rating = 0, caption = '';
  try {
    const m = await sharp(file, { failOn: 'none' }).metadata();
    const rot = (m.orientation || 1) >= 5;
    w = rot ? m.height : m.width; h = rot ? m.width : m.height;
  } catch { return null; }
  try {
    const ex = await exifr.parse(file, { tiff: true, exif: true, xmp: true, iptc: true, icc: false });
    const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : v.value ?? (Array.isArray(v) ? txt(v[0]) : ''));
    caption = String(txt(ex?.description) || txt(ex?.Caption) || txt(ex?.['Caption-Abstract']) || txt(ex?.ImageDescription) || txt(ex?.title) || '').trim();
    const d = ex?.DateTimeOriginal || ex?.CreateDate || ex?.DateTimeDigitized;
    if (d instanceof Date && !isNaN(d)) time = d.toISOString();
    rating = Number(ex?.Rating ?? ex?.xmp?.Rating ?? 0) || 0;
  } catch {}
  if (!time) time = new Date(st.mtimeMs).toISOString();
  meta[file] = { sig, w, h, time, rating, caption };
  persistMeta();
  return meta[file];
}

async function pMap(list, fn, n = 8) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); }
  }));
  return out;
}

// ---------- Pool ----------
const pools = new Map();

function poolSig(p) {
  return JSON.stringify(p.sources || {});
}

export async function buildPool(project, { refresh = false } = {}) {
  const sig = poolSig(project);
  const hit = pools.get(project.id);
  if (!refresh && hit && hit.sig === sig) return hit;
  const items = [];
  const lr = project.sources?.lightroom;
  if (lr?.catalog && lr.collections?.length) {
    const lrItems = await collectionImages(lr.catalog, lr.collections);
    if (lr.exportFolder) matchExports(lrItems, await scanFolder(lr.exportFolder, 4));
    const cropped = lightroomCroppedSizes(lr.catalog);
    await pMap(lrItems, async (it) => {
      if (it.file) {
        const m = await fileMeta(it.file);
        if (m) { it.w = m.w; it.h = m.h; if (!it.caption && m.caption) it.caption = m.caption; } else delete it.file;
      }
      if (!it.w) {
        const c = cropped.get(it.lrId);
        // Previews are downscaled: keep the crop's aspect, scale to the raw long side.
        if (c?.w && c?.h) { const k = Math.max(it.lrW, it.lrH) / Math.max(c.w, c.h); it.w = Math.round(c.w * k); it.h = Math.round(c.h * k); }
        else { it.w = it.lrW; it.h = it.lrH; }
        it.estimated = true;
      }
    });
    items.push(...lrItems);
  }
  const c1 = project.sources?.captureone;
  if (c1?.snapshot?.length) {
    const c1Items = captureOneItems(c1.snapshot);
    if (c1.exportFolder) matchExports(c1Items, await scanFolder(c1.exportFolder, 4));
    for (const it of c1Items) if (!it.file && it.original && PRINTABLE.test(it.original) && fs.existsSync(it.original)) it.file = it.original;
    await pMap(c1Items, async (it) => {
      if (!it.file) return;
      const m = await fileMeta(it.file);
      if (m) { it.w = m.w; it.h = m.h; it.time = m.time; if (!it.caption && m.caption) it.caption = m.caption; } else delete it.file;
    });
    // A RAW variant without a processed file has nothing Billerbook can show or print yet.
    items.push(...c1Items.filter((it) => it.file));
  }
  const folders = [...(project.sources?.folders || []), uploadDir(project.id)];
  for (const dir of folders) {
    const files = await scanFolder(dir, 3);
    const metas = await pMap(files, fileMeta);
    files.forEach((f, k) => {
      const m = metas[k];
      if (!m) return;
      items.push({ key: `f:${f}`, name: path.basename(f), file: f, w: m.w, h: m.h, time: m.time, rating: m.rating, caption: m.caption || '', label: '', source: 'folder', folder: dir });
    });
  }
  for (const f of project.sources?.files || []) {
    const m = await fileMeta(f);
    if (m) items.push({ key: `f:${f}`, name: path.basename(f), file: f, w: m.w, h: m.h, time: m.time, rating: m.rating, caption: m.caption || '', label: '', source: 'file' });
  }
  const seen = new Set();
  const unique = items.filter((it) => (seen.has(it.key) ? false : (seen.add(it.key), true)));
  unique.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const res = { sig, items: unique, map: new Map(unique.map((i) => [i.key, i])), builtAt: Date.now() };
  for (const it of unique) { const f = focals[focalKey(project, it)]; if (f) it.focal = f; }
  pools.set(project.id, res);
  computeFocals(project, unique);
  return res;
}

// ---------- Smart crop: focal point per photo ----------
// Saliency ("attention") of libvips on a 400 px thumbnail, once per photo, cached.
const FOCAL_FILE = path.join(CACHE, 'focal.json');
let focals = {};
try { focals = JSON.parse(fs.readFileSync(FOCAL_FILE, 'utf8')); } catch {}
let focalTimer = null;
const focalKey = (project, it) => (it.file ? `f|${it.file}` : `lr|${project.sources?.lightroom?.catalog}|${it.lrId}`);
const focalRunning = new Set();
export async function focalPoint(file) {
  const img = sharp(file, { failOn: 'none' });
  const { width: w, height: h } = await img.metadata();
  const cw = Math.max(1, Math.round(w * 0.45)), ch = Math.max(1, Math.round(h * 0.45));
  const a = await sharp(file).resize(cw, h, { fit: 'cover', position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
  const b = await sharp(file).resize(w, ch, { fit: 'cover', position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
  const left = -(a.info.cropOffsetLeft ?? 0), top = -(b.info.cropOffsetTop ?? 0);
  return { x: +((Math.abs(left) + cw / 2) / w).toFixed(3), y: +((Math.abs(top) + ch / 2) / h).toFixed(3) };
}
async function computeFocals(project, items) {
  if (focalRunning.has(project.id)) return;
  const todo = items.filter((it) => !it.focal);
  if (!todo.length) return;
  focalRunning.add(project.id);
  try {
    await pMap(todo, async (it) => {
      try {
        const t = await thumbnail(project, it, 400);
        if (!t) return;
        const f = await focalPoint(t);
        it.focal = f;
        focals[focalKey(project, it)] = f;
      } catch {}
    }, 4);
    clearTimeout(focalTimer);
    focalTimer = setTimeout(() => fs.writeFile(FOCAL_FILE, JSON.stringify(focals), () => {}), 500);
  } finally { focalRunning.delete(project.id); }
}
export const focalProgress = (items) => ({ done: items.filter((i) => i.focal).length, total: items.length });

export function dropPool(id) { pools.delete(id); }

// ---------- Thumbnails ----------
export async function thumbnail(project, item, size) {
  const s = Math.max(64, Math.min(2400, Number(size) || 400));
  let srcSig;
  if (item.file) {
    const st = await fsp.stat(item.file).catch(() => null);
    srcSig = st ? `${item.file}|${st.mtimeMs}|${st.size}` : null;
  }
  if (!srcSig && item.lrId) srcSig = `lr|${project.sources?.lightroom?.catalog}|${item.lrId}`;
  if (!srcSig) return null;
  const f = path.join(THUMBS, `${hash(srcSig)}-${s}.jpg`);
  if (fs.existsSync(f)) return f;
  let input = item.file;
  if (!input || !fs.existsSync(input)) input = await lightroomPreview(project.sources.lightroom.catalog, item.lrId);
  if (!input) return null;
  await sharp(input, { failOn: 'none' }).rotate().resize(s, s, { fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').jpeg({ quality: 82 }).toFile(f);
  return f;
}
