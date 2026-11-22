// Page overview: all spreads of an edition as a contact sheet, for a quick look at the whole
// book (app, MCP view_overview) and as a printable PDF for approval before printing.
import fs from 'node:fs';
import sharp from 'sharp';
import { spreadsOf } from '../public/lib/geometry.js';
import { renderSpread, renderCover } from './preview.mjs';

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const pageNo = (ed, i) => (ed.subset ? ed.subset[i] : i + 1);

export function spreadLabel(ed, s) {
  const [l, r] = spreadsOf(ed.pages.length)[s];
  return [l, r].filter((x) => x != null).map((x) => pageNo(ed, x)).join('–');
}

// One sheet: optional cover tile, then spreads [from, from + count). Returns a JPEG.
export async function renderOverview(project, ed, pool, { from = 0, count = 12, cols = 4, width = 2400, cover = true, title = '', bg = '#e9e6e0', ink = '#2a2723' } = {}) {
  const total = spreadsOf(ed.pages.length).length;
  from = Math.max(0, Math.min(total, from));
  const to = Math.min(total, from + Math.max(1, count));
  const tiles = [];
  if (cover && from === 0 && ed.cover?.mode !== 'none') tiles.push({ kind: 'cover', label: 'Umschlag / Cover' });
  for (let s = from; s < to; s++) tiles.push({ kind: 'spread', s, label: spreadLabel(ed, s) });
  const pad = Math.round(width * 0.012), labelH = Math.round(width * 0.016) + pad;
  const headH = title ? Math.round(width * 0.03) + pad : 0;
  const tileW = Math.floor((width - pad * (cols + 1)) / cols);
  const tileH = Math.round((tileW * ed.h) / (2 * ed.w));
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  const height = headH + pad + rows * (tileH + labelH + pad);
  const layers = [];
  const fs_ = Math.round(width * 0.011);
  const text = [];
  if (title) text.push(`<text x="${pad}" y="${pad + Math.round(width * 0.02)}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(width * 0.016)}" font-weight="700" fill="${ink}">${esc(title)}</text>`);
  for (let n = 0; n < tiles.length; n++) {
    const t = tiles[n];
    const x = pad + (n % cols) * (tileW + pad);
    const y = headH + pad + Math.floor(n / cols) * (tileH + labelH + pad);
    let img;
    if (t.kind === 'cover') {
      const raw = await renderCover(project, ed, pool, tileW * 2, { guides: false });
      img = await sharp(raw).resize(tileW, tileH, { fit: 'contain', background: bg }).jpeg({ quality: 85 }).toBuffer();
    } else {
      img = await sharp(await renderSpread(project, ed, pool, t.s, tileW, { gutterLine: true })).resize(tileW, tileH, { fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
    }
    layers.push({ input: img, left: x, top: y });
    text.push(`<rect x="${x - 0.5}" y="${y - 0.5}" width="${tileW + 1}" height="${tileH + 1}" fill="none" stroke="#00000022"/>`);
    text.push(`<text x="${x + tileW / 2}" y="${y + tileH + Math.round(labelH * 0.72)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fs_}" fill="${ink}">${esc(t.label)}</text>`);
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text.join('')}</svg>`);
  const buf = await sharp({ create: { width, height, channels: 3, background: bg } }).composite([...layers, { input: svg, left: 0, top: 0 }]).jpeg({ quality: 86 }).toBuffer();
  return { buf, from, to, total, width, height };
}

// Minimal PDF writer: one JPEG per page, each page sized to its image (fit inside A4 landscape).
function jpegPdf(sheets) {
  const objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  const pageIds = [];
  const pagesId = 2;
  objs.push(null, null); // 1 catalog, 2 pages
  for (const sh of sheets) {
    const W = 841.89, H = (841.89 * sh.height) / sh.width; // A4 landscape width, height follows the sheet
    const img = add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${sh.width} /Height ${sh.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${sh.buf.length} >>\nstream\n`), sh.buf, Buffer.from('\nendstream')]));
    const cs = `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`;
    const content = add(Buffer.from(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    pageIds.push(add(Buffer.from(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`)));
  }
  objs[0] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offs = [];
  let len = parts[0].length;
  objs.forEach((b, i) => { const head = Buffer.from(`${i + 1} 0 obj\n`); const tail = Buffer.from('\nendobj\n'); offs.push(len); parts.push(head, b, tail); len += head.length + b.length + tail.length; });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

// Printable overview: 16 spreads per A4 landscape sheet, cover first, page numbers under each spread.
export async function exportOverview({ project, ed, pool, file, title = '', perSheet = 16, cols = 4, onProgress = () => {} }) {
  const total = spreadsOf(ed.pages.length).length;
  const sheets = [];
  let s = 0, first = true;
  while (s < total || first) {
    const hasCover = first && ed.cover?.mode !== 'none';
    const count = perSheet - (hasCover ? 1 : 0);
    const sh = await renderOverview(project, ed, pool, { from: s, count, cols, width: 3300, cover: first, title: `${title}${total ? `  ·  ${sheets.length + 1}` : ''}`, bg: '#ffffff' });
    sheets.push(sh);
    s = sh.to; first = false;
    onProgress(s, total);
    if (!total) break;
  }
  await fs.promises.writeFile(file, jpegPdf(sheets));
  return { file, sheets: sheets.length, spreads: total };
}
