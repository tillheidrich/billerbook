// Manual work: Lightroom collection order (custom, capture time, file name; descending), layout order
// options, moving a photo to another spread, page count padded to the print shop's step.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-order-'));
process.env.BILLERBOOK_DATA = path.join(tmp, 'data');
process.env.BILLERBOOK_CACHE = path.join(tmp, 'cache');
const cat = path.join(tmp, 'test.lrcat');
const db = new DatabaseSync(cat);
db.exec(`
create table AgLibraryCollection (id_local integer primary key, name text, creationId text);
create table AgLibraryRootFolder (id_local integer primary key, absolutePath text);
create table AgLibraryFolder (id_local integer primary key, rootFolder integer, pathFromRoot text);
create table AgLibraryFile (id_local integer primary key, folder integer, baseName text, extension text);
create table Adobe_images (id_local integer primary key, id_global text, rootFile integer, captureTime text, fileWidth int, fileHeight int,
  orientation text, rating int, pick int, colorLabels text, copyName text, touchTime real);
create table AgLibraryIptc (image integer, caption text);
create table AgLibraryCollectionImage (collection integer, image integer, positionInCollection text);
create table AgLibraryCollectionContent (collection integer, owningModule text, content text);
insert into AgLibraryCollection values (1, 'Eigene Reihenfolge', 'com.adobe.ag.library.collection'), (2, 'Nach Name absteigend', 'com.adobe.ag.library.collection');
insert into AgLibraryRootFolder values (1, '/fotos/');
insert into AgLibraryFolder values (1, 1, '2026/');
`);
const photos = [
  // id, name, capture time, rating
  [1, 'IMG_0010', '2026-03-01T10:00:00', 2],
  [2, 'IMG_0002', '2026-01-01T10:00:00', 5],
  [3, 'IMG_0100', '2026-02-01T10:00:00', 3],
  [4, 'IMG_0001', '2026-04-01T10:00:00', 0],
];
for (const [id, name, t, r] of photos) {
  db.prepare('insert into AgLibraryFile values (?, 1, ?, ?)').run(id, name, 'DNG');
  db.prepare("insert into Adobe_images values (?, ?, ?, ?, 6000, 4000, 'AB', ?, 0, '', null, 0)").run(id, `G${id}`, id, t, r);
}
// Collection 1: custom order 3, 1, 2 (Lightroom stores fractional position strings)
for (const [img, pos] of [[3, '--A'], [1, '--B'], [2, '--C']]) db.prepare('insert into AgLibraryCollectionImage values (1, ?, ?)').run(img, pos);
db.exec(`insert into AgLibraryCollectionContent values (1, 'com.adobe.ag.library.sortType', 'userOrder'), (1, 'com.adobe.ag.library.sortDirection', 'ascending')`);
// Collection 2: file name, descending; photo 1 is in both collections and keeps its first place
for (const img of [4, 1, 3]) db.prepare("insert into AgLibraryCollectionImage values (2, ?, '')").run(img);
db.exec(`insert into AgLibraryCollectionContent values (2, 'com.adobe.ag.library.sortType', 'fileName'), (2, 'com.adobe.ag.library.sortDirection', 'descending')`);
db.close();

const { collectionImages } = await import('../lib/catalog.mjs');
const ops = await import('../public/lib/ops.js');
const items = await collectionImages(cat, [1, 2]);
assert.equal(items.length, 4, 'a photo in two collections appears once');
const byLr = ops.orderItems(items, 'lightroom').map((i) => i.name);
assert.deepEqual(byLr, ['IMG_0100', 'IMG_0010', 'IMG_0002', 'IMG_0001'], 'custom order of collection 1, then collection 2 by name descending');
assert.deepEqual(ops.orderItems(items, 'time').map((i) => i.name), ['IMG_0002', 'IMG_0100', 'IMG_0010', 'IMG_0001']);
assert.deepEqual(ops.orderItems(items, 'name').map((i) => i.name), ['IMG_0001', 'IMG_0002', 'IMG_0010', 'IMG_0100'], 'numeric file name order');
assert.deepEqual(ops.orderItems(items, 'rating').map((i) => i.name)[0], 'IMG_0002');

// Layout in Lightroom order, no breaks at time gaps; WIRmachenDRUCK takes even page counts
const pr = ops.newProject('T');
const ed = ops.addEdition(pr, { name: 'HC', provider: 'wmd', format: 'hc-a4-quer' });
ed.pageStep = 2;
const r = ops.autoFill(pr, ed.id, items.map((i) => ({ ...i, w: 6000, h: 4000 })), { perPage: 1, highlightRating: 0, order: 'lightroom', pad: true });
assert.deepEqual(ed.pages.slice(0, 4).map((p) => p.slots[0].key), ['lr:G3', 'lr:G1', 'lr:G2', 'lr:G4']);
assert.equal(ed.pages.length % 2, 0, 'padded to an even page count');
const odd = ops.newProject('U'); ops.addEdition(odd, { name: 'HC', provider: 'wmd', format: 'hc-a4-quer' }); odd.editions[0].pageStep = 2;
const r2 = ops.autoFill(odd, odd.editions[0].id, items.slice(0, 3).map((i) => ({ ...i, w: 6000, h: 4000 })), { perPage: 1, highlightRating: 0, order: 'time', pad: true });
assert.equal(r2.added, 1); assert.equal(odd.editions[0].pages.length, 4);

// Move a photo from page 0 to page 3
ed.pages[0].slots[0].tone = 'bw';
assert.equal(ops.moveImage(pr, ed.id, { page: 0, slot: 0 }, 3), true);
assert.ok(!ed.pages[0].slots.some((s) => s?.key === 'lr:G3'), 'gone from page 0');
const moved = ed.pages[3].slots.find((s) => s?.key === 'lr:G3');
assert.ok(moved, 'now on page 3'); assert.equal(moved.tone, 'bw', 'tone travels with the photo');
assert.equal(ops.moveImage(pr, ed.id, { page: 3, slot: 0 }, 3), false, 'same page: nothing to do');
console.log('ok order: Lightroom collection order (custom, name desc), time/name/rating, move photo to a spread, even page counts');
