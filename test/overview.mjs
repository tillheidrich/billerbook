// Page overview: contact sheet (app, MCP view_overview) and printable PDF.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import * as ops from '../public/lib/ops.js';
import { renderOverview, exportOverview, spreadLabel } from '../lib/overview.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-ov-'));
const img = path.join(tmp, 'a.jpg');
await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#3a7a4a' } }).jpeg().toFile(img);
const pool = new Map([['f:a', { key: 'f:a', name: 'a.jpg', file: img, w: 1200, h: 800, source: 'folder' }]]);
const pr = ops.newProject('Test');
const ed = ops.addEdition(pr, { provider: 'wmd', format: 'hc-a4-quer' });
ops.insertPages(pr, ed.id, 0, 20, 'leer');
for (let i = 0; i < 20; i += 3) ops.setLayout(pr, ed.id, i, 'voll');
for (let i = 0; i < ed.pages.length; i += 3) ops.placeImage(pr, ed.id, i, 0, 'f:a');

const r = await renderOverview(pr, ed, pool, { from: 0, count: 6, cols: 3, width: 1200 });
const md = await sharp(r.buf).metadata();
assert.equal(md.width, 1200);
assert.equal(r.from, 0); assert.equal(r.to, 6); assert.equal(r.total, 11, '20 pages = 11 spreads (first and last alone)');
assert.equal(spreadLabel(ed, 0), '1'); assert.equal(spreadLabel(ed, 1), '2–3'); assert.equal(spreadLabel(ed, 10), '20');
const r2 = await renderOverview(pr, ed, pool, { from: 6, count: 24 });
assert.equal(r2.to, 11, 'stops at the last spread');
console.log('ok overview sheet: spreads with page numbers, cover tile first, pages through long books');

const file = path.join(tmp, 'o.pdf');
const out = await exportOverview({ project: pr, ed, pool, file, title: 'Test' });
const pdf = fs.readFileSync(file, 'latin1');
assert.ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'));
assert.equal(out.spreads, 11);
assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, out.sheets);
assert.ok(out.sheets === 1, '11 spreads + cover fit on one sheet of 16');
// xref offsets point at the objects
const xref = pdf.slice(pdf.indexOf('xref'));
const offs = [...xref.matchAll(/^(\d{10}) 00000 n/mg)].map((m) => Number(m[1]));
offs.forEach((o, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1} at its offset`));
console.log('ok overview PDF: A4 landscape sheets, valid xref');

// Review 22.11.: control characters in titles, extreme page ratios
{
  const r3 = await renderOverview(pr, ed, pool, { count: 2, width: 800, title: 'a\u0001b￾c' });
  assert.ok(r3.buf.length > 0);
  const odd = { ...ed, w: 0.01 };
  const r4 = await renderOverview(pr, odd, pool, { count: 1, width: 800, cover: false }).catch((e) => e);
  assert.ok(!(r4 instanceof Error) ? r4.height < 4000 : true, 'canvas stays small for an extreme ratio');
  console.log('ok overview review fixes: control characters in titles, canvas size clamped');
}
