// .billerbook project files: one zip with the project, optionally every photo and font it uses,
// so a book can be saved, sent and opened on another Mac.
//
//   manifest.json   { format: "billerbook", version: 1, app, created, media }
//   project.json    the project; with media, photo keys point to "media:<name>"
//   media/…         originals (only with media)
//   fonts/…         own fonts (only with media)

import { checkProject } from '../public/lib/safe.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import yazl from 'yazl';
import yauzl from 'yauzl';
import { rid } from '../public/lib/ops.js';
import { DATA, saveProject } from './store.mjs';

const FORMAT_VERSION = 1;
const MAX_ENTRY = 2 * 1024 ** 3;   // 2 GB per file
const MAX_TOTAL = 10 * 1024 ** 3;  // 10 GB per package
const MAX_JSON = 20 << 20;         // project.json / manifest.json

// Every place a photo key can sit in a project.
function* keyRefs(project) {
  for (const ed of project.editions || []) {
    for (const pg of ed.pages || []) {
      for (const s of pg.slots || []) if (s?.key) yield s;
      if (pg.bgPhoto?.key) yield pg.bgPhoto;
    }
    for (const s of ed.coverDesign?.slots || []) if (s?.key) yield s;
  }
}

export async function exportPackage({ project, pool, file, media = true, version = '' }) {
  const p = structuredClone(project);
  const zip = new yazl.ZipFile();
  const names = new Map();
  let missing = 0;
  if (media) {
    for (const ref of keyRefs(p)) {
      if (!names.has(ref.key)) {
        const it = pool.get(ref.key);
        if (!it?.file || !fs.existsSync(it.file)) { missing++; names.set(ref.key, null); continue; }
        const name = `${crypto.createHash('sha1').update(ref.key).digest('hex').slice(0, 10)}-${path.basename(it.file)}`;
        zip.addFile(it.file, `media/${name}`, { compress: false });
        names.set(ref.key, name);
      }
      const n = names.get(ref.key);
      if (n) ref.key = `media:${n}`;
    }
    // Fonts installed on the computer stay there (licence); the recipient sees the nearest bundled font.
    p.fonts = (p.fonts || []).filter((f) => !f.system);
    for (const f of p.fonts || []) {
      for (const [k, src] of Object.entries(f.files || {})) {
        if (!fs.existsSync(src)) continue;
        const name = `${f.id}/${k}${path.extname(src)}`;
        zip.addFile(src, `fonts/${name}`);
        f.files[k] = `font:${name}`;
      }
    }
    p.sources = { folders: [], files: [] };
  }
  zip.addBuffer(Buffer.from(JSON.stringify({ format: 'billerbook', version: FORMAT_VERSION, app: version, created: new Date().toISOString(), media, missing }, null, 2)), 'manifest.json');
  zip.addBuffer(Buffer.from(JSON.stringify(p, null, 2)), 'project.json');
  zip.end();
  await new Promise((resolve, reject) => zip.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve).on('error', reject));
  return { file, photos: [...names.values()].filter(Boolean).length, missing };
}

// Reads a package into a new project. Entry names are checked so nothing is written outside the
// import folder (no "../", no absolute paths), and sizes are limited.
export async function importPackage(file) {
  const id = rid();
  const root = path.join(DATA, 'imports', id);
  await fsp.mkdir(root, { recursive: true });
  let manifest = null, project = null, total = 0;
  const zip = await yauzl.openPromise(file, { strictFileNames: true, validateEntrySizes: true, autoClose: false });
  try {
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      if (name.endsWith('/')) continue;
      if (name.includes('\\') || name.split('/').some((x) => x === '..' || x === '') || path.isAbsolute(name)) throw new Error(`unsafe entry: ${name}`);
      if (!/^(manifest\.json|project\.json|media\/[^/]+|fonts\/[\w.-]+\/[\w.-]+)$/.test(name)) continue;
      if (entry.uncompressedSize > MAX_ENTRY || (total += entry.uncompressedSize) > MAX_TOTAL) throw new Error('package too large');
      if (name.endsWith('.json') && entry.uncompressedSize > MAX_JSON) throw new Error(`${name} too large`);
      const stream = await zip.openReadStreamPromise(entry);
      if (name === 'manifest.json' || name === 'project.json') {
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (name === 'manifest.json') manifest = json; else project = json;
        continue;
      }
      const dest = path.join(root, name);
      if (!dest.startsWith(root + path.sep)) throw new Error(`unsafe entry: ${name}`);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await new Promise((resolve, reject) => stream.pipe(fs.createWriteStream(dest)).on('finish', resolve).on('error', reject));
    }
  } finally { zip.close(); }
  if (manifest?.format !== 'billerbook' || !project?.editions) throw new Error('not a Billerbook project file');
  if (manifest.version > FORMAT_VERSION) throw new Error('made with a newer Billerbook; please update');
  // Media keys back to file keys in the import folder.
  const files = new Set();
  for (const ref of keyRefs(project)) {
    if (ref.key.startsWith('media:')) {
      const f = path.join(root, 'media', path.basename(ref.key.slice(6)));
      ref.key = `f:${f}`;
      files.add(f);
    }
  }
  // Fonts only from inside the package; any other path (e.g. /etc/…) is dropped.
  for (const f of project.fonts || []) for (const [k, v] of Object.entries(f.files || {})) {
    if (String(v).startsWith('font:')) f.files[k] = path.join(root, 'fonts', ...String(v).slice(5).split('/').map((x) => path.basename(x)));
    else delete f.files[k];
  }
  // A package is untrusted: drop colour or font values that are not plain values.
  checkProject(project, { fix: true });
  project.id = id;
  project.version = 0;
  // A package brings its own photos; paths of the sender's Mac (folders, catalogs, Capture One) are dropped.
  project.sources = { folders: [], files: [...files] };
  project.name = `${project.name || 'Photo book'}`;
  await saveProject(project);
  return { id, name: project.name, photos: files.size };
}
