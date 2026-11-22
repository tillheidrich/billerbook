// Preflight checks that need the font files or the cover geometry (server side only):
// text that does not fit its frame, text below 6 pt, barcode problems.

import { buildFrames, pageOwner, coverFrames } from '../public/lib/layouts.js';
import { resolveStyle } from '../public/lib/text.js';
import { coverSpec } from '../public/lib/geometry.js';
import { parseIsbn } from '../public/lib/barcode.js';
import { findProvider } from '../public/lib/providers.js';
import { textFrameCommands } from './fonts.mjs';
import { barcodeInfo } from './pdf.mjs';

export function extraChecks(project, ed, poolMap) {
  const out = [];
  const aspectOf = (k) => { const it = poolMap.get(k); return it?.w ? it.w / it.h : null; };
  const checkText = (f, tx, where) => {
    if (!tx?.value?.trim()) return;
    const st = resolveStyle(ed, f.role || 'body', tx);
    if (st.size < 6) out.push({ level: 'warn', code: 'text-small', ...where, params: { pt: Math.round(st.size * 10) / 10 } });
    const r = textFrameCommands(project, st, tx.value, f, { rotate: f.role === 'spine' });
    if (r.overflow) out.push({ level: 'warn', code: f.role === 'spine' ? 'spine-overflow' : 'text-overflow', ...where, params: { text: String(tx.value).slice(0, 30) } });
  };
  for (let i = 0; i < ed.pages.length; i++) {
    if (pageOwner(ed, i).owner !== i) continue;
    const p = ed.pages[i];
    for (const f of buildFrames(ed, i, aspectOf)) if (f.kind === 'text') checkText(f, p.texts?.[f.text], { page: i, frame: f.text });
  }
  if (ed.cover?.mode !== 'none') {
    const { frames } = coverFrames(ed, aspectOf);
    for (const f of frames) if (f.kind === 'text') checkText(f, ed.coverDesign?.texts?.[f.text], { cover: true, frame: f.text });
    const bc = ed.coverDesign?.barcode;
    const prov = findProvider(ed.provider);
    if (bc?.mode === 'isbn') {
      const p = parseIsbn(bc.isbn);
      if (!p.ok) out.push({ level: 'error', code: 'isbn-invalid', params: { isbn: bc.isbn || '' } });
      else if ((Number(bc.scale) || 1) < 0.8) out.push({ level: 'warn', code: 'barcode-small', params: { pct: Math.round((Number(bc.scale) || 1) * 100) } });
    }
    if (prov.barcode === 'required' && bc?.mode !== 'isbn') out.push({ level: 'error', code: 'barcode-required', params: { shop: prov.name } });
    if (prov.barcode === 'placeholder' && !bc?.mode) out.push({ level: 'warn', code: 'barcode-placeholder', params: { shop: prov.name } });
    const info = barcodeInfo(ed, coverSpec(ed));
    if (info && !info.error) {
      const cs = coverSpec(ed);
      const inBack = info.x >= cs.back.x - 0.01 && info.x + info.width <= cs.back.x + cs.back.w + 0.01;
      if (!inBack) out.push({ level: 'warn', code: 'barcode-position' });
    }
  }
  return out;
}
