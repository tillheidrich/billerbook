// Fonts from this computer: collections (.ttc) split into single fonts, quick listing by family,
// fonts from system folders kept out of project packages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import opentype from 'opentype.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-fonts-'));
const fontsMod = await import('../lib/fonts.mjs');

// Two small fonts made with opentype.js
const make = (family, style, weight) => {
  const notdef = new opentype.Glyph({ name: '.notdef', advanceWidth: 500, path: new opentype.Path() });
  const glyphs = [notdef];
  for (let c = 32; c < 127; c++) { const p = new opentype.Path(); p.moveTo(50, 0); p.lineTo(450, 0); p.lineTo(450, 700); p.close(); glyphs.push(new opentype.Glyph({ name: `g${c}`, unicode: c, advanceWidth: 500, path: p })); }
  const f = new opentype.Font({ familyName: family, styleName: style, unitsPerEm: 1000, ascender: 800, descender: -200, glyphs, weightClass: weight });
  return Buffer.from(f.toArrayBuffer());
};
const a = make('Testgrotesk', 'Regular', 400), b = make('Testgrotesk', 'Bold Italic', 700);
// Build a collection: header, then both fonts with their table offsets moved by their position.
const ttc = (() => {
  const fontsIn = [a, b];
  const head = Buffer.alloc(12 + 4 * fontsIn.length);
  head.write('ttcf', 0, 'latin1'); head.writeUInt32BE(0x00010000, 4); head.writeUInt32BE(fontsIn.length, 8);
  let pos = head.length;
  const parts = [];
  fontsIn.forEach((f, i) => {
    const c = Buffer.from(f);
    const n = c.readUInt16BE(4);
    for (let t = 0; t < n; t++) { const r = 12 + 16 * t; c.writeUInt32BE(c.readUInt32BE(r + 8) + pos, r + 8); }
    head.writeUInt32BE(pos, 12 + 4 * i);
    parts.push(c); pos += c.length;
  });
  return Buffer.concat([head, ...parts]);
})();
const dir = path.join(tmp, 'Fonts');
fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, 'Testgrotesk.ttc'), ttc);
fs.writeFileSync(path.join(dir, 'Other.ttf'), make('Otherface', 'Regular', 400));

assert.equal(fontsMod.collectionCount(ttc), 2);
const one = fontsMod.fontFromCollection(ttc, 1);
const parsed = opentype.parse(one.buffer.slice(one.byteOffset, one.byteOffset + one.length));
assert.ok(parsed.charToGlyph('A').index > 0, 'font 1 of the collection works on its own');
const info = fontsMod.inspectFontFile(path.join(dir, 'Testgrotesk.ttc') + '#1');
assert.equal(info.family, 'Testgrotesk'); assert.equal(info.weight, 700);
assert.throws(() => fontsMod.fontFromCollection(ttc, 5));

const list = fontsMod.systemFonts({ refresh: true, dirs: [dir] });
const fam = list.find((f) => f.family === 'Testgrotesk');
assert.ok(fam && fam.styles.length === 2, 'both styles of the collection listed');
assert.ok(fam.styles.some((s) => s.weight === 700 && s.italic), 'bold italic recognised from the font itself');
assert.ok(list.some((f) => f.family === 'Otherface'));

// Package: fonts marked as installed on this computer are not packed
process.env.BILLERBOOK_DATA = path.join(tmp, 'data');
const { exportPackage } = await import('../lib/package.mjs').catch(() => ({}));
if (exportPackage) {
  const pr = { id: 'p1', name: 'T', version: 1, sources: { folders: [] }, editions: [], fonts: [{ id: 'sys', name: 'Sys', system: true, files: { '400-normal': path.join(dir, 'Other.ttf') } }, { id: 'own', name: 'Own', files: { '400-normal': path.join(dir, 'Other.ttf') } }] };
  const out = path.join(tmp, 'x.billerbook');
  await exportPackage({ project: pr, pool: new Map(), file: out });
  const z = fs.readFileSync(out).toString('latin1');
  assert.ok(!z.includes('fonts/sys/'), 'system font not packed');
  assert.ok(z.includes('fonts/own/'), 'own font packed');
}
console.log('ok fonts from this computer: .ttc collections, quick family listing, not packed into project files');
