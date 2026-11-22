// Capture One (Mac): read albums, projects and groups of the open catalog or session through
// Capture One's AppleScript dictionary (JavaScript for Automation), read-only.
//
// Capture One keeps its edits and previews in its own formats, so printing works like with
// Lightroom: process the album in Capture One with any JPEG/TIFF recipe into a folder and set that
// folder as export folder; Billerbook matches the processed files to the variants by file name.
// Originals that are already JPEG/TIFF/PNG/HEIC are used directly when no export matches.
//
// Capture One must be running with the catalog or session open. Without it, the last list read
// from Capture One (stored in the project) is used, so a project still opens.
import { execFile } from 'node:child_process';
import path from 'node:path';

const OSA = process.env.BILLERBOOK_OSASCRIPT || '/usr/bin/osascript';

// JXA. Arguments come in through argv (never spliced into the script source).
const SCRIPT = String.raw`
function run(argv) {
  var app = Application(argv[2]);
  var doc;
  try { doc = app.currentDocument(); } catch (e) { doc = null; }
  if (!doc) { try { doc = app.documents()[0]; } catch (e) { doc = null; } }
  if (!doc) return JSON.stringify({ error: 'no-document' });
  var want = argv[0] === 'variants' ? JSON.parse(argv[1] || '[]') : null;
  var out = [], items = [];
  function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (e) { return d; } }
  function walk(colls, trail) {
    for (var i = 0; i < colls.length; i++) {
      var c = colls[i];
      var kind = String(safe(function () { return c.kind(); }, ''));
      var name = String(safe(function () { return c.name(); }, ''));
      var id = String(safe(function () { return c.id(); }, ''));
      if (/catalog folder|^folder|in catalog|recent|trash|all images/i.test(kind)) continue;
      var here = trail.concat([name]);
      var n = (kind === 'album' || kind === 'smart album' || kind === 'project') ? safe(function () { return c.variants.length; }, null) : null;
      if (!want) out.push({ id: id, name: name, kind: kind, path: here, count: n });
      if (want && want.indexOf(id) >= 0) {
        var vs = safe(function () { return c.variants(); }, []);
        for (var k = 0; k < vs.length; k++) {
          var v = vs[k];
          items.push({
            id: String(safe(function () { return v.id(); }, '')),
            name: String(safe(function () { return v.name(); }, '')),
            file: String(safe(function () { return v.parentImage().path(); }, '')),
            rating: Number(safe(function () { return v.rating(); }, 0)) || 0,
            collection: id,
          });
        }
      }
      var sub = safe(function () { return c.collections(); }, []);
      if (sub.length) walk(sub, here);
    }
  }
  walk(safe(function () { return doc.collections(); }, []), []);
  var docName = String(safe(function () { return doc.name(); }, ''));
  return JSON.stringify(want ? { document: docName, items: items } : { document: docName, collections: out });
}`;

// Name of the running Capture One app ("Capture One", "Capture One 23", …) from the process list,
// without asking System Events (which would need an extra macOS permission).
function runningApp() {
  if (process.env.BILLERBOOK_OSASCRIPT) return Promise.resolve(process.env.C1_STATE === 'off' ? null : 'Capture One');
  return new Promise((resolve) => execFile('/bin/ps', ['-axo', 'comm='], { maxBuffer: 8 << 20 }, (err, out) => {
    const m = err ? null : String(out).split('\n').map((l) => /\/([^/]*Capture One[^/]*)\.app\/Contents\/MacOS\//.exec(l)).find(Boolean);
    resolve(m ? m[1] : null);
  }));
}

async function osa(args, timeout = 120000) {
  if (process.platform !== 'darwin' && !process.env.BILLERBOOK_OSASCRIPT) throw (Object.assign(new Error('Capture One is only supported on the Mac'), { status: 400 }));
  const app = await runningApp();
  if (!app) return { error: 'not-running' };
  args = [args[0], args[1] ?? '[]', app];
  return new Promise((resolve, reject) => {
    execFile(OSA, ['-l', 'JavaScript', '-e', SCRIPT, ...args], { timeout, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
      if (err) {
        const msg = /not allowed|-1743|not authorized/i.test(String(stderr)) ? 'macOS blocked access to Capture One: allow Billerbook (or Terminal) under System Settings › Privacy & Security › Automation' : `Capture One did not answer: ${String(stderr || err.message).trim().slice(0, 300)}`;
        return reject(Object.assign(new Error(msg), { status: 502 }));
      }
      try { resolve(JSON.parse(String(stdout).trim())); } catch { reject(Object.assign(new Error('Capture One returned no readable answer'), { status: 502 })); }
    });
  });
}

const fail = (r) => {
  if (r?.error === 'not-running') throw Object.assign(new Error('Capture One is not running. Open your catalog or session in Capture One and try again.'), { status: 409 });
  if (r?.error === 'no-document') throw Object.assign(new Error('Capture One has no catalog or session open.'), { status: 409 });
};

// Albums, projects, groups and smart albums of the open document (folders are skipped).
export async function listCaptureOneCollections() {
  const r = await osa(['collections']);
  fail(r);
  return { document: r.document, collections: (r.collections || []).filter((c) => c.id) };
}

// Variants of the given collections as plain records (stored in the project as a snapshot).
export async function captureOneVariants(ids) {
  const r = await osa(['variants', JSON.stringify(ids.map(String))]);
  fail(r);
  const seen = new Set();
  const items = [];
  for (const v of r.items || []) {
    if (!v.id || seen.has(v.id)) continue;
    seen.add(v.id);
    items.push({ id: String(v.id), name: String(v.name || path.basename(v.file || '')), file: v.file || '', rating: Number(v.rating) || 0, collection: String(v.collection || '') });
  }
  return { document: r.document, items };
}

// Snapshot records → pool items. Keys stay stable per variant (a variant is one edit of an image).
export function captureOneItems(snapshot = []) {
  return snapshot.map((v) => ({
    key: `c1:${v.id}`, c1Id: v.id, name: v.name || path.basename(v.file || ''), original: v.file || null,
    baseName: path.basename(v.name || v.file || '').replace(/\.[^.]+$/, ''), rating: v.rating || 0, caption: '', label: '', source: 'captureone',
  }));
}

export const PRINTABLE = /\.(jpe?g|tiff?|png|webp|heic|heif|avif)$/i;
