// Print profiles: spine rules, cover sizes, spread export and cover templates.
// Expected values are computed by hand from the printers' published formulas (see providers.js sources).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-print-'));
process.env.BILLERBOOK_DATA = tmp;
const ops = await import('../public/lib/ops.js');
const { coverSpec, spineOf } = await import('../public/lib/geometry.js');
const { PROVIDERS, editionSpecFrom, spineFor, validateProfile, profileFromEdition } = await import('../public/lib/providers.js');
const { exportInterior, exportCover } = await import('../lib/pdf.mjs');
const { readCoverTemplate, saveProfile, providers } = await import('../lib/profiles.mjs');

const IN = 25.4;
const close = (a, b, eps = 0.02, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≠ ${b}`);
let n = 0;
const ok = (msg) => { n++; console.log('ok', n, msg); };

// every built-in profile is valid and every format yields an edition spec
for (const p of PROVIDERS) {
  assert.deepEqual(validateProfile(p), [], p.id);
  assert.ok(p.id === 'custom' || p.sources.length, `${p.id} has sources`);
  for (const f of p.formats) assert.ok(editionSpecFrom(p.id, f.id).spineRule, f.id);
}
ok(`${PROVIDERS.length} profiles valid, every non-custom profile cites sources`);

function edition(provider, format, pages, extra = {}) {
  const pr = ops.newProject('t');
  const ed = ops.addEdition(pr, { provider, format, ...extra });
  ops.insertPages(pr, ed.id, 0, pages, 'leer');
  return { pr, ed };
}

// KDP paperback: spine = pages × 0.002252 in (white), cover = bleed + back + spine + front + bleed
{
  const { ed } = edition('kdp', 'kdp-sc-85x11', 200);
  const sp = spineOf(ed);
  assert.equal(sp.source, 'formula');
  close(sp.mm, 200 * 0.002252 * IN, 0.01, 'kdp spine');
  const cs = coverSpec(ed);
  close(cs.W, 0.125 * IN * 2 + 8.5 * IN * 2 + 200 * 0.002252 * IN, 0.05, 'kdp cover W');
  close(cs.H, 11 * IN + 0.25 * IN, 0.05, 'kdp cover H');
  ops.updateEdition({ editions: [ed] }, ed.id, { paper: 'cream' });
  close(spineOf(ed).mm, 200 * 0.0025 * IN, 0.01, 'kdp cream');
  ok('KDP paperback spine and cover follow the published formula, paper change updates the spine');
}

// Lulu paperback formula and hardcover table
{
  const { ed } = edition('lulu', 'lulu-sc-a4-p', 100);
  close(spineOf(ed).mm, (100 / 444 + 0.06) * IN, 0.02, 'lulu pb');
  const { ed: hc } = edition('lulu', 'lulu-a4-l', 100);
  close(spineOf(hc).mm, 0.5 * IN, 0.02, 'lulu hc 85-140');
  const { ed: hc2 } = edition('lulu', 'lulu-a4-l', 300);
  close(spineOf(hc2).mm, 0.938 * IN, 0.02, 'lulu hc 279-306');
  ok('Lulu paperback formula and hardcover table');
}

// Mixam hardcover: back + 5 + spine + 5 + front, 20 mm bleed all round
{
  const { pr, ed } = edition('mixam', 'mixam-hc-210', 60);
  ops.updateEdition(pr, ed.id, { spine: 12 });
  const cs = coverSpec(ed);
  assert.equal(cs.W, 210 + 5 + 12 + 5 + 210 + 40);
  assert.equal(cs.H, 210 + 40);
  assert.equal(cs.front.x, 20 + 210 + 5 + 12 + 5);
  ok('Mixam hardcover cover with 5 mm joints and 20 mm bleed');
}

// IngramSpark case laminate: 0.625 in wrap, 0.5 in hinge each side of the spine
{
  const { pr, ed } = edition('ingramspark', 'is-85x11', 120);
  ops.updateEdition(pr, ed.id, { spine: 10 });
  const cs = coverSpec(ed);
  close(cs.W, 2 * 0.625 * IN + 2 * 8.5 * IN + 2 * 0.5 * IN + 10, 0.05, 'ingram W');
  ok('IngramSpark case laminate width includes wrap and hinge');
}

// WIRmachenDRUCK stays as verified against the 2025 print files
{
  const { pr, ed } = edition('wmd', 'hc-a4-quer', 120);
  ops.updateEdition(pr, ed.id, { spine: 15 });
  const cs = coverSpec(ed);
  assert.equal(cs.W, 649); assert.equal(cs.H, 245);
  ok('WIRmachenDRUCK hardcover A4 landscape 649 × 245 mm at 15 mm spine');
}

// Estimates are marked as such and produce a preflight warning
{
  const { pr, ed } = edition('blurb', 'blurb-10x8', 40);
  const sp = spineOf(ed);
  assert.equal(sp.exact, false);
  const pf = ops.preflight(pr, ed.id, new Map());
  assert.ok(pf.some((x) => x.code === 'no-spine' && x.params.url.includes('blurb')));
  ok('printer-calculator spines are estimates with a link to the printer’s calculator');
}

// Page count limits
{
  const { pr, ed } = edition('blurb', 'blurb-10x8', 18);
  assert.ok(ops.preflight(pr, ed.id, new Map()).some((x) => x.code === 'page-min'));
  ops.updateEdition(pr, ed.id, { paper: 'layflat' });
  ops.insertPages(pr, ed.id, null, 100, 'leer');
  assert.ok(ops.preflight(pr, ed.id, new Map()).some((x) => x.code === 'page-max'));
  ok('page-min and paper-specific page-max are checked');
}

// Cover template: the printer's template PDF sets the cover size and the spine follows from it
{
  const { pr, ed } = edition('kdp', 'kdp-hc-85x11', 150);
  const doc = await PDFDocument.create();
  const Wmm = 2 * 15 + 2 * 8.5 * IN + 21.3, Hmm = 11 * IN + 30;
  doc.addPage([Wmm / 25.4 * 72, Hmm / 25.4 * 72]);
  const bytes = await doc.save();
  const t = await readCoverTemplate(Buffer.from(bytes));
  close(t.W, Wmm, 0.02, 'template W');
  ed.coverTemplate = { W: t.W, H: t.H, source: 'pdf' };
  ops.normalize(ed);
  const sp = spineOf(ed);
  assert.equal(sp.source, 'template');
  close(sp.mm, 21.3, 0.05, 'spine from template');
  const cs = coverSpec(ed);
  close(cs.W, Wmm, 0.02); close(cs.H, Hmm, 0.02);
  assert.ok(!ops.preflight(pr, ed.id, new Map()).some((x) => x.code === 'no-spine'));
  ok('cover template PDF sets cover size, spine width and clears the spine warning');
}

// Spread export (Saal Digital): one PDF page per double page, first left and last right half empty
{
  const img = path.join(tmp, 'a.jpg');
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#3366aa' } }).jpeg().toFile(img);
  const pool = new Map([['f:a', { key: 'f:a', file: img, w: 1200, h: 800 }]]);
  const { pr, ed } = edition('saal', 'saal-30x30', 6);
  for (let i = 0; i < 6; i++) { ops.setLayout(pr, ed.id, i, 'voll'); ops.placeImage(pr, ed.id, i, 0, 'f:a'); }
  assert.equal(ed.interior, 'spreads');
  const r = await exportInterior({ ed, pool, file: path.join(tmp, 'saal.pdf'), preview: true });
  assert.equal(r.pdfPages, 4);
  const info = execFileSync('pdfinfo', ['-box', '-f', '1', '-l', '1', path.join(tmp, 'saal.pdf')]).toString();
  const size = /Page\s+1 size:\s+([\d.]+) x ([\d.]+)/.exec(info) || /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
  close(Number(size[1]) / 72 * 25.4, 2 * 300 + 2 * ed.bleed, 0.1, 'spread width');
  // left half of the first spread must be empty (white), right half blue
  execFileSync('pdftoppm', ['-r', '20', '-f', '1', '-l', '1', '-png', path.join(tmp, 'saal.pdf'), path.join(tmp, 's')]);
  const png = fs.readdirSync(tmp).find((f) => f.startsWith('s') && f.endsWith('.png'));
  const { data, info: im } = await sharp(path.join(tmp, png)).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => data.slice((y * im.width + x) * im.channels, (y * im.width + x) * im.channels + 3);
  const L = px(Math.round(im.width * 0.25), Math.round(im.height / 2)), R = px(Math.round(im.width * 0.75), Math.round(im.height / 2));
  assert.ok(L[0] > 240 && L[2] > 240, `left half white ${L}`);
  assert.ok(R[2] > R[0] + 40, `right half blue ${R}`);
  ok('spread export: 6 pages → 4 double pages, first left half empty');
}

// Single-page export keeps one PDF page per book page
{
  const { ed } = edition('kdp', 'kdp-sc-85x85', 4);
  const r = await exportInterior({ ed, pool: new Map(), file: path.join(tmp, 'kdp.pdf'), preview: true });
  assert.equal(r.pdfPages, 4); assert.equal(r.layout, 'single');
  const c = await exportCover({ ed, pool: new Map(), file: path.join(tmp, 'kdp-cover.pdf'), preview: true });
  close(c.spine, 4 * 0.002252 * IN, 0.02);
  ok('single-page export and cover export report the spine used');
}

// User profiles round-trip
{
  const { ed } = edition('custom', 'custom', 20);
  ed.cover.joint = 4;
  const prof = profileFromEdition(ed, 'My Print Shop');
  saveProfile(prof);
  const list = providers();
  assert.ok(list.find((p) => p.id === prof.id && p.user));
  const spec = editionSpecFrom(prof.id, prof.formats[0].id);
  assert.equal(spec.cover.joint, 4);
  assert.throws(() => saveProfile({ id: 'x' }), /invalid profile/);
  ok('profiles export from an edition, import, validate and drive new editions');
}

// Lightroom book module parity: duplicate pages, copy layout, saved layouts, page background photo
{
  const { pr, ed } = edition('wmd', 'hc-a4-quer', 4);
  ops.setLayout(pr, ed.id, 1, 'zwei-a');
  ops.placeImage(pr, ed.id, 1, 0, 'f:a');
  ops.duplicatePages(pr, ed.id, 1, 1);
  assert.equal(ed.pages.length, 5);
  assert.equal(ed.pages[2].layout, 'zwei-a');
  assert.equal(ed.pages[2].slots[0].key, 'f:a');
  ops.copyLayout(pr, ed.id, 1, [3, 4]);
  assert.equal(ed.pages[3].layout, 'zwei-a');
  const L = ops.saveCustomLayout(pr, ed.id, 1, 'Two up');
  assert.equal(L.photos, 2);
  ops.applyCustomLayout(pr, ed.id, 0, L.id);
  assert.equal(ed.pages[0].layout, 'frei'); assert.equal(ed.pages[0].frames.length, L.frames.length);
  ops.setPageProps(pr, ed.id, 0, { bgPhoto: { key: 'f:a', opacity: 0.3 }, gap: 10, hideNumber: true });
  assert.equal(ed.pages[0].gap, 10);
  ok('duplicate pages, copy layout to pages, save and apply custom layouts, page background photo');
}

console.log(`\n${n} print checks passed`);
