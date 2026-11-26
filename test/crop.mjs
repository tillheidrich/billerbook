// Crop ratio per photo (like Lightroom's crop tool) and large portrait plates on landscape pages.
import assert from 'node:assert/strict';
import * as ops from '../public/lib/ops.js';
import { buildFrames } from '../public/lib/layouts.js';
import { checkProject } from '../public/lib/safe.js';

const pr = ops.newProject('t');
const ed = ops.addEdition(pr, { provider: 'wmd', format: 'hc-a4-quer' });
ops.insertPages(pr, ed.id, null, 2, 'tafel');
ops.placeImage(pr, ed.id, 1, 0, 'portrait');
const aspect = (k) => (k === 'portrait' ? 2 / 3 : 1.5);

// A portrait plate on a landscape page takes most of the page height (the canon block alone gives 2/3)
const [f] = buildFrames(ed, 1, aspect).filter((x) => x.kind === 'image');

assert.ok(f.h / ed.h > 0.8, `portrait plate uses ${Math.round((100 * f.h) / ed.h)} % of the page height`);
assert.ok(Math.abs(f.w / f.h - 2 / 3) < 0.01, 'plate keeps the photo ratio');
assert.ok(f.y >= (ed.safety ?? 5), 'stays inside the safety margin');

// Crop to 1:1: the plate becomes square, the photo fills it
ops.updateSlot(pr, ed.id, 1, 0, { aspect: 1, zoom: 1, ox: 0, oy: 0 });
const [sq] = buildFrames(ed, 1, aspect).filter((x) => x.kind === 'image');
assert.ok(Math.abs(sq.w / sq.h - 1) < 0.01, 'square crop');
// Back to the original: null removes the setting (JSON drops undefined)
ops.updateSlot(pr, ed.id, 1, 0, { aspect: null });
assert.equal('aspect' in ed.pages[1].slots[0], false);
const [back] = buildFrames(ed, 1, aspect).filter((x) => x.kind === 'image');
assert.ok(Math.abs(back.w / back.h - 2 / 3) < 0.01);

// Only plain ratios between 1:5 and 5:1 survive a save
ed.pages[1].slots[0].aspect = 99;
const probs = checkProject(pr, { fix: true });
assert.ok(probs.some((p) => p.path.endsWith('.aspect')));
assert.equal(ed.pages[1].slots[0].aspect, undefined);
console.log('ok crop: ratio per photo, null resets, portrait plates fill the page height, ratio checked on save');

