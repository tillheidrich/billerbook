// Capture One: collections and variants through a stand-in for osascript (the real app is Mac-only).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-c1-'));
const raw = path.join(tmp, 'IMG_0001.CR3'), jpg = path.join(tmp, 'IMG_0002.jpg'), exp = path.join(tmp, 'export');
fs.writeFileSync(raw, 'raw');
fs.mkdirSync(exp);
await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#335533' } }).jpeg().toFile(jpg);
await sharp({ create: { width: 900, height: 1350, channels: 3, background: '#553333' } }).jpeg().toFile(path.join(exp, 'IMG_0001.jpg'));
// Stand-in: answers like the JXA script, records its arguments
const fake = path.join(tmp, 'osascript');
const log = path.join(tmp, 'args.json');
fs.writeFileSync(fake, `#!/usr/bin/env node
const a = process.argv.slice(2); require('fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify(a));
if (process.env.C1_STATE === 'off') { console.log(JSON.stringify({ error: 'not-running' })); process.exit(0); }
const mode = a[a.indexOf('-e') + 2];
if (mode === 'collections') console.log(JSON.stringify({ document: 'Fotos 2026', collections: [{ id: '17', name: 'Botanik', kind: 'album', path: ['Reisen', 'Botanik'], count: 3 }, { id: '', name: 'x', kind: 'group' }] }));
else console.log(JSON.stringify({ document: 'Fotos 2026', items: [
  { id: 'v1', name: 'IMG_0001', file: ${JSON.stringify(raw)}, rating: 4, collection: '17' },
  { id: 'v2', name: 'IMG_0002', file: ${JSON.stringify(jpg)}, rating: 0, collection: '17' },
  { id: 'v3', name: 'IMG_0003', file: '/nicht/da/IMG_0003.NEF', rating: 0, collection: '17' },
  { id: 'v1', name: 'IMG_0001', file: ${JSON.stringify(raw)}, rating: 4, collection: '17' }] }));
`);
fs.chmodSync(fake, 0o755);
process.env.BILLERBOOK_OSASCRIPT = fake;
process.env.BILLERBOOK_DATA = path.join(tmp, 'data');
const c1 = await import('../lib/captureone.mjs');
const store = await import('../lib/store.mjs');

const list = await c1.listCaptureOneCollections();
assert.equal(list.document, 'Fotos 2026');
assert.deepEqual(list.collections.map((c) => c.id), ['17'], 'entries without id are dropped');
const v = await c1.captureOneVariants(['17', 'x"); doShellScript("rm']);
const args = JSON.parse(fs.readFileSync(log, 'utf8'));
assert.equal(args[0], '-l'); assert.equal(args[1], 'JavaScript');
assert.ok(args[3].startsWith('\nfunction run(argv)') && !args[3].includes('doShellScript'), 'collection ids go in as argv, never into the script');
assert.equal(v.items.length, 3, 'duplicate variants collapse');

const pr = { id: 'c1test', name: 'T', sources: { folders: [], captureone: { collections: ['17'], exportFolder: exp, snapshot: v.items } }, editions: [] };
const pool = await store.buildPool(pr, { refresh: true });
const byId = Object.fromEntries(pool.items.filter((i) => i.source === 'captureone').map((i) => [i.c1Id, i]));
assert.equal(byId.v1.file, path.join(exp, 'IMG_0001.jpg'), 'RAW variant uses the processed export');
assert.equal(byId.v1.w, 900);
assert.equal(byId.v2.file, jpg, 'JPEG original used directly');
assert.ok(!byId.v3, 'RAW without export and missing file is left out');
assert.equal(byId.v1.key, 'c1:v1');

process.env.C1_STATE = 'off';
await assert.rejects(c1.listCaptureOneCollections(), /not running/);
console.log('ok Capture One: albums and variants via AppleScript, ids as arguments only, exports matched by name, JPEG originals direct, RAW without export left out');
