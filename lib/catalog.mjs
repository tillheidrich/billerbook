// Lightroom Classic catalog (read-only), Lightroom previews, Lightroom book import,
// and plain image folders. Nothing here ever writes to a catalog.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import os from 'node:os';
const DATA_DIR = process.env.BILLERBOOK_DATA || (process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'Billerbook')
  : process.platform === 'win32' ? path.join(process.env.APPDATA || os.homedir(), 'Billerbook') : path.join(os.homedir(), '.billerbook'));
const CACHE = path.resolve(process.env.BILLERBOOK_CACHE || path.join(DATA_DIR, 'cache'));
fs.mkdirSync(CACHE, { recursive: true });

// ---------- Catalog ----------
const dbs = new Map();

export async function openCatalog(file) {
  const st = await fsp.stat(file);
  const sig = `${file}|${st.mtimeMs}|${st.size}`;
  const hit = dbs.get(file);
  if (hit && hit.sig === sig) return hit.db;
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    db.prepare('select count(*) n from AgLibraryCollection').get();
  } catch (e) {
    // Lightroom keeps an exclusive lock while it runs: read a private copy instead.
    try { db?.close(); } catch {}
    const copy = path.join(CACHE, `catalog-${hash(sig)}.lrcat`);
    if (!fs.existsSync(copy)) {
      for (const f of fs.readdirSync(CACHE)) if (f.startsWith('catalog-') && f.endsWith('.lrcat')) fs.rmSync(path.join(CACHE, f), { force: true });
      await fsp.copyFile(file, copy);
    }
    db = new DatabaseSync(copy, { readOnly: true });
  }
  dbs.set(file, { sig, db });
  return db;
}

export async function listCollections(file) {
  const db = await openCatalog(file);
  const rows = db.prepare(`select c.id_local id, c.name, c.creationId kind, c.parent,
      (select count(*) from AgLibraryCollectionImage ci where ci.collection = c.id_local) n
    from AgLibraryCollection c
    where c.creationId in ('com.adobe.ag.library.collection','com.adobe.ag.layout.book','com.adobe.ag.library.group')`).all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathOf = (r) => { const parts = []; let p = r; while (p) { parts.unshift(p.name); p = byId.get(p.parent); } return parts.join(' / '); };
  return rows.filter((r) => r.kind !== 'com.adobe.ag.library.group').map((r) => ({
    id: r.id, name: r.name, path: pathOf(r), count: r.n, type: r.kind === 'com.adobe.ag.layout.book' ? 'book' : 'collection',
  })).sort((a, b) => a.path.localeCompare(b.path));
}

export async function collectionImages(file, ids) {
  const db = await openCatalog(file);
  const list = ids.map(Number).filter(Number.isFinite);
  if (!list.length) return [];
  const rows = db.prepare(`select distinct i.id_local, i.id_global, i.captureTime, i.fileWidth, i.fileHeight, i.orientation,
      i.rating, i.pick, i.colorLabels, i.copyName, ip.caption, f.baseName, f.extension, fo.pathFromRoot, r.absolutePath
    from AgLibraryCollectionImage ci
    join Adobe_images i on i.id_local = ci.image
    join AgLibraryFile f on f.id_local = i.rootFile
    join AgLibraryFolder fo on fo.id_local = f.folder
    join AgLibraryRootFolder r on r.id_local = fo.rootFolder
    left join AgLibraryIptc ip on ip.image = i.id_local
    where ci.collection in (${list.map(() => '?').join(',')})
    order by i.captureTime`).all(...list);
  return rows.map((r) => {
    const rot = ['BC', 'DA', 'CB', 'AD'].includes(r.orientation); // 90° / 270° variants swap sides
    const w = r.fileWidth, h = r.fileHeight;
    return {
      key: `lr:${r.id_global}`, lrId: r.id_local, name: r.copyName ? `${r.baseName} (${r.copyName})` : r.baseName,
      baseName: r.baseName, ext: r.extension, original: `${r.absolutePath}${r.pathFromRoot}${r.baseName}.${r.extension}`,
      time: r.captureTime, rating: r.rating || 0, pick: r.pick || 0, label: r.colorLabels || '',
      lrW: rot ? h : w, lrH: rot ? w : h, source: 'lightroom', caption: r.caption || '',
    };
  });
}

// ---------- Lightroom previews (Previews.lrdata) ----------
export async function lightroomPreview(catalogFile, lrId) {
  const dir = catalogFile.replace(/\.lrcat$/i, ' Previews.lrdata');
  const dbFile = path.join(dir, 'previews.db');
  if (!fs.existsSync(dbFile)) return null;
  let db = dbs.get(dbFile)?.db;
  if (!db) { db = new DatabaseSync(dbFile, { readOnly: true }); dbs.set(dbFile, { sig: '', db }); }
  let row;
  try { row = db.prepare('select uuid, digest from ImageCacheEntry where imageId = ?').get(lrId); } catch { return null; }
  if (!row) return null;
  const f = path.join(dir, row.uuid[0], row.uuid.slice(0, 4), `${row.uuid}-${row.digest}.lrprev`);
  if (!fs.existsSync(f)) return null;
  return largestJpeg(await fsp.readFile(f));
}

// Cropped size as developed in Lightroom (the raw file size ignores crops).
export function lightroomCroppedSizes(catalogFile) {
  const dbFile = path.join(catalogFile.replace(/\.lrcat$/i, ' Previews.lrdata'), 'previews.db');
  const out = new Map();
  if (!fs.existsSync(dbFile)) return out;
  try {
    const db = new DatabaseSync(dbFile, { readOnly: true });
    for (const r of db.prepare(`select e.imageId id, p.croppedWidth w, p.croppedHeight h
        from ImageCacheEntry e join Pyramid p on p.uuid = e.uuid and p.digest = e.digest`).all()) out.set(r.id, { w: r.w, h: r.h });
    db.close();
  } catch {}
  return out;
}

// .lrprev = several "AgHg" sections, the image levels are plain JPEGs.
export function largestJpeg(buf) {
  let best = null, i = 0;
  while ((i = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), i)) !== -1) {
    const next = buf.indexOf('AgHg', i);
    const endLimit = next === -1 ? buf.length : next;
    const eoi = buf.lastIndexOf(Buffer.from([0xff, 0xd9]), endLimit);
    if (eoi > i) { const len = eoi + 2 - i; if (!best || len > best.len) best = { start: i, len }; }
    i = next === -1 ? buf.length : next;
  }
  return best ? buf.subarray(best.start, best.start + best.len) : null;
}

// ---------- Lightroom book import ----------
// Lightroom stores books as a serialized Lua table in AgLibraryCollectionContent.
export function parseLua(src) {
  let i = src.indexOf('{');
  const ws = () => { for (;;) { while (/\s/.test(src[i])) i++; if (src.startsWith('--', i)) { while (i < src.length && src[i] !== '\n') i++; } else break; } };
  const ident = () => { const m = /^[A-Za-z_][\w]*/.exec(src.slice(i, i + 200)); if (!m) return null; i += m[0].length; return m[0]; };
  function str() {
    const q = src[i++]; let out = '';
    while (i < src.length && src[i] !== q) {
      let c = src[i++];
      if (c === '\\') {
        const e = src[i++];
        if (e === 'n') c = '\n'; else if (e === 't') c = '\t'; else if (e === 'r') c = '\r';
        else if (e === '\n') c = '\n';
        else if (/\d/.test(e)) { let d = e; while (d.length < 3 && /\d/.test(src[i])) d += src[i++]; c = String.fromCharCode(Number(d)); }
        else c = e;
      }
      out += c;
    }
    i++;
    return out;
  }
  function value() {
    ws();
    const c = src[i];
    if (c === '{') return table();
    if (c === '"' || c === "'") return str();
    const m = /^-?(?:\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)/i.exec(src.slice(i, i + 40));
    if (m) { i += m[0].length; return Number(m[0]); }
    const id = ident();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'nil') return null;
    ws();
    if (src[i] === '(') { i++; const args = []; ws(); while (src[i] !== ')') { args.push(value()); ws(); if (src[i] === ',') i++; ws(); } i++; return { __call: id, args }; }
    return id;
  }
  function table() {
    i++; const obj = {}; const arr = [];
    for (;;) {
      ws();
      if (src[i] === '}') { i++; break; }
      let key = null;
      const save = i;
      if (src[i] === '[') { i++; key = value(); ws(); i++; ws(); i++; }
      else { const id = ident(); ws(); if (id && src[i] === '=' && src[i + 1] !== '=') { key = id; i++; } else i = save; }
      const v = value();
      if (key == null) arr.push(v); else obj[key] = v;
      ws(); if (src[i] === ',' || src[i] === ';') i++;
    }
    if (arr.length && !Object.keys(obj).length) return arr;
    if (arr.length) obj.__array = arr;
    return obj;
  }
  return value();
}

function plainTextFromAte(xml = '') {
  const m = [...xml.matchAll(/<Text[^>]*>([^<]*)<\/Text>/g)].map((x) => x[1]).join(' ').trim();
  return m.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\r/g, '\n');
}

function collectCells(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => collectCells(n, out)); return; }
  if (node.type === 'PDEImage' && node.bounds) out.push(node);
  else if (node.ateXMLTextObject && node.bounds) out.push({ ...node, placeholderType: 'text' });
  if (node.children) collectCells(node.children, out);
  if (node.__array) collectCells(node.__array, out);
}

// Returns { paper, pages: [{ width, height, blank, cover, cells: [...] }] }
export async function readLightroomBook(file, collectionId) {
  const db = await openCatalog(file);
  const row = db.prepare("select content from AgLibraryCollectionContent where collection = ? and owningModule = 'com.adobe.ag.layout.book'").get(Number(collectionId));
  if (!row) throw new Error('book not found');
  const book = parseLua(row.content);
  const pages = (book.pages || []).map((p) => {
    const tree = p.pageTree || {};
    const width = Number(tree.pageWidth) || 0, height = Number(tree.pageHeight) || 0;
    const cells = [];
    collectCells(Array.isArray(tree) ? tree : tree.__array || [], cells);
    return {
      width, height, blank: !!p.isBlankPage, cover: !!p.coverType || String(p.pageKey || '').startsWith('c-'),
      cells: cells.map((c) => ({
        l: c.bounds.l, t: c.bounds.t, r: c.bounds.r, b: c.bounds.b,
        kind: c.placeholderType === 'text' || c.ateXMLTextObject || c.fillText != null ? 'text' : 'image',
        photoId: c.photoId ?? null, panH: c.panningDistanceH, panV: c.panningDistanceV,
        fill: c.isZoomToFill !== false, text: c.ateXMLTextObject ? plainTextFromAte(c.ateXMLTextObject) : (c.fillText || ''),
      })),
    };
  });
  const ids = [...new Set(pages.flatMap((p) => p.cells.map((c) => c.photoId)).filter((x) => x != null))];
  const map = new Map();
  if (ids.length) {
    for (let k = 0; k < ids.length; k += 500) {
      const part = ids.slice(k, k + 500);
      for (const r of db.prepare(`select id_local, id_global from Adobe_images where id_local in (${part.map(() => '?').join(',')})`).all(...part)) map.set(r.id_local, `lr:${r.id_global}`);
    }
  }
  return { paper: book.paperId, pages, keyOf: (id) => map.get(id) };
}

// Convert a parsed Lightroom book into pages with custom frames ("frei" layout).
export function bookToPages(book, newPage) {
  const content = book.pages.filter((p) => !p.cover);
  const widths = content.filter((p) => !p.blank && p.width).map((p) => p.width).sort((a, b) => a - b);
  const single = widths[Math.floor(widths.length / 2)] || 1;
  const pages = [];
  for (const p of content) {
    if (p.blank || !p.width) { pages.push(newPage('leer')); continue; }
    const spread = p.width > single * 1.5;
    const pg = newPage('frei');
    pg.frames = []; pg.slots = []; pg.texts = [];
    for (const c of p.cells) {
      pg.frames.push({ kind: c.kind, role: c.kind === 'text' ? 'body' : undefined, x: c.l / p.width, y: c.t / p.height, w: (c.r - c.l) / p.width, h: (c.b - c.t) / p.height });
      if (c.kind === 'image') {
        const key = c.photoId != null ? book.keyOf(c.photoId) : null;
        pg.slots.push(key ? { key, ox: num01(c.panH), oy: num01(c.panV), ...(c.fill ? {} : { fit: 'contain' }) } : null);
      } else pg.texts.push({ value: c.text || '' });
    }
    if (spread) {
      pg.spread = true;
      if (pages.length % 2 === 0) pages.push(newPage('leer')); // spreads must start on a left page
      pages.push(pg, { ...newPage('leer'), spanned: true });
    } else pages.push(pg);
  }
  return pages;
}
const num01 = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v * 2 - 1)) : 0);

// ---------- Plain folders ----------
const IMG_EXT = /\.(jpe?g|png|tiff?|webp|avif)$/i;

export async function scanFolder(dir, depth = 3) {
  const out = [];
  async function walk(d, lvl) {
    let ents = [];
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory() && lvl < depth) await walk(p, lvl + 1);
      else if (e.isFile() && IMG_EXT.test(e.name)) out.push(p);
    }
  }
  await walk(dir, 0);
  return out.sort();
}

// Map Lightroom images to exported print files (JPEG/TIFF named after the original).
export function matchExports(lrItems, files) {
  const index = new Map();
  for (const f of files) {
    const b = path.basename(f).replace(/\.[^.]+$/, '').toLowerCase();
    if (!index.has(b)) index.set(b, []);
    index.get(b).push(f);
  }
  const names = [...index.keys()].sort();
  for (const it of lrItems) {
    const base = it.baseName.toLowerCase();
    let hit = index.get(base)?.[0];
    if (!hit) {
      // Exports with suffixes like "_150dpi", "-Bearbeitet", "-2"
      let lo = 0, hi = names.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (names[mid] < base) lo = mid + 1; else hi = mid; }
      const cands = [];
      for (let k = lo; k < names.length && names[k].startsWith(base); k++) if (/^[\s_\-.(]/.test(names[k].slice(base.length))) cands.push(names[k]);
      cands.sort((a, b) => a.length - b.length);
      if (cands.length) hit = index.get(cands[0])[0];
    }
    if (hit) it.file = hit;
  }
  return lrItems;
}

export const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
export { CACHE };
