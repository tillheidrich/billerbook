// Print profiles. Every value can be overridden per edition in the app.
// Contributions welcome: add a provider object with sources (data sheets) and verified: true
// only when the numbers come straight from the printer's own specification.
//
// Fields per binding:
//   bleed     – bleed on interior pages (mm)
//   safety    – safe distance from trim for text/important content (mm)
//   glue      – zone next to the spine on the first/last interior page that is glued to the cover (mm)
//   cover     – { wrap, overW, overH, hinge } see geometry.coverSpec
//   spinePerPage – rough mm per page for the spine estimate (printer value wins)
//   pageStep  – page count must be a multiple of this

export const PROVIDERS = [
  {
    id: 'wmd',
    name: 'WIRmachenDRUCK',
    verified: true,
    sources: [
      'https://wir-machen-druck.de/tpl/manns-partner/media/ddb/druckdatenskizzen/0/buecher_mit_hardcover_DIN_A4hoch_2.pdf',
      'https://wir-machen-druck.de/tpl/manns-partner/media/ddb/druckdatenskizzen/category/25547/0/buecher_mit_hardcover_freies_format_1-1_2.pdf',
      'https://www.wir-machen-druck.ch/tpl/manns-partner/media/ddb/druckdatenskizzen/category/15507/0/Bücher mit Softcover_DIN A4_1.pdf',
    ],
    bindings: {
      hardcover: { bleed: 3, safety: 5, glue: 7, cover: { wrap: 15, overW: 5, overH: 2.5, hinge: 7 }, spinePerPage: 0.065, pageStep: 2 },
      softcover: { bleed: 3, safety: 5, glue: 5, cover: { wrap: 3, overW: 0, overH: 0, hinge: 0 }, spinePerPage: 0.092, pageStep: 2 },
    },
    formats: [
      { id: 'hc-a4-quer', binding: 'hardcover', w: 297, h: 210, label: { de: 'Hardcover A4 quer', en: 'Hardcover A4 landscape' } },
      { id: 'hc-a4-hoch', binding: 'hardcover', w: 210, h: 297, label: { de: 'Hardcover A4 hoch', en: 'Hardcover A4 portrait' } },
      { id: 'hc-21x21', binding: 'hardcover', w: 210, h: 210, label: { de: 'Hardcover 21 × 21', en: 'Hardcover 21 × 21' } },
      { id: 'hc-17x24', binding: 'hardcover', w: 170, h: 240, label: { de: 'Hardcover 17 × 24', en: 'Hardcover 17 × 24' } },
      { id: 'hc-a5-hoch', binding: 'hardcover', w: 148, h: 210, label: { de: 'Hardcover A5 hoch', en: 'Hardcover A5 portrait' } },
      { id: 'hc-a5-quer', binding: 'hardcover', w: 210, h: 148, label: { de: 'Hardcover A5 quer', en: 'Hardcover A5 landscape' } },
      { id: 'hc-frei', binding: 'hardcover', w: 250, h: 250, custom: true, label: { de: 'Hardcover freies Format', en: 'Hardcover custom size' } },
      { id: 'sc-a4-hoch', binding: 'softcover', w: 210, h: 297, label: { de: 'Softcover A4 hoch', en: 'Softcover A4 portrait' } },
      { id: 'sc-a4-quer', binding: 'softcover', w: 297, h: 210, label: { de: 'Softcover A4 quer', en: 'Softcover A4 landscape' } },
      { id: 'sc-21x21', binding: 'softcover', w: 210, h: 210, label: { de: 'Softcover 21 × 21', en: 'Softcover 21 × 21' } },
      { id: 'sc-a5-hoch', binding: 'softcover', w: 148, h: 210, label: { de: 'Softcover A5 hoch', en: 'Softcover A5 portrait' } },
      { id: 'sc-125x190', binding: 'softcover', w: 125, h: 190, label: { de: 'Softcover 12,5 × 19', en: 'Softcover 12.5 × 19' } },
    ],
  },
  {
    id: 'custom',
    name: 'Custom / Eigene Druckerei',
    verified: false,
    sources: [],
    bindings: {
      hardcover: { bleed: 3, safety: 5, glue: 7, cover: { wrap: 15, overW: 5, overH: 2.5, hinge: 7 }, spinePerPage: 0.07, pageStep: 2 },
      softcover: { bleed: 3, safety: 5, glue: 5, cover: { wrap: 3, overW: 0, overH: 0, hinge: 0 }, spinePerPage: 0.09, pageStep: 2 },
      layflat: { bleed: 3, safety: 5, glue: 0, cover: { wrap: 15, overW: 3, overH: 3, hinge: 7 }, spinePerPage: 0.25, pageStep: 2 },
    },
    formats: [
      { id: 'custom', binding: 'hardcover', w: 300, h: 240, custom: true, label: { de: 'Freies Format', en: 'Custom size' } },
    ],
  },
];

export function findProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[PROVIDERS.length - 1];
}

// Build edition print settings from provider + format.
export function editionSpecFrom(providerId, formatId) {
  const p = findProvider(providerId);
  const f = p.formats.find((x) => x.id === formatId) || p.formats[0];
  const b = p.bindings[f.binding] || Object.values(p.bindings)[0];
  return {
    provider: p.id, format: f.id, binding: f.binding, w: f.w, h: f.h,
    bleed: b.bleed, safety: b.safety, glue: b.glue,
    cover: { ...b.cover }, spinePerPage: b.spinePerPage, pageStep: b.pageStep,
  };
}
