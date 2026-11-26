// Lightroom print-file export (plug-in "Export print files"): folder per project, usage.txt P lines,
// the "exported" notification, pool refresh by folder mtime, placeholder for photos without any source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-lrx-'));
process.env.BILLERBOOK_DATA = path.join(tmp, 'data');
const store = await import('../lib/store.mjs');

// Default folder: ~/Pictures/Billerbook/<name> (<id>), name cleaned of path characters
const f1 = store.defaultExportFolder({ id: 'ab12', name: 'Jahresbuch 2026' });
assert.equal(f1, path.join(os.homedir(), 'Pictures', 'Billerbook', 'Jahresbuch 2026 (ab12)'));
const f2 = store.defaultExportFolder({ id: '../x', name: '../../etc/passwd\u0000' });
assert.equal(path.dirname(f2), path.join(os.homedir(), 'Pictures', 'Billerbook'), 'name and id cannot leave the Billerbook folder');
assert.ok(!f2.includes('/etc/'));
assert.equal(store.lrExportFolder({ id: 'a', name: 'n', sources: { lightroom: { exportFolder: '/x/y' } } }), '/x/y', 'a folder set by the user wins');

// Placeholder: a photo without file, preview or original is shown as a grey frame, not blank
const pr = { id: 'lrx', name: 'T', sources: { lightroom: { catalog: path.join(tmp, 'none.lrcat') } }, editions: [] };
const ph = await store.thumbnail(pr, { key: 'lr:X', lrId: 1, baseName: 'IMG_<b>&"0001', w: 3000, h: 2000 }, 600);
assert.ok(ph && fs.existsSync(ph), 'placeholder file');
const md = await sharp(ph).metadata();
assert.equal(md.width, 600); assert.equal(md.height, 400);

// Server: P line before the edition lines, exported endpoint refreshes, cross-origin refused
const { start } = await import('../server.mjs');
const srv = await start({ port: 0 });
const base = `http://127.0.0.1:${srv.address().port}`;
fs.mkdirSync(path.join(process.env.BILLERBOOK_DATA, 'projects'), { recursive: true });
const proj = { id: 'lrx1', name: 'Buch\tmit Tab', version: 1, sources: { folders: [], lightroom: { catalog: path.join(tmp, 'none.lrcat'), collections: [], exportFolder: path.join(tmp, 'exp') } },
  editions: [{ id: 'e1', name: 'Hardcover', pages: [] }] };
fs.writeFileSync(path.join(process.env.BILLERBOOK_DATA, 'projects', 'lrx1.json'), JSON.stringify(proj));
const txt = await (await fetch(`${base}/api/lightroom/usage.txt`)).text();
const lines = txt.split('\n');
const pi = lines.findIndex((l) => l.startsWith('P\tlrx1\t'));
assert.ok(pi > 0, 'P line present');
assert.equal(lines[pi], `P\tlrx1\tBuch mit Tab\t${path.join(tmp, 'exp')}`, 'tabs in names are cleaned');
assert.ok(lines[pi + 1].startsWith('E\tBuch mit Tab\tHardcover\te1') && lines[pi + 1].split('\t').length === 4, 'E lines keep four fields for older plug-ins');
const post = (b, h = {}) => fetch(`${base}/api/lightroom/exported`, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
assert.equal((await post({ project: 'lrx1' })).status, 200);
const nf = await post({ project: 'gibtsnicht' });
assert.equal(nf.status, 404);
assert.ok(!(await nf.text()).includes(tmp), 'no file paths in the error');
assert.equal((await post({ project: 'lrx1' }, { origin: 'https://evil.example' })).status, 403);
assert.equal((await fetch(`${base}/api/lightroom/exported`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"project":"lrx1"}' })).status >= 400, true, 'only JSON');
srv.close();
console.log('ok Lightroom print-file export: default folder, P lines, exported notification, placeholder');
process.exit(0);
