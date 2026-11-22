// Reads a print shop's specification sheet (PDF data sheet, "Druckdatenskizze", cover template)
// and lists the measurements it finds. The result is for an assistant or the user to check and pass to
// apply_print_spec: it shows each value with the sentence it came from, never guesses silently.

const MM = { mm: 1, cm: 10, in: 25.4, '"': 25.4, zoll: 25.4, inch: 25.4, inches: 25.4, pt: 25.4 / 72 };
const MAX_PDF = 50 << 20;
const num = (s) => Number(String(s).replace(',', '.'));
const round = (v) => Math.round(v * 100) / 100;

// Text of every page plus its size. pdf.js runs without eval and without fonts (data only).
export async function pdfPages(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 5 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw Object.assign(new Error('not a PDF file'), { status: 400 });
  if (buf.length > MAX_PDF) throw Object.assign(new Error('PDF larger than 50 MB'), { status: 413 });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const page = await doc.getPage(i);
    const [x0, y0, x1, y1] = page.view;
    const tc = await page.getTextContent();
    let text = '';
    for (const it of tc.items) text += (it.str || '') + (it.hasEOL ? '\n' : ' ');
    pages.push({ page: i, w_mm: round(((x1 - x0) / 72) * 25.4), h_mm: round(((y1 - y0) / 72) * 25.4), text: text.replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim() });
  }
  await doc.destroy();
  return pages;
}

const UNIT = '(mm|cm|in|inch|inches|zoll|"|pt)?';
const N = '(\\d{1,4}(?:[.,]\\d{1,3})?)';
const toMm = (v, u, fallback = 'mm') => round(num(v) * (MM[(u || fallback).toLowerCase()] ?? 1));

// label patterns (German and English) → field
const SIZE_LABELS = [
  ['trim', /(endformat|finales? format|beschnittformat|trim(?:med)? size|final size|finished size|book size|page size|endformat innenseiten)/i],
  ['data', /(datenformat|dokumentformat|anlageformat|pdf size|document size|file size with bleed|with bleed|inkl\.? beschnitt|mit beschnitt)/i],
  ['cover', /(umschlag|cover)/i],
];
const VALUE_LABELS = [
  ['bleed', /(beschnitt(?:zugabe)?|anschnitt|bleed)/i],
  ['safety', /(sicherheitsabstand|sicherheitsrand|mindestabstand|abstand zum (?:rand|schnitt)|safe(?:ty)? (?:zone|margin|area|boundary)|inset for margins|keep (?:text|content) at least)/i],
  ['spine', /(rücken(?:breite|stärke)?|buchrücken|spine(?: width)?)/i],
  ['wrap', /(einschlag|umschlag(?:zugabe)?|wrap(?:around)?|turn-?in)/i],
  ['hinge', /(falz|gelenk|hinge|joint)/i],
  ['glue', /(klebe(?:rand|bereich|kante)|bundsteg|gutter|binding margin|inner margin)/i],
];

function snippet(text, i, len) { return text.slice(Math.max(0, i - 50), Math.min(text.length, i + len + 50)).replace(/\s+/g, ' ').trim(); }

export function findSpecs(pages) {
  const found = { trim: [], data: [], cover: [], bleed: [], safety: [], spine: [], wrap: [], hinge: [], glue: [], pages: [], colour: [], interior: [], icc: [] };
  for (const p of pages) {
    const t = p.text;
    // Sizes "210 x 297 mm"
    const sizeRe = new RegExp(`${N}\\s*(?:mm|cm)?\\s*[x×]\\s*${N}\\s*${UNIT}`, 'gi');
    for (const m of t.matchAll(sizeRe)) {
      const before = t.slice(Math.max(0, m.index - 60), m.index);
      const unit = m[3] || (/(mm)/i.test(t.slice(m.index, m.index + m[0].length + 4)) ? 'mm' : 'mm');
      const w = toMm(m[1], unit), h = toMm(m[2], unit);
      if (w < 30 || h < 30 || w > 2000 || h > 2000) continue;
      const label = SIZE_LABELS.find(([, re]) => re.test(before));
      found[label ? label[0] : 'trim'].push({ w_mm: w, h_mm: h, page: p.page, labelled: !!label, context: snippet(t, m.index, m[0].length) });
    }
    // Single values "Beschnitt: 3 mm"
    for (const [key, re] of VALUE_LABELS) {
      const vr = new RegExp(`${re.source}[^\\d\\n]{0,40}?${N}\\s*${UNIT}`, 'gi');
      for (const m of t.matchAll(vr)) {
        const unit = m[m.length - 1];
        const mm = toMm(m[m.length - 2], unit);
        if (!(mm >= 0 && mm < 200)) continue;
        found[key].push({ mm, unit: unit || 'mm (assumed)', page: p.page, context: snippet(t, m.index, m[0].length) });
      }
    }
    // "15 mm Beschnitt" (number first)
    for (const m of t.matchAll(new RegExp(`${N}\\s*${UNIT}\\s*(beschnitt|anschnitt|bleed)`, 'gi'))) {
      const mm = toMm(m[1], m[2]); if (mm >= 0 && mm < 60) found.bleed.push({ mm, unit: m[2] || 'mm (assumed)', page: p.page, context: snippet(t, m.index, m[0].length) });
    }
    // Cover as "460 + B x 332 mm" (B = spine): data size before "Endformat", final size after it
    for (const m of t.matchAll(/(\d{2,4})\s*\+\s*B\s*[x×]\s*(\d{2,4})\s*(mm)?/gi)) {
      const before = t.slice(0, m.index);
      const lastData = Math.max(before.lastIndexOf('Datenformat'), before.lastIndexOf('Data size'), before.lastIndexOf('Document size'));
      const lastFinal = Math.max(before.lastIndexOf('Endformat'), before.lastIndexOf('Final size'), before.lastIndexOf('Trim size'));
      found.cover.push({ kind: lastFinal > lastData ? 'final' : 'data', w_without_spine_mm: Number(m[1]), h_mm: Number(m[2]), page: p.page, context: snippet(t, m.index, m[0].length) });
    }
    // Page rules
    for (const m of t.matchAll(/(durch\s*4\s*teilbar|vielfache[sn]?\s*von\s*4|multiples?\s*of\s*(?:4|four)|in\s*(?:4|vier)er-?schritten|increments of (?:4|four))/gi)) found.pages.push({ step: 4, page: p.page, context: snippet(t, m.index, m[0].length) });
    for (const m of t.matchAll(/(gerade(?:\s*anzahl)?|even (?:number|page count))/gi)) found.pages.push({ step: 2, page: p.page, context: snippet(t, m.index, m[0].length) });
    for (const m of t.matchAll(/(?:min(?:imum|destens)?\.?\s*)?(\d{1,3})\s*(?:bis|-|–|to)\s*(\d{2,4})\s*(?:seiten|pages|pp)/gi)) found.pages.push({ min: Number(m[1]), max: Number(m[2]), page: p.page, context: snippet(t, m.index, m[0].length) });
    for (const m of t.matchAll(/\b(cmyk|srgb|rgb)\b/gi)) found.colour.push({ value: m[1].toLowerCase() === 'cmyk' ? 'cmyk' : 'srgb', page: p.page, context: snippet(t, m.index, m[0].length) });
    for (const m of t.matchAll(/(iso\s*coated\s*v2(?:\s*\(?eci\)?)?|pso\s*coated\s*v3|fogra\s*\d{2}|psov?\s*uncoated[^\n,;]{0,10})/gi)) found.icc.push({ value: m[1], page: p.page, context: snippet(t, m.index, m[0].length) });
    for (const m of t.matchAll(/(doppelseite[n]?|druckbogen|spreads?|double[- ]page)/gi)) found.interior.push({ value: 'spreads?', page: p.page, context: snippet(t, m.index, m[0].length) });
    for (const m of t.matchAll(/(einzelseite[n]?|single pages?|individual pages)/gi)) found.interior.push({ value: 'single', page: p.page, context: snippet(t, m.index, m[0].length) });
  }
  // A value next to "verklebt/glued" describes the glue zone, not the wrap.
  for (const x of [...found.wrap]) if (/verkleb|glued|klebe/i.test(x.context)) { found.wrap.splice(found.wrap.indexOf(x), 1); found.glue.push(x); }
  // Bleed follows from data size − final size when both are given.
  const derived = {};
  const trim = found.trim.find((x) => x.labelled) || found.trim[0];
  const data = found.data[0];
  if (trim && data) {
    const bw = round((data.w_mm - trim.w_mm) / 2), bh = round((data.h_mm - trim.h_mm) / 2);
    if (bw >= 0 && bw < 30) derived.bleed_mm_from_sizes = bw === bh ? bw : { horizontal: bw, vertical: bh };
  }
  // Cover wrap and board overhang from the cover formulas (book block = trim size)
  const cd = found.cover.find((x) => x.kind === 'data'), cf = found.cover.find((x) => x.kind === 'final');
  if (cd && cf) derived.cover_wrap_mm = round((cd.w_without_spine_mm - cf.w_without_spine_mm) / 2);
  if (cf && trim) {
    derived.cover_overW_mm = round(cf.w_without_spine_mm / 2 - trim.w_mm);
    derived.cover_overH_mm = round((cf.h_mm - trim.h_mm) / 2);
  }
  // Drop exact duplicates
  for (const k of Object.keys(found)) {
    const seen = new Set();
    found[k] = found[k].filter((x) => { const key = JSON.stringify({ ...x, context: undefined, page: undefined }); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 12);
  }
  return { found, derived };
}

export async function readSpecSheet(buf) {
  const pages = await pdfPages(buf);
  const { found, derived } = findSpecs(pages);
  return {
    pages: pages.map((p) => ({ page: p.page, size_mm: `${p.w_mm} × ${p.h_mm}`, text: p.text.slice(0, 6000) })),
    found, derived,
    hint: 'Values are candidates with the sentence they came from. Check them, then call apply_print_spec. A PDF whose page is the cover itself (a cover template) is better used with import_cover_template.',
  };
}
