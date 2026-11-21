#!/usr/bin/env node
// Billerbook – local server (UI + HTTP API). Everything runs on this machine.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as ops from './public/lib/ops.js';
import { PROVIDERS } from './public/lib/providers.js';
import { LAYOUT_ORDER, COVER_ORDER } from './public/lib/layouts.js';
import { listProjects, loadProject, saveProject, createProject, buildPool, dropPool, thumbnail, uploadDir, focalProgress, DATA } from './lib/store.mjs';
import { listCollections, readLightroomBook, bookToPages } from './lib/catalog.mjs';
import { exportInterior, exportCover } from './lib/pdf.mjs';
import { renderSpread, renderCover } from './lib/preview.mjs';

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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

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
  setSources: (p, a) => { p.sources = { ...p.sources, ...a.sources }; dropPool(p.id); },
  rename: (p, a) => { p.name = a.name; },
};

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
      return ops.autoFill(p, ed.id, items, args);
    }, by);
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

// ---------- jobs (export) ----------
const jobs = new Map();
function startExport(project, edId, { parts = ['interior', 'cover'], preview = false, outDir } = {}) {
  const job = { id: ops.rid(), state: 'running', done: 0, total: 0, files: [], error: null };
  jobs.set(job.id, job);
  (async () => {
    try {
      const ed = ops.getEdition(project, edId);
      const pool = await buildPool(project);
      const dir = outDir || path.join(os.homedir(), 'Desktop', 'Billerbook-Export');
      await fsp.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const base = `${slug(project.name)}_${slug(ed.name)}_${stamp}${preview ? '_vorschau' : ''}`;
      job.total = (parts.includes('interior') ? ed.pages.length : 0) + (parts.includes('cover') ? 1 : 0);
      if (parts.includes('interior')) {
        const r = await exportInterior({ ed, pool: pool.map, file: path.join(dir, `${base}_inhalt.pdf`), preview, title: `${project.name} – ${ed.name}`, onProgress: (d) => { job.done = d; } });
        job.files.push({ part: 'interior', ...r });
      }
      if (parts.includes('cover')) {
        const r = await exportCover({ ed, pool: pool.map, file: path.join(dir, `${base}_umschlag.pdf`), preview, title: `${project.name} – ${ed.name} – Umschlag` });
        job.files.push({ part: 'cover', ...r });
        job.done++;
      }
      job.state = 'done';
    } catch (e) { job.state = 'error'; job.error = e.message; log(e); }
  })();
  return job;
}
const slug = (s) => String(s).normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'buch';

// ---------- helpers ----------
const httpError = (status, message) => Object.assign(new Error(message), { status });
async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const b = Buffer.concat(chunks);
  if ((req.headers['content-type'] || '').includes('application/json')) return b.length ? JSON.parse(b.toString('utf8')) : {};
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

// ---------- router ----------
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const by = req.headers['x-client'] || 'api';
  let m;

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
      providers: PROVIDERS, layouts: LAYOUT_ORDER, coverLayouts: COVER_ORDER,
    });
  }
  if (p === '/api/projects' && req.method === 'GET') return json(res, await listProjects());
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
    return json(res, { warnings: ops.preflight(pr, ed.id, pool.map), stats: ops.editionStats(pr, ed.id, pool.items) });
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/summary$/))) {
    const pr = await loadProject(m[1]);
    const pool = await buildPool(pr);
    return json(res, ops.summary(pr, pool.items));
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/spread\.jpg$/))) {
    const pr = await loadProject(m[1]);
    const pool = await buildPool(pr);
    const ed = ops.getEdition(pr, url.searchParams.get('edition') || 0);
    const w = Number(url.searchParams.get('w')) || 1600;
    const buf = url.searchParams.get('cover') ? await renderCover(pr, ed, pool.map, w) : await renderSpread(pr, ed, pool.map, Number(url.searchParams.get('spread') || 0), w);
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
    return res.end(buf);
  }
  if ((m = p.match(/^\/api\/project\/([\w-]+)\/upload$/)) && req.method === 'PUT') {
    const name = path.basename(url.searchParams.get('name') || `bild-${Date.now()}.jpg`);
    const dir = uploadDir(m[1]);
    await fsp.writeFile(path.join(dir, name), await body(req));
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
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' });
    return fs.createReadStream(f).pipe(res);
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
  let f = path.join(PUBLIC, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!f.startsWith(PUBLIC)) throw httpError(403, 'forbidden');
  try {
    const st = await fsp.stat(f);
    if (st.isDirectory()) f = path.join(f, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  } catch { res.writeHead(404); res.end('not found'); }
}

export function start({ port = PORT, open = false } = {}) {
  const server = http.createServer(async (req, res) => {
    // Only local clients.
    const host = (req.headers.host || '').split(':')[0];
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) { res.writeHead(403); return res.end(); }
    try { await route(req, res); } catch (e) {
      if (e.status !== 409) log(e.message);
      if (!res.headersSent) json(res, { error: e.message }, e.status || 500); else res.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      port = server.address().port;
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
