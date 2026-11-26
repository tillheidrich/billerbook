// Book styles 0.13: every template applies to a finished book (restyle) and lays out a new one
// (relayout) without empty frames; tones and covers with a title.
import assert from 'node:assert/strict';
import * as ops from '../public/lib/ops.js';
import { TEMPLATES } from '../public/lib/templates.js';
import { buildFrames, coverFrames, slotCount } from '../public/lib/layouts.js';

const items = Array.from({ length: 40 }, (_, i) => ({ key: `k${i}`, w: i % 3 === 0 ? 2000 : 3000, h: i % 3 === 0 ? 3000 : 2000, rating: i % 9 === 0 ? 5 : 3, time: new Date(Date.UTC(2026, Math.floor(i / 8), 1 + (i % 8), 10)).toISOString(), caption: `Ort ${i}` }));
const aspectOf = (k) => { const it = items.find((x) => x.key === k); return it.w / it.h; };
const noEmptyFrames = (ed, label) => {
  for (let i = 0; i < ed.pages.length; i++) {
    const p = ed.pages[i];
    if (p.spanned) continue;
    const n = slotCount(p.layout);
    if (n) assert.ok(p.slots.every(Boolean), `${label}: empty frame on page ${i + 1} (${p.layout})`);
  }
};
for (const tp of TEMPLATES) {
  // New book in the template's rhythm
  const pr = ops.newProject('t');
  const ed = ops.addEdition(pr, { provider: 'wmd', format: 'hc-a4-quer' });
  ops.applyTemplate(pr, ed.id, tp.id, { aspectOf });
  ops.autoFill(pr, ed.id, items, { ...tp.fill, replace: true, highlightRating: 5 });
  assert.ok(ed.pages.length > 0, tp.id);
  noEmptyFrames(ed, `${tp.id} relayout`);
  for (let i = 0; i < ed.pages.length; i++) buildFrames(ed, i, aspectOf);
  // A finished monograph book restyled by the template keeps all photos
  const pr2 = ops.newProject('u');
  const ed2 = ops.addEdition(pr2, { provider: 'wmd', format: 'hc-a4-quer' });
  ops.autoFill(pr2, ed2.id, items, { style: 'monograph', replace: true });
  const before = ed2.pages.flatMap((p) => p.slots).filter(Boolean).map((s) => s.key).sort();
  ops.applyTemplate(pr2, ed2.id, tp.id, { aspectOf });
  const after = ed2.pages.flatMap((p) => p.slots).filter(Boolean).map((s) => s.key).sort();
  assert.deepEqual(after, before, `${tp.id}: restyle keeps every photo`);
  noEmptyFrames(ed2, `${tp.id} restyle`);
  if (tp.fill.tone) assert.ok(ed2.pages.flatMap((p) => p.slots).filter(Boolean).every((s) => s.tone === tp.fill.tone), `${tp.id}: tone on every photo`);
  const roles = coverFrames(ed2).frames.filter((f) => f.kind === 'text').map((f) => f.role);
  if (!['cover-wrap', 'cover-front'].includes(tp.cover.layout)) assert.ok(roles.includes('cover') || roles.includes('title'), `${tp.id}: cover has a title`);
}
console.log(`ok styles: ${TEMPLATES.length} templates lay out and restyle without empty frames, keep every photo, tone and cover title`);
