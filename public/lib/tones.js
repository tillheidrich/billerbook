// Black-and-white and toning per photo. The original file is never changed; the tone is applied
// when thumbnails, previews and print files are rendered.

export const TONES = [
  { id: 'bw', name: { en: 'Black & white', de: 'Schwarzweiß' }, tint: null },
  { id: 'warm', name: { en: 'Warm', de: 'Warm' }, tint: [150, 118, 84] },
  { id: 'sepia', name: { en: 'Sepia', de: 'Sepia' }, tint: [112, 66, 20] },
  { id: 'selenium', name: { en: 'Selenium', de: 'Selen' }, tint: [112, 84, 104] },
  { id: 'cool', name: { en: 'Cool', de: 'Kühl' }, tint: [70, 96, 130] },
];
export const findTone = (id) => TONES.find((t) => t.id === id);

// Tint colour for sharp's tint(): the tone colour mixed with neutral grey by strength (0–1).
export function tintColour(id, strength = 0.6) {
  const t = findTone(id);
  if (!t?.tint) return null;
  const s = Math.max(0, Math.min(1, Number(strength ?? 0.6)));
  const [r, g, b] = t.tint.map((v) => Math.round(128 + (v - 128) * s));
  return { r, g, b };
}
