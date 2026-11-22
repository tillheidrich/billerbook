// ISBN check and EAN-13 barcode (with optional EAN-5 price add-on) as vector bars in mm.
// Sizes follow GS1: module 0.33 mm at 100 %, bars 22.85 mm high, scale 80–200 %.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = L.map((c) => [...c].map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY13 = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const PARITY5 = ['GGLLL', 'GLGLL', 'GLLGL', 'GLLLG', 'LGGLL', 'LLGGL', 'LLLGG', 'LGLGL', 'LGLLG', 'LLGLG'];

const digitsOf = (s) => String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();

export function ean13Check(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

// Accepts ISBN-13 or ISBN-10 (with or without hyphens). Returns { ok, isbn13, error }.
export function parseIsbn(input) {
  const d = digitsOf(input);
  if (!d) return { ok: false, error: 'empty' };
  if (d.length === 10) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (d[i] === 'X' ? 10 : Number(d[i])) * (10 - i);
    if (sum % 11) return { ok: false, error: 'check' };
    const b = `978${d.slice(0, 9)}`;
    return { ok: true, isbn13: b + ean13Check(b), converted: true };
  }
  if (d.length !== 13 || /X/.test(d)) return { ok: false, error: 'length' };
  if (!/^97[89]/.test(d)) return { ok: false, error: 'prefix' };
  if (ean13Check(d) !== Number(d[12])) return { ok: false, error: 'check' };
  return { ok: true, isbn13: d };
}

export const parseAddon = (s) => { const d = digitsOf(s); return d.length === 5 && !/X/.test(d) ? d : null; };

// Hyphenless ISBN with conventional grouping for the human-readable line (prefix-group-rest).
// Only digits, X, hyphens and spaces from the user's input appear in the label (it goes into SVG/PDF text).
export const isbnLabel = (input, isbn13) => {
  const s = String(input ?? '').trim();
  return /^[\dXx -]+$/.test(s) && /-/.test(s) && digitsOf(s).length === 13 ? `ISBN ${s}` : `ISBN ${isbn13}`;
};

// Bars and texts in mm, origin top-left of the white field (quiet zones included).
export function barcodeBars(isbn13, { scale = 1, addon = null, label = null } = {}) {
  const X = 0.33 * scale, barH = 22.85 * scale, guardExtra = 1.65 * scale;
  const quietL = 11, quietR = addon ? 0 : 7;
  let bits = '101';
  const first = Number(isbn13[0]);
  for (let i = 1; i <= 6; i++) bits += (PARITY13[first][i - 1] === 'L' ? L : G)[Number(isbn13[i])];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[Number(isbn13[i])];
  bits += '101';
  const guards = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  const top = 4 * scale; // room for the "ISBN …" line above
  const bars = [];
  const push = (bitStr, startModule, isGuard, y0, h) => {
    let i = 0;
    while (i < bitStr.length) {
      if (bitStr[i] === '1') {
        let j = i;
        while (j < bitStr.length && bitStr[j] === '1') j++;
        const g = isGuard && isGuard(i);
        bars.push({ x: (startModule + i) * X, y: y0, w: (j - i) * X, h: h + (g ? guardExtra : 0) });
        i = j;
      } else i++;
    }
  };
  push(bits, quietL, (i) => guards.has(i), top, barH);
  const digitSize = 2.75 * scale; // mm cap height for the digits under the bars
  const texts = [{ text: isbn13[0], x: (quietL - 7) * X, y: top + barH + guardExtra + 0.2 * scale, size: digitSize, align: 'left' }];
  texts.push({ text: isbn13.slice(1, 7), x: (quietL + 3 + 21) * X, y: top + barH + guardExtra + 0.2 * scale, size: digitSize, align: 'center' });
  texts.push({ text: isbn13.slice(7), x: (quietL + 50 + 21) * X, y: top + barH + guardExtra + 0.2 * scale, size: digitSize, align: 'center' });
  let width = (quietL + 95 + quietR) * X;
  if (addon) {
    const gap = 9;
    const start = quietL + 95 + gap;
    const sum = (3 * (Number(addon[0]) + Number(addon[2]) + Number(addon[4])) + 9 * (Number(addon[1]) + Number(addon[3]))) % 10;
    let ab = '01011';
    for (let i = 0; i < 5; i++) {
      ab += (PARITY5[sum][i] === 'L' ? L : G)[Number(addon[i])];
      if (i < 4) ab += '01';
    }
    const addTop = top + 2.9 * scale; // add-on bars start lower, digits sit above them
    push(ab, start, null, addTop, barH + guardExtra - 2.9 * scale);
    texts.push({ text: addon, x: (start + ab.length / 2) * X, y: addTop - digitSize * 0.9 - 0.5 * scale, size: digitSize * 0.9, align: 'center' });
    width = (start + ab.length + 5) * X;
  }
  if (label) texts.push({ text: label, x: (quietL + 47.5) * X, y: 0.3 * scale, size: 2.3 * scale, align: 'center' });
  const height = top + barH + guardExtra + digitSize + 1.2 * scale;
  return { bars, texts, width, height, module: X };
}

// Where the barcode sits by default: back cover, bottom right, inside the safe area.
export function defaultBarcodeBox(cs, size, safety = 6) {
  const back = cs.back;
  return { x: back.x + back.w - safety - size.width, y: cs.visible.y + cs.visible.h - safety - size.height };
}

// KDP prints its own barcode into a 2 × 1.2 in white box unless you supply one.
export const KDP_BOX = { width: 50.8, height: 30.48 };
