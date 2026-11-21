// Acceptance tests for the 0.9 speed features (shuffle, free frames, captions, page numbers).
import assert from 'node:assert/strict';
import * as ops from '../public/lib/ops.js';
import { buildFrames, pageNumberFor } from '../public/lib/layouts.js';

const p = ops.newProject('t');
const ed = ops.addEdition(p, { provider: 'wmd', format: 'hc-a4-quer' });
const keys = ['a', 'b', 'c', 'd'];
const aspect = { a: 1.5, b: 1.5, c: 0.667, d: 1.5 };
ops.autoFill(p, ed.id, keys.map((k) => ({ key: k, w: aspect[k] * 1000, h: 1000 })), { perPage: 4 });
assert.equal(ed.pages.length, 1);

// Given an auto page, when shuffling, then the arrangement changes but the photos stay
const before = JSON.stringify(buildFrames(ed, 0, (k) => aspect[k]));
ops.shuffleLayout(p, ed.id, 0);
const after = JSON.stringify(buildFrames(ed, 0, (k) => aspect[k]));
assert.notEqual(before, after);
assert.deepEqual(ed.pages[0].slots.map((s) => s.key), keys);

// Given a fixed layout, when shuffling, then another layout with the same photo count is chosen
ops.setLayout(p, ed.id, 0, 'vier-raster');
const r = ops.shuffleLayout(p, ed.id, 0);
assert.notEqual(r.layout, 'vier-raster');
assert.equal(ed.pages[0].slots.filter(Boolean).length, 4);

// Free frames: convert keeps the photos, frames can be moved, added and removed
ops.toFreeLayout(p, ed.id, 0, (k) => aspect[k]);
assert.equal(ed.pages[0].layout, 'frei');
assert.equal(ed.pages[0].frames.length, 4);
ops.updateFreeFrame(p, ed.id, 0, 0, { x: 0.5, y: 0.5 });
assert.equal(ed.pages[0].frames[0].x, 0.5);
ops.addFreeFrame(p, ed.id, 0, 'text');
assert.equal(ed.pages[0].frames.length, 5);
ops.removeFreeFrame(p, ed.id, 0, 1);
assert.deepEqual(ed.pages[0].slots.map((s) => s?.key), ['a', 'c', 'd']);

// Captions: empty caption frames are filled from metadata, filled ones are kept
ops.insertPages(p, ed.id, null, 1, 'bild-text');
ops.placeImage(p, ed.id, 1, 0, 'b');
const res = ops.fillCaptions(p, ed.id, (k) => (k === 'b' ? 'Snow on the Röhrsdorfer Weg' : ''));
assert.equal(res.filled, 1);
assert.equal(ed.pages[1].texts[0].value, 'Snow on the Röhrsdorfer Weg');
ops.fillCaptions(p, ed.id, () => 'other');
assert.equal(ed.pages[1].texts[0].value, 'Snow on the Röhrsdorfer Weg'); // filled captions are kept

// Page numbers: outer corner, hidden on full-bleed pages
ed.pageNumbers = 'outer';
assert.equal(pageNumberFor(ed, 1).align, 'left');
ops.insertPages(p, ed.id, null, 1, 'voll');
assert.equal(pageNumberFor(ed, 2), null);
console.log('features ok');
