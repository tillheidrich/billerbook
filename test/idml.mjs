// IDML export for Affinity and InDesign: package layout, well-formed XML, frames, crops and links.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import * as ops from '../public/lib/ops.js';
import { exportIdml } from '../lib/idml.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-idml-'));
const imgA = path.join(tmp, 'a b#1.jpg'), imgB = path.join(tmp, 'b.jpg');
await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#3a7a4a' } }).jpeg().toFile(imgA);
await sharp({ create: { width: 1000, height: 1500, channels: 3, background: '#7a3a4a' } }).jpeg().toFile(imgB);
const pool = new Map([
  ['f:a', { key: 'f:a', name: 'a b#1.jpg', file: imgA, w: 1800, h: 1200, source: 'folder' }],
  ['f:b', { key: 'f:b', name: 'b.jpg', file: imgB, w: 1000, h: 1500, source: 'folder' }],
]);
const pr = ops.newProject('Test');
const ed = ops.addEdition(pr, { provider: 'wmd', format: 'hc-a4-quer' });
ops.insertPages(pr, ed.id, 0, 8, 'leer');
ops.setLayout(pr, ed.id, 0, 'voll'); ops.placeImage(pr, ed.id, 0, 0, 'f:a');
ops.setLayout(pr, ed.id, 1, 'dps-voll'); ops.placeImage(pr, ed.id, 1, 0, 'f:a');
ops.setLayout(pr, ed.id, 3, 'tafel-legende'); ops.placeImage(pr, ed.id, 3, 0, 'f:b', { tone: 'bw' });
ops.setTextProps(pr, ed.id, { page: 3 }, 0, { value: 'Palmen & <Farne>\nzweite Zeile', italic: true });
ed.pages[4].bg = '#1d2a22';

const r = await exportIdml({ project: pr, ed, pool, dir: tmp, base: 'buch' });
assert.ok(fs.existsSync(r.file));
const list = execFileSync('unzip', ['-Z1', r.file]).toString().trim().split('\n');
assert.equal(list[0], 'mimetype', 'mimetype comes first');
assert.match(execFileSync('unzip', ['-v', r.file]).toString().split('\n').find((l) => l.endsWith(' mimetype')), /Stored/, 'mimetype is stored, not compressed');
for (const f of ['META-INF/container.xml', 'designmap.xml', 'Resources/Graphic.xml', 'Resources/Styles.xml', 'Resources/Preferences.xml', 'Resources/Fonts.xml']) assert.ok(list.includes(f), f);
const read = (f) => execFileSync('unzip', ['-p', r.file, f]).toString();
// Every XML part is well-formed and every referenced part exists
const design = read('designmap.xml');
const refs = [...design.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) assert.ok(list.includes(ref), `designmap references ${ref}`);
const xml = list.filter((f) => f.endsWith('.xml'));
execFileSync('python3', ['-c', 'import sys,zipfile,xml.dom.minidom as m\nz=zipfile.ZipFile(sys.argv[1])\n[m.parseString(z.read(n)) for n in sys.argv[2:]]', r.file, ...xml]);
// 8 pages: 1 alone, 2–3 (one spread image across both), 4–5, 6–7, 8 alone = 5 spreads
const spreads = list.filter((f) => f.startsWith('Spreads/'));
assert.equal(spreads.length, 5);
const all = spreads.map(read).join('');
assert.equal((all.match(/<Page /g) || []).length, 8);
assert.match(read('Resources/Preferences.xml'), /PagesPerDocument="8" FacingPages="true"/);
assert.match(read('Resources/Preferences.xml'), /DocumentBleedTopOffset="8\.504"/, '3 mm bleed in points');
// Crops: each placed image covers its frame completely
const rects = [...all.matchAll(/<Rectangle [^>]*ContentType="GraphicType"[^>]*>(.*?)<\/Rectangle>/gs)];
assert.equal(rects.length, 3, 'full-bleed page, the double-page photo once, the plate');
for (const [, inner] of rects) {
  const pts = [...inner.matchAll(/Anchor="([-\d.]+) ([-\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  const L = Math.min(...pts.map((p) => p[0])), R = Math.max(...pts.map((p) => p[0])), T = Math.min(...pts.map((p) => p[1])), B = Math.max(...pts.map((p) => p[1]));
  const [s, , , , tx, ty] = /<Image [^>]*ItemTransform="([^"]+)"/.exec(inner)[1].split(' ').map(Number);
  const gb = /GraphicBounds Left="0" Top="0" Right="(\d+)" Bottom="(\d+)"/.exec(inner).slice(1).map(Number);
  assert.ok(tx <= L + 0.01 && ty <= T + 0.01 && tx + gb[0] * s >= R - 0.01 && ty + gb[1] * s >= B - 0.01, 'image covers frame');
}
// The double-page photo spans both pages including bleed: from -W-bleed to +W+bleed
const W = 297 * 72 / 25.4, b = 3 * 72 / 25.4;
const dps = read(spreads[1]);
assert.ok(dps.includes(`Anchor="${(Math.round((-W - b) * 1000) / 1000)} `), 'spread photo starts in the left bleed');
// Links: one JPEG per photo and tone, path with # encoded
const links = fs.readdirSync(path.join(r.dir, 'Links'));
assert.equal(links.length, 2, 'a and b (black-and-white)');
assert.ok(links.some((f) => f.includes('_bw')));
assert.ok(links.includes('a_b_1.jpg'), 'link names are safe file names');
assert.ok([...all.matchAll(/LinkResourceURI="file:([^"]+)"/g)].every((m) => fs.existsSync(decodeURI(m[1]))), 'every link points at an existing file');
const bw = await sharp(path.join(r.dir, 'Links', links.find((f) => f.includes('_bw')))).stats();
assert.ok(Math.abs(bw.channels[0].mean - bw.channels[1].mean) < 2, 'tone applied in the linked file');
// Text with escaping, line break, italic; dark page background as a colour swatch
const story = list.filter((f) => f.startsWith('Stories/')).map(read).join('');
assert.ok(story.includes('Palmen &amp; &lt;Farne&gt;') && story.includes('<Br/>') && /FontStyle="[^"]*Italic"/.test(story));
assert.match(read('Resources/Graphic.xml'), /Color\/bb-1d2a22" Model="Process" Space="RGB" ColorValue="29 42 34"/);
assert.ok(fs.existsSync(path.join(r.dir, 'LIESMICH.txt')));
assert.ok(r.cover && fs.existsSync(r.cover), 'cover as its own IDML');
console.log('ok IDML for Affinity/InDesign: package, pages and spreads, bleed, crops, links, tones, text, colours, cover file');
