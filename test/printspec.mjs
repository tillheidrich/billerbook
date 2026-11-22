import assert from 'node:assert/strict';
// Print shop data sheet → read_print_spec → apply_print_spec, and saddle-stitched magazines.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
process.env.BILLERBOOK_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-'));
const { start } = await import('../server.mjs');
const srv = await start({ port: 0 }); const port = srv.address().port; const L = `http://127.0.0.1:${port}`;
const { createServer } = await import('../mcp.mjs');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const ok = (m) => console.log(`ok ${m}`);

// A data sheet like a German print shop's "Druckdatenskizze"
const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica);
const pg = doc.addPage([595, 842]);
['Datenblatt Broschuere mit Rueckendrahtheftung DIN A4 hoch', 'Datenformat: 216 x 303 mm', 'Endformat: 210 x 297 mm', 'Beschnitt: 3 mm', 'Sicherheitsabstand: 4 mm', 'Seitenzahl durch 4 teilbar, 8 bis 64 Seiten', 'Farbmodus CMYK, PSO Coated v3']
  .forEach((l, i) => pg.drawText(l, { x: 40, y: 800 - i * 22, size: 11, font: f }));
const sheet = path.join(process.env.BILLERBOOK_DATA, 'datenblatt.pdf');
fs.writeFileSync(sheet, await doc.save());

const [a, b] = InMemoryTransport.createLinkedPair();
const s = createServer(); await s.connect(a);
const c = new Client({ name: 't', version: '1' }); await c.connect(b);
const call = async (name, args) => { const r = await c.callTool({ name, arguments: args }); if (r.isError) throw new Error(r.content[0].text); return JSON.parse(r.content[0].text); };

const spec = await call('read_print_spec', { path: sheet });
assert.equal(spec.found.trim[0].w_mm, 210); assert.equal(spec.found.data[0].h_mm, 303);
assert.equal(spec.derived.bleed_mm_from_sizes, 3); assert.equal(spec.found.safety[0].mm, 4);
assert.ok(spec.found.pages.some((x) => x.step === 4)); assert.equal(spec.found.colour[0].value, 'cmyk');
ok('read_print_spec finds trim, data size, bleed, safety, page rule and colour in a data sheet');

const pr = await (await fetch(`${L}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Magazin', editions: [{ name: 'Heft', provider: 'standard', format: 'std-mag-a4' }] }) })).json();
const r = await call('apply_print_spec', { project: pr.id, shop: 'Druckerei Test', product: 'Broschüre A4 Rückendraht', binding: 'saddle', width_mm: 210, height_mm: 297, bleed_mm: 3, safety_mm: 4, page_min: 8, page_max: 64, page_step: 4, colour: 'cmyk', source: 'datenblatt.pdf' });
assert.equal(r.profile, 'user-druckerei-test');
const p2 = await (await fetch(`${L}/api/project/${pr.id}`)).json();
const ed = p2.editions[0];
assert.equal(ed.provider, 'user-druckerei-test'); assert.equal(ed.binding, 'saddle'); assert.equal(ed.bleed, 3); assert.equal(ed.safety, 4); assert.equal(ed.pageStep, 4); assert.equal(ed.cover.mode, 'none');
ok('apply_print_spec saves a profile for the shop and switches the edition to it (magazine, steps of 4, no cover file)');

// A magazine exports one interior PDF (cover = its first and last pages) and flags a page count off the step
const opx = (op, args) => fetch(`${L}/api/project/${pr.id}/op`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, args, returnProject: false }) }).then((x) => x.json());
await opx('insertPages', { edition: ed.id, at: 0, count: 10, layout: 'text' });
const pf = await (await fetch(`${L}/api/project/${pr.id}/preflight?edition=${ed.id}`)).json();
assert.ok(pf.warnings.some((w) => w.code === 'page-step'), 'page step 4');
const job = await (await fetch(`${L}/api/project/${pr.id}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edition: ed.id, parts: ['interior', 'cover'], outDir: path.join(process.env.BILLERBOOK_DATA, 'out') }) })).json();
let j; do { await new Promise((z) => setTimeout(z, 300)); j = await (await fetch(`${L}/api/jobs/${job.id}`)).json(); } while (['running', 'queued'].includes(j.state));
assert.equal(j.state, 'done', j.error); assert.deepEqual(j.files.map((x) => x.part), ['interior']);
ok('magazine: interior PDF only, page count checked against steps of 4');

// Same shop, second product: the profile keeps both
await call('apply_print_spec', { project: pr.id, shop: 'Druckerei Test', binding: 'hardcover', width_mm: 210, height_mm: 297, bleed_mm: 3, spine_mm: 12, cover: { wrap: 15, overW: 2.5, overH: 2.5 } });
const prof = (await (await fetch(`${L}/api/profiles`)).json()).find((x) => x.id === 'user-druckerei-test');
assert.deepEqual(Object.keys(prof.bindings).sort(), ['hardcover', 'saddle']); assert.equal(prof.formats.filter((f) => !f.custom).length, 2);
ok('a second product of the same shop is added to its profile');

// Built-in format catalogue
const { PROVIDERS, validateProfile } = await import('../public/lib/providers.js');
const all = PROVIDERS.flatMap((p) => p.formats);
assert.ok(all.length > 150, `${all.length} formats`);
for (const id of ['kdp-sc-6x9', 'kdp-hc-614x921', 'is-sc-55x85', 'cewe-30x30', 'ww-gallery', 'std-mag-a4', 'std-book-s-135x215', 'mixam-mag-a5', 'blurb-mag']) assert.ok(all.some((f) => f.id === id), id);
assert.ok(!all.some((f) => f.id === 'kdp-hc-85x11'), 'KDP has no 8.5 × 11 hardcover');
for (const p of PROVIDERS) assert.deepEqual(validateProfile(p), [], p.id);
ok(`${all.length} formats in ${PROVIDERS.length} profiles: photo books, books (DE/US), magazines`);
// Special sizes: every print shop and binding has one; KDP's published limits are checked
const ed2 = (await (await fetch(`${L}/api/project/${pr.id}`)).json()).editions[0];
await opx('updateEdition', { edition: ed2.id, patch: { provider: 'kdp', format: 'kdp-special-softcover' } });
await opx('updateEdition', { edition: ed2.id, patch: { w: 250, h: 250 } });
const pfk = await (await fetch(`${L}/api/project/${pr.id}/preflight?edition=${ed2.id}`)).json();
assert.ok(pfk.warnings.some((w) => w.code === 'custom-size'), 'KDP special size outside 4–8.5 in');
for (const p of PROVIDERS) for (const b of Object.keys(p.bindings)) assert.ok(p.formats.some((f) => f.binding === b && f.custom), `${p.id} ${b} special size`);
ok('special size for every print shop and binding; KDP limits checked in preflight');

// Magazine with a separate cover: 4 single pages U1–U4
await opx('updateEdition', { edition: ed2.id, patch: { provider: 'standard', format: 'std-mag-a4' } });
const p3 = await (await fetch(`${L}/api/project/${pr.id}`)).json();
await opx('updateEdition', { edition: ed2.id, patch: { cover: { ...p3.editions[0].cover, mode: 'pages', wrap: 3 } } });
await opx('insertPages', { edition: ed2.id, at: 0, count: 2, layout: 'text' });
const job2 = await (await fetch(`${L}/api/project/${pr.id}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edition: ed2.id, parts: ['cover'], outDir: path.join(process.env.BILLERBOOK_DATA, 'out2') }) })).json();
let j2; do { await new Promise((z) => setTimeout(z, 300)); j2 = await (await fetch(`${L}/api/jobs/${job2.id}`)).json(); } while (['running', 'queued'].includes(j2.state));
assert.equal(j2.state, 'done', j2.error);
const cov = await PDFDocument.load(fs.readFileSync(j2.files[0].file));
assert.equal(cov.getPageCount(), 4);
const { width, height } = cov.getPage(0).getSize();
assert.ok(Math.abs(width / 72 * 25.4 - 216) < 0.2 && Math.abs(height / 72 * 25.4 - 303) < 0.2, `${width} × ${height}`);
ok('separate magazine cover: 4 single pages U1–U4 at 216 × 303 mm with bleed');
await c.close(); srv.close(); process.exit(0);
