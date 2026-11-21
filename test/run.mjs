// End-to-end test: folder → project → auto layout → spread preview → PDF export → checks.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbs-'));
process.env.BILLERBOOK_DATA = path.join(tmp, 'data');
process.env.BILLERBOOK_CACHE = path.join(tmp, 'cache');
const imgDir = path.join(tmp, 'bilder');
fs.mkdirSync(imgDir);
const colors = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#2c3e50'];
for (let i = 0; i < 24; i++) {
  const land = i % 3 !== 2;
  const [w, h] = land ? [3600, 2400] : [2400, 3600];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${colors[i % 8]}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="#fff"/><text x="50%" y="55%" font-size="${h / 6}" text-anchor="middle" fill="#000">${i + 1}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).withExif({ IFD0: {}, IFD2: { DateTimeOriginal: `2026:0${1 + Math.floor(i / 8)}:1${i % 8} 12:00:00` } }).toFile(path.join(imgDir, `IMG_${String(i).padStart(4, '0')}.jpg`));
}
const { createProject, buildPool, loadProject, saveProject } = await import('../lib/store.mjs');
const ops = await import('../public/lib/ops.js');
const { exportInterior, exportCover } = await import('../lib/pdf.mjs');
const { renderSpread, renderCover } = await import('../lib/preview.mjs');

const p = await createProject({ name: 'Test', folder: imgDir });
const pool = await buildPool(p);
console.log('pool', pool.items.length, pool.items[0].time, pool.items[0].w, pool.items[0].h);
const [hc, sc] = p.editions;
ops.autoFill(p, hc.id, pool.items.map((it, i) => ({ ...it, rating: i === 4 ? 5 : 0 })), { perPage: 3 });
ops.setLayout(p, hc.id, 3, 'dps-voll');
ops.placeImage(p, hc.id, 3, 0, pool.items[0].key);
ops.setLayout(p, hc.id, 5, 'text');
ops.setText(p, hc.id, 5, 0, 'Sommer 2026'); ops.setText(p, hc.id, 5, 1, 'Grüße aus Tostedt – äöü ß € „Zitat“');
ops.updateSlot(p, hc.id, 0, 0, { fit: 'contain' });
hc.spine = 15; hc.coverDesign.slots = [{ key: pool.items[1].key }]; hc.coverDesign.texts = [{ value: 'ZWEITAUSENDSECHSUNDZWANZIG' }, { value: 'Rückseite' }];
// Second edition: copy and re-flow to portrait softcover
const sc2 = ops.addEdition(p, { name: 'Softcover kopiert', provider: 'wmd', format: 'sc-a4-hoch', copyFrom: hc.id });
sc2.spine = 18;
await saveProject(p);
console.log('pages hc', hc.pages.length, 'sc2', sc2.pages.length, 'layouts', hc.pages.map((x) => x.layout + (x.spanned ? '*' : '')).join(','));
console.log('stats', JSON.stringify(ops.editionStats(p, hc.id, pool.items)), 'usage keys', ops.usage(p).size);
console.log('preflight hc', JSON.stringify(ops.preflight(p, hc.id, pool.map).slice(0, 6)));

fs.writeFileSync(path.join(tmp, 'spread2.jpg'), await renderSpread(p, hc, pool.map, 2));
fs.writeFileSync(path.join(tmp, 'spread1-sc.jpg'), await renderSpread(p, sc2, pool.map, 1));
fs.writeFileSync(path.join(tmp, 'cover.jpg'), await renderCover(p, hc, pool.map));

const t0 = Date.now();
const r1 = await exportInterior({ ed: hc, pool: pool.map, file: path.join(tmp, 'hc_inhalt.pdf'), title: 'Test' });
const r2 = await exportCover({ ed: hc, pool: pool.map, file: path.join(tmp, 'hc_umschlag.pdf') });
const r3 = await exportInterior({ ed: sc2, pool: pool.map, file: path.join(tmp, 'sc_inhalt.pdf'), preview: true });
const r4 = await exportCover({ ed: sc2, pool: pool.map, file: path.join(tmp, 'sc_umschlag.pdf') });
console.log('export ms', Date.now() - t0, r1, r2.size, r4.size);
for (const f of ['hc_inhalt', 'hc_umschlag', 'sc_inhalt', 'sc_umschlag']) {
  const info = execSync(`pdfinfo -box "${path.join(tmp, f + '.pdf')}"`).toString();
  console.log(f, info.match(/Pages:.*|Page size:.*|TrimBox:.*/g).join(' | '));
  execSync(`qpdf --check "${path.join(tmp, f + '.pdf')}" > /dev/null`);
}
execSync(`pdftoppm -r 40 -png -f 1 -l 8 "${path.join(tmp, 'hc_inhalt.pdf')}" "${path.join(tmp, 'hc')}"`);
execSync(`pdftoppm -r 30 -png "${path.join(tmp, 'hc_umschlag.pdf')}" "${path.join(tmp, 'cov')}"`);
console.log('TMP', tmp);
