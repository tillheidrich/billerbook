// Print profiles. Every value can be overridden per edition in the app, and whole profiles can be
// imported/exported as JSON (see docs/print-profiles.md).
//
// A profile only claims what its sources say. `status` per binding:
//   'verified' – every number below comes from the printer's own published specification
//   'partial'  – interior rules are published, the cover or spine comes from the printer's own
//                calculator or template. Import that template (Edition → Cover template) and
//                Billerbook reads the exact cover size from it.
//   'manual'   – starting values only; enter the printer's numbers
//
// Binding fields
//   bleed       interior bleed on every edge (mm)
//   safety      keep text and faces this far from the trim (mm)
//   glue        inner zone that disappears in the binding / is glued to the cover (mm)
//   interior    'single' (one PDF page per book page) or 'spreads' (one PDF page per double page)
//   blankEnds   true: first left and last right page stay empty (printer glues them to the cover)
//   pages       { min, max, step } page count rules for the interior
//   colour      'srgb' or 'cmyk' – what the printer wants
//   cover       { mode, wrap, overW, overH, joint, hinge }
//                 mode  'spread' back + spine + front on one PDF page, 'none' no cover file
//                 wrap  bleed or turn-in around the outside of the cover (mm)
//                 overW/overH board overhang beyond the book block (mm)
//                 joint extra width added on each side of the spine (mm)
//                 hinge zone next to the spine to keep clear (mm, drawn only)
//   spine       how the spine width follows from the page count (see spineFor below)
//                 { type: 'formula', perPage, base }    base + pages × perPage
//                 { type: 'table', rows: [[maxPages, mm], …] }
//                 { type: 'printer', perPage, url }      printer's calculator; perPage is a rough estimate
//   papers      optional [{ id, label, spine }] when the paper changes the spine
//   spineTextMin printer prints spine text from this page count on

const IN = 25.4;
const r1 = (v) => Math.round(v * 100) / 100;
const inch = (w, h) => ({ w: r1(w * IN), h: r1(h * IN) });

const lbl = (en, de = en) => ({ en, de });

export const PROVIDERS = [
  {
    id: 'wmd',
    name: 'WIRmachenDRUCK',
    region: 'DE · AT · CH',
    url: 'https://www.wir-machen-druck.de',
    units: 'mm',
    checked: '2026-11-21',
    sources: [
      'https://wir-machen-druck.de/tpl/manns-partner/media/ddb/druckdatenskizzen/0/buecher_mit_hardcover_DIN_A4hoch_2.pdf',
      'https://wir-machen-druck.de/tpl/manns-partner/media/ddb/druckdatenskizzen/category/25547/0/buecher_mit_hardcover_freies_format_1-1_2.pdf',
      'https://www.wir-machen-druck.ch/tpl/manns-partner/media/ddb/druckdatenskizzen/category/15507/0/Bücher mit Softcover_DIN A4_1.pdf',
    ],
    notes: lbl('The spine width (B) appears in the order configurator once you choose paper and page count. Billerbook estimates it until you enter that value.',
      'Die Rückenbreite (B) zeigt der Bestellkonfigurator, sobald Papier und Seitenzahl gewählt sind. Bis du sie einträgst, schätzt Billerbook.'),
    bindings: {
      hardcover: { status: 'verified', bleed: 3, safety: 5, glue: 7, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 15, overW: 5, overH: 2.5, joint: 0, hinge: 7 }, spine: { type: 'printer', perPage: 0.065 } },
      softcover: { status: 'verified', bleed: 3, safety: 5, glue: 5, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 3, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'printer', perPage: 0.092 } },
    },
    formats: [
      { id: 'hc-a4-quer', binding: 'hardcover', w: 297, h: 210, label: lbl('Hardcover A4 landscape', 'Hardcover A4 quer') },
      { id: 'hc-a4-hoch', binding: 'hardcover', w: 210, h: 297, label: lbl('Hardcover A4 portrait', 'Hardcover A4 hoch') },
      { id: 'hc-21x21', binding: 'hardcover', w: 210, h: 210, label: lbl('Hardcover 21 × 21') },
      { id: 'hc-17x24', binding: 'hardcover', w: 170, h: 240, label: lbl('Hardcover 17 × 24') },
      { id: 'hc-a5-hoch', binding: 'hardcover', w: 148, h: 210, label: lbl('Hardcover A5 portrait', 'Hardcover A5 hoch') },
      { id: 'hc-a5-quer', binding: 'hardcover', w: 210, h: 148, label: lbl('Hardcover A5 landscape', 'Hardcover A5 quer') },
      { id: 'hc-frei', binding: 'hardcover', w: 250, h: 250, custom: true, label: lbl('Hardcover custom size', 'Hardcover freies Format') },
      { id: 'sc-a4-hoch', binding: 'softcover', w: 210, h: 297, label: lbl('Softcover A4 portrait', 'Softcover A4 hoch') },
      { id: 'sc-a4-quer', binding: 'softcover', w: 297, h: 210, label: lbl('Softcover A4 landscape', 'Softcover A4 quer') },
      { id: 'sc-21x21', binding: 'softcover', w: 210, h: 210, label: lbl('Softcover 21 × 21') },
      { id: 'sc-a5-hoch', binding: 'softcover', w: 148, h: 210, label: lbl('Softcover A5 portrait', 'Softcover A5 hoch') },
      { id: 'sc-125x190', binding: 'softcover', w: 125, h: 190, label: lbl('Softcover 12.5 × 19', 'Softcover 12,5 × 19') },
    ],
  },
  {
    id: 'kdp',
    name: 'Amazon KDP',
    // KDP prints its own barcode on a 2 × 1.2 in area of the back cover unless the cover has one.
    barcode: 'placeholder',
    region: 'Worldwide',
    url: 'https://kdp.amazon.com',
    units: 'in',
    checked: '2026-11-21',
    sources: [
      'https://kdp.amazon.com/help/topic/G201953020',
      'https://kdp.amazon.com/help/topic/G201834560',
      'https://kdp.amazon.com/help/topic/GDTKFJPNQCBTMRV6',
      'https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6',
    ],
    notes: lbl('Paperback: KDP publishes the spine formula, so the cover size is exact. Spine text only from 79 pages. Hardcover: KDP publishes the 15 mm wrap and the 10 mm hinge, but the full cover size only through its cover calculator. Import the template KDP generates.',
      'Paperback: KDP veröffentlicht die Rückenformel, der Umschlag stimmt also genau. Rückentext erst ab 79 Seiten. Hardcover: KDP nennt 15 mm Einschlag und 10 mm Falz, die vollständigen Umschlagmaße aber nur im eigenen Rechner. Importiere die Vorlage, die KDP erzeugt.'),
    bindings: {
      softcover: { status: 'verified', bleed: r1(0.125 * IN), safety: r1(0.375 * IN), glue: r1(0.375 * IN), interior: 'single', blankEnds: false, pages: { min: 24, max: null, step: 2 }, colour: 'srgb', spineTextMin: 79,
        customLimits: { w: [r1(4 * IN), r1(8.5 * IN)], h: [r1(6 * IN), r1(11.69 * IN)] },
        cover: { mode: 'spread', wrap: r1(0.125 * IN), overW: 0, overH: 0, joint: 0, hinge: 0 },
        papers: [
          { id: 'white', label: lbl('White paper (B&W, standard colour)', 'Weißes Papier (S/W, Standardfarbe)'), spine: { type: 'formula', perPage: 0.002252 * IN, base: 0 } },
          { id: 'cream', label: lbl('Cream paper', 'Cremefarbenes Papier'), spine: { type: 'formula', perPage: 0.0025 * IN, base: 0 } },
          { id: 'premium-colour', label: lbl('Premium colour', 'Premium-Farbe'), spine: { type: 'formula', perPage: 0.002347 * IN, base: 0 } },
        ] },
      hardcover: { status: 'partial', bleed: r1(0.125 * IN), safety: r1(0.375 * IN), glue: r1(0.375 * IN), interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'srgb', spineTextMin: 79,
        cover: { mode: 'spread', wrap: 15, overW: 0, overH: 0, joint: 0, hinge: 10 },
        papers: [
          { id: 'white', label: lbl('White paper', 'Weißes Papier'), spine: { type: 'printer', perPage: 0.002252 * IN, url: 'https://kdp.amazon.com/cover-calculator' } },
          { id: 'premium-colour', label: lbl('Premium colour', 'Premium-Farbe'), spine: { type: 'printer', perPage: 0.002347 * IN, url: 'https://kdp.amazon.com/cover-calculator' } },
        ] },
    },
    formats: [
      // Official KDP tables (kdp.amazon.com/help/topic/GVBQ3CMEQW3W2VL6, 22.11.2026): 15 paperback sizes + A4, 5 hardcover sizes.
      ...[[5, 8], [5.06, 7.81], [5.25, 8], [5.5, 8.5], [6, 9], [6.14, 9.21], [6.69, 9.61], [7, 10], [7.44, 9.69], [7.5, 9.25], [8, 10], [8.25, 6], [8.25, 8.25], [8.5, 8.5], [8.5, 11]]
        .map(([w, h]) => ({ id: `kdp-sc-${String(w).replace('.', '')}x${String(h).replace('.', '')}`, binding: 'softcover', ...inch(w, h), label: lbl(`Paperback ${w} × ${h} in`) })),
      { id: 'kdp-sc-a4', binding: 'softcover', w: 210, h: 297, label: lbl('Paperback A4 (8.27 × 11.69 in)') },
      { id: 'kdp-sc-825x11', binding: 'softcover', ...inch(8.25, 11), label: lbl('Paperback 8.25 × 11 in') },
      ...[[5.5, 8.5], [6, 9], [6.14, 9.21], [7, 10], [8.25, 11]]
        .map(([w, h]) => ({ id: `kdp-hc-${String(w).replace('.', '')}x${String(h).replace('.', '')}`, binding: 'hardcover', ...inch(w, h), label: lbl(`Hardcover ${w} × ${h} in`) })),
    ],
  },
  {
    id: 'lulu',
    name: 'Lulu',
    region: 'Worldwide',
    url: 'https://www.lulu.com',
    units: 'in',
    checked: '2026-11-21',
    sources: [
      'https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf',
      'https://help.lulu.com/en/support/solutions/articles/64000308572-creating-your-hardcover-casewrap-cover',
    ],
    notes: lbl('Interior and spine width come from the Lulu Book Creation Guide (paperback formula, hardcover table). Lulu prints the casewrap 0.75 in larger than the trim; import Lulu’s cover template for the exact hardcover size.',
      'Innenteil und Rückenbreite stammen aus dem Lulu Book Creation Guide (Formel für Paperback, Tabelle für Hardcover). Den Casewrap druckt Lulu 0,75 Zoll größer als das Endformat; für das genaue Hardcover-Maß die Lulu-Vorlage importieren.'),
    bindings: {
      softcover: { status: 'verified', bleed: 3.175, safety: 12.7, glue: 3.2, interior: 'single', blankEnds: false, pages: { min: 32, max: 800, step: 2 }, colour: 'srgb', spineTextMin: 81,
        cover: { mode: 'spread', wrap: 3.175, overW: 0, overH: 0, joint: 0, hinge: 0 },
        spine: { type: 'formula', perPage: IN / 444, base: 0.06 * IN } },
      hardcover: { status: 'partial', bleed: 3.175, safety: 12.7, glue: 3.2, interior: 'single', blankEnds: false, pages: { min: 24, max: 800, step: 2 }, colour: 'srgb', spineTextMin: 81,
        cover: { mode: 'spread', wrap: 19.05, overW: 0, overH: 0, joint: 0, hinge: 6.35 },
        spine: { type: 'table', rows: [[84, 0.25], [140, 0.5], [168, 0.625], [194, 0.688], [222, 0.75], [250, 0.813], [278, 0.875], [306, 0.938], [334, 1], [360, 1.063], [388, 1.125], [416, 1.188], [444, 1.25], [472, 1.313], [500, 1.375], [528, 1.438], [556, 1.5], [582, 1.563], [610, 1.625], [638, 1.688], [666, 1.75], [694, 1.813], [722, 1.875], [750, 1.938], [778, 2], [799, 2.063], [800, 2.125]].map(([p, i]) => [p, r1(i * IN)]) } },
    },
    formats: [
      { id: 'lulu-sq-85', binding: 'hardcover', ...inch(8.5, 8.5), label: lbl('Hardcover square 8.5 × 8.5 in') },
      { id: 'lulu-letter-p', binding: 'hardcover', ...inch(8.5, 11), label: lbl('Hardcover US Letter portrait') },
      { id: 'lulu-letter-l', binding: 'hardcover', ...inch(11, 8.5), label: lbl('Hardcover US Letter landscape') },
      { id: 'lulu-a4-p', binding: 'hardcover', w: 210, h: 297, label: lbl('Hardcover A4 portrait', 'Hardcover A4 hoch') },
      { id: 'lulu-a4-l', binding: 'hardcover', w: 297, h: 210, label: lbl('Hardcover A4 landscape', 'Hardcover A4 quer') },
      { id: 'lulu-sc-sq-85', binding: 'softcover', ...inch(8.5, 8.5), label: lbl('Paperback square 8.5 × 8.5 in') },
      { id: 'lulu-sc-letter-p', binding: 'softcover', ...inch(8.5, 11), label: lbl('Paperback US Letter portrait') },
      { id: 'lulu-sc-letter-l', binding: 'softcover', ...inch(11, 8.5), label: lbl('Paperback US Letter landscape') },
      { id: 'lulu-sc-a4-p', binding: 'softcover', w: 210, h: 297, label: lbl('Paperback A4 portrait', 'Paperback A4 hoch') },
    ],
  },
  {
    id: 'blurb',
    name: 'Blurb (PDF to Book)',
    region: 'Worldwide',
    url: 'https://www.blurb.com/pdf-to-book',
    units: 'in',
    checked: '2026-11-21',
    sources: [
      'https://www.blurb.com/book-dimensions',
      'https://support.blurb.com/hc/en-us/articles/207792946-PDF-to-Book-specifications-and-checklist',
      'https://www.blurb.co.uk/make/pdf_to_book/booksize_calculator',
      'https://www.magcloud.com/formats/details/selected',
    ],
    notes: lbl('Single pages, even page count, at least 1/8 in bleed and 1/4 in safe area. Blurb asks for the exact sizes from its specification calculator (they depend on paper and page count). Import Blurb’s cover template so the ImageWrap size is exact.',
      'Einzelseiten, gerade Seitenzahl, mindestens 1/8 Zoll Beschnitt und 1/4 Zoll Sicherheitsabstand. Die genauen Maße nennt Blurb im Spezifikationsrechner (abhängig von Papier und Seitenzahl). Importiere Blurbs Umschlagvorlage, dann stimmt das ImageWrap-Maß genau.'),
    bindings: {
      hardcover: { status: 'partial', bleed: 3.175, safety: 6.35, glue: 6.35, interior: 'single', blankEnds: false, pages: { min: 20, max: 440, step: 2 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 19, overW: 3.2, overH: 3.2, joint: 0, hinge: 10 },
        papers: [
          { id: 'standard', label: lbl('Standard paper (up to 440 pages)', 'Standardpapier (bis 440 Seiten)'), spine: { type: 'printer', perPage: 0.07, url: 'https://www.blurb.com/make/pdf_to_book/booksize_calculator' } },
          { id: 'premium', maxPages: 240, label: lbl('Premium lustre/matte (up to 240 pages)', 'Premium Lustre/Matt (bis 240 Seiten)'), spine: { type: 'printer', perPage: 0.09, url: 'https://www.blurb.com/make/pdf_to_book/booksize_calculator' } },
          { id: 'layflat', maxPages: 110, label: lbl('Layflat (up to 110 pages)', 'Layflat (bis 110 Seiten)'), spine: { type: 'printer', perPage: 0.25, url: 'https://www.blurb.com/make/pdf_to_book/booksize_calculator' } },
        ] },
      softcover: { status: 'partial', bleed: 3.175, safety: 6.35, glue: 6.35, interior: 'single', blankEnds: false, pages: { min: 20, max: 440, step: 2 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 3.175, overW: 0, overH: 0, joint: 0, hinge: 0 },
        spine: { type: 'printer', perPage: 0.07, url: 'https://www.blurb.com/make/pdf_to_book/booksize_calculator' } },
      // Blurb magazines (formerly MagCloud): trim 8.25 × 10.75 in, PDF 8.5 × 11 in. Blurb's bleed is
      // 0.125 in top/bottom and 0.25 in outside, none at the fold; Billerbook uses 0.125 in all round.
      saddle: { status: 'partial', bleed: 3.175, safety: 6.35, glue: 0, interior: 'single', blankEnds: false, pages: { min: 8, max: 100, step: 4 }, colour: 'srgb',
        cover: { mode: 'none', wrap: 0, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'formula', perPage: 0, base: 0 } },
    },
    formats: [
      { id: 'blurb-7x7', binding: 'hardcover', ...inch(6.75, 6.63), label: lbl('Small Square 7 × 7 in, hardcover (trimmed 6.75 × 6.63)') },
      { id: 'blurb-8x10', binding: 'hardcover', ...inch(8, 10), label: lbl('Standard Portrait 8 × 10 in, hardcover') },
      { id: 'blurb-10x8', binding: 'hardcover', ...inch(9.5, 8), label: lbl('Standard Landscape 10 × 8 in, hardcover (trimmed 9.5 × 8)') },
      { id: 'blurb-13x11', binding: 'hardcover', ...inch(12.5, 10.63), label: lbl('Large Landscape 13 × 11 in, hardcover (trimmed 12.5 × 10.63)') },
      { id: 'blurb-12x12', binding: 'hardcover', ...inch(11.75, 11.75), label: lbl('Large Square 12 × 12 in, hardcover (trimmed 11.75)') },
      { id: 'blurb-sc-7x7', binding: 'softcover', ...inch(6.75, 6.63), label: lbl('Small Square 7 × 7 in, softcover') },
      { id: 'blurb-sc-8x10', binding: 'softcover', ...inch(8, 10), label: lbl('Standard Portrait 8 × 10 in, softcover') },
      { id: 'blurb-sc-10x8', binding: 'softcover', ...inch(9.5, 8), label: lbl('Standard Landscape 10 × 8 in, softcover') },
      { id: 'blurb-trade-5x8', binding: 'softcover', ...inch(5, 8), label: lbl('Trade book 5 × 8 in, softcover') },
      { id: 'blurb-trade-6x9', binding: 'softcover', ...inch(6, 9), label: lbl('Trade book 6 × 9 in, softcover') },
      { id: 'blurb-trade-hc-6x9', binding: 'hardcover', ...inch(6, 9), label: lbl('Trade book 6 × 9 in, hardcover') },
      { id: 'blurb-mag', binding: 'saddle', ...inch(8.25, 10.75), label: lbl('Magazine 8.25 × 10.75 in (PDF 8.5 × 11), saddle stitched', 'Magazin 8,25 × 10,75 Zoll (PDF 8,5 × 11), Rückendrahtheftung') },
    ],
  },
  {
    id: 'ingramspark',
    name: 'IngramSpark',
    // Distribution through IngramSpark needs an EAN-13 barcode of the ISBN on the back cover.
    barcode: 'required',
    region: 'Worldwide',
    url: 'https://www.ingramspark.com',
    units: 'in',
    checked: '2026-11-21',
    sources: [
      'https://help.ingramspark.com/hc/en-us/articles/35304333693837-Case-Laminate-and-Digital-Cloth-Hard-Cover',
      'https://marketing.ingramcontent.com/mrkng/documents/publishers/Cover-Bleed-Dimensions.pdf',
      'https://marketing.ingramcontent.com/mrkng/documents/publishers/trim-sizes.pdf',
    ],
    notes: lbl('IngramSpark publishes no per-page spine figure; the spine comes with the cover template from its title setup. Case laminate: 0.625 in wrap on every edge and 0.5 in hinge on each side of the spine.',
      'IngramSpark nennt keine Rückenstärke pro Seite; der Rücken kommt mit der Umschlagvorlage aus der Titelanlage. Case Laminate: 0,625 Zoll Einschlag an jeder Kante und 0,5 Zoll Falz auf jeder Seite des Rückens.'),
    bindings: {
      softcover: { status: 'partial', bleed: 3.175, safety: 6.35, glue: 9.5, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 3.175, overW: 0, overH: 0, joint: 0, hinge: 0 },
        spine: { type: 'printer', perPage: 0.0572, url: 'https://myaccount.ingramspark.com/Portal/Tools/CoverTemplateGenerator' } },
      hardcover: { status: 'partial', bleed: 3.175, safety: 6.35, glue: 9.5, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 15.875, overW: 0, overH: 0, joint: 12.7, hinge: 12.7 },
        spine: { type: 'printer', perPage: 0.0572, url: 'https://myaccount.ingramspark.com/Portal/Tools/CoverTemplateGenerator' } },
    },
    formats: [
      // Trim matrix: marketing.ingramcontent.com/mrkng/documents/publishers/trim-sizes.pdf
      ...[[5, 8], [5.06, 7.81], [5.25, 8], [5.5, 8.5], [6, 9], [6.14, 9.21], [6.69, 9.61], [7, 10], [7.44, 9.69], [7.5, 9.25], [8, 8], [8, 10], [8.25, 11], [8.5, 9], [8.5, 8.5], [11, 8.5]]
        .map(([w, h]) => ({ id: `is-sc-${String(w).replace('.', '')}x${String(h).replace('.', '')}`, binding: 'softcover', ...inch(w, h), label: lbl(`Paperback ${w} × ${h} in`) })),
      { id: 'is-sc-a5', binding: 'softcover', w: 148, h: 210, label: lbl('Paperback A5') },
      ...[[5.5, 8.5], [6, 9], [6.14, 9.21], [7, 10], [8, 10], [8.25, 11]]
        .map(([w, h]) => ({ id: `is-hc-${String(w).replace('.', '')}x${String(h).replace('.', '')}`, binding: 'hardcover', ...inch(w, h), label: lbl(`Case laminate ${w} × ${h} in`) })),
      { id: 'is-85x85', binding: 'hardcover', ...inch(8.5, 8.5), label: lbl('Case laminate 8.5 × 8.5 in') },
      { id: 'is-85x11', binding: 'hardcover', ...inch(8.5, 11), label: lbl('Case laminate 8.5 × 11 in') },
      { id: 'is-a4', binding: 'hardcover', w: 210, h: 297, label: lbl('Case laminate A4') },
      { id: 'is-sc-85x11', binding: 'softcover', ...inch(8.5, 11), label: lbl('Paperback 8.5 × 11 in') },
      { id: 'is-sc-a4', binding: 'softcover', w: 210, h: 297, label: lbl('Paperback A4') },
    ],
  },
  {
    id: 'mixam',
    name: 'Mixam',
    region: 'UK · US · DE · AU · CA',
    url: 'https://mixam.com',
    units: 'mm',
    checked: '2026-11-21',
    sources: ['https://mixam.co.uk/support/hardcoversetup', 'https://mixam.co.uk/support/filesetup'],
    notes: lbl('Mixam shows the spine width in the cart and the order’s Artwork tab. Hardcover cover: 5 mm hinge on each side of the spine and 20 mm bleed on every edge.',
      'Mixam zeigt die Rückenbreite im Warenkorb und im Artwork-Tab der Bestellung. Hardcover-Umschlag: 5 mm Falz auf jeder Seite des Rückens und 20 mm Beschnitt an jeder Kante.'),
    bindings: {
      hardcover: { status: 'partial', bleed: 3, safety: 5, glue: 8, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 20, overW: 0, overH: 0, joint: 5, hinge: 5 }, spine: { type: 'printer', perPage: 0.07, url: 'https://mixam.com/hardcoverbooks' } },
      softcover: { status: 'partial', bleed: 3, safety: 5, glue: 5, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 3, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'printer', perPage: 0.07, url: 'https://mixam.com' } },
      saddle: { status: 'partial', bleed: 3, safety: 5, glue: 0, interior: 'single', blankEnds: false, pages: { min: 8, max: 64, step: 4 }, colour: 'cmyk',
        cover: { mode: 'none', wrap: 0, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'formula', perPage: 0, base: 0 } },
    },
    formats: [
      { id: 'mixam-hc-a4-p', binding: 'hardcover', w: 210, h: 297, label: lbl('Hardcover A4 portrait', 'Hardcover A4 hoch') },
      { id: 'mixam-hc-a4-l', binding: 'hardcover', w: 297, h: 210, label: lbl('Hardcover A4 landscape', 'Hardcover A4 quer') },
      { id: 'mixam-hc-210', binding: 'hardcover', w: 210, h: 210, label: lbl('Hardcover 210 × 210 mm') },
      { id: 'mixam-hc-a5', binding: 'hardcover', w: 148, h: 210, label: lbl('Hardcover A5 portrait', 'Hardcover A5 hoch') },
      { id: 'mixam-hc-8x8', binding: 'hardcover', ...inch(8, 8), label: lbl('Hardcover 8 × 8 in') },
      { id: 'mixam-hc-85x11', binding: 'hardcover', ...inch(8.5, 11), label: lbl('Hardcover 8.5 × 11 in') },
      { id: 'mixam-sc-a4-p', binding: 'softcover', w: 210, h: 297, label: lbl('Softcover A4 portrait', 'Softcover A4 hoch') },
      { id: 'mixam-sc-210', binding: 'softcover', w: 210, h: 210, label: lbl('Softcover 210 × 210 mm') },
      { id: 'mixam-mag-a4', binding: 'saddle', w: 210, h: 297, label: lbl('Magazine A4, saddle stitched', 'Magazin A4, Rückendrahtheftung') },
      { id: 'mixam-mag-a5', binding: 'saddle', w: 148, h: 210, label: lbl('Magazine A5, saddle stitched', 'Magazin A5, Rückendrahtheftung') },
      { id: 'mixam-mag-letter', binding: 'saddle', ...inch(8.5, 11), label: lbl('Magazine US Letter, saddle stitched', 'Magazin US Letter, Rückendrahtheftung') },
      { id: 'mixam-mag-210', binding: 'saddle', w: 210, h: 210, label: lbl('Magazine 210 × 210 mm, saddle stitched', 'Magazin 210 × 210 mm, Rückendrahtheftung') },
    ],
  },
  {
    id: 'saal',
    name: 'Saal Digital (Professional Line)',
    region: 'EU · UK · US',
    url: 'https://www.saal-digital.com',
    units: 'mm',
    checked: '2026-11-21',
    sources: ['https://saal-digital.com/service/professional-zone/create-your-files-in-indesign'],
    notes: lbl('Saal wants every double page as one PDF page, sRGB, no crop marks, and the first page of the first spread and last page of the last spread left empty. Bleed, cover and spine come from the InDesign templates in Saal’s Professional Zone: import the cover template.',
      'Saal will jede Doppelseite als eine PDF-Seite, sRGB, ohne Schnittmarken, und die erste Seite der ersten sowie die letzte Seite der letzten Doppelseite leer. Beschnitt, Umschlag und Rücken stehen in den InDesign-Vorlagen der Professional Zone: Umschlagvorlage importieren.'),
    bindings: {
      layflat: { status: 'partial', bleed: 3, safety: 10, glue: 0, interior: 'spreads', blankEnds: true, pages: { min: null, max: null, step: 2 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 15, overW: 3, overH: 3, joint: 0, hinge: 8 }, spine: { type: 'printer', perPage: 0.45, url: 'https://www.saal-digital.com/photo-book/professional-zone' } },
    },
    formats: [
      { id: 'saal-21x21', binding: 'layflat', w: 210, h: 210, label: lbl('Professional Line 21 × 21 cm') },
      { id: 'saal-30x21', binding: 'layflat', w: 300, h: 210, label: lbl('Professional Line 30 × 21 cm landscape', 'Professional Line 30 × 21 cm quer') },
      { id: 'saal-22x30', binding: 'layflat', w: 220, h: 300, label: lbl('Professional Line 22 × 30 cm portrait', 'Professional Line 22 × 30 cm hoch') },
      { id: 'saal-30x30', binding: 'layflat', w: 300, h: 300, label: lbl('Professional Line 30 × 30 cm') },
      { id: 'saal-40x30', binding: 'layflat', w: 400, h: 300, label: lbl('Professional Line 40 × 30 cm') },
    ],
  },
  {
    id: 'prestophoto',
    name: 'PrestoPhoto',
    region: 'US · Worldwide',
    url: 'https://prestophoto.com',
    units: 'in',
    checked: '2026-11-21',
    sources: ['https://prestophoto.com/help/PDF+Specs'],
    notes: lbl('Pages are set up 0.25 in larger than the book (1/8 in bleed per edge), sRGB, no crop marks. Hardcovers trim up to 1/4 in, so keep content 3/4 in from the edge. The spine width comes from PrestoPhoto’s cover calculator.',
      'Seiten 0,25 Zoll größer als das Buch anlegen (1/8 Zoll Beschnitt je Kante), sRGB, ohne Schnittmarken. Hardcover werden bis zu 1/4 Zoll beschnitten, wichtige Inhalte also 3/4 Zoll vom Rand. Die Rückenbreite nennt PrestoPhotos Umschlagrechner.'),
    bindings: {
      hardcover: { status: 'partial', bleed: 3.175, safety: 19, glue: 10, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 15, overW: 3, overH: 3, joint: 0, hinge: 10 }, spine: { type: 'printer', perPage: 0.08, url: 'https://prestophoto.com/help/Book+Cover+Specifications' } },
      softcover: { status: 'partial', bleed: 3.175, safety: 19, glue: 6, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 3.175, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'printer', perPage: 0.08, url: 'https://prestophoto.com/help/Book+Cover+Specifications' } },
    },
    formats: [
      { id: 'presto-8x8', binding: 'hardcover', ...inch(8, 8), label: lbl('Hardcover 8 × 8 in') },
      { id: 'presto-11x85', binding: 'hardcover', ...inch(11, 8.5), label: lbl('Hardcover 11 × 8.5 in') },
      { id: 'presto-12x12', binding: 'hardcover', ...inch(12, 12), label: lbl('Hardcover 12 × 12 in') },
      { id: 'presto-sc-8x8', binding: 'softcover', ...inch(8, 8), label: lbl('Softcover 8 × 8 in') },
    ],
  },
  {
    id: 'cewe',
    name: 'CEWE (PDF to Book)',
    region: 'DE · AT · CH · UK · NL · Europe',
    url: 'https://www.cewe.co.uk/pdf2book.html',
    units: 'mm',
    checked: '2026-11-22',
    sources: ['https://www.cewe.co.uk/pdf-to-book-user-guide.html', 'https://cdn.cewe.co.uk/downloads/user-guide.pdf', 'https://www.cewe.co.uk/photo-books.html'],
    notes: lbl('CEWE prints a PDF interior and a PDF cover in sRGB. The exact page and cover sizes (with bleed) come from CEWE’s free Template Generator: create the template for your format, paper and page count and import its cover PDF here. Content starts at 26 pages.',
      'CEWE druckt Innenteil und Umschlag als PDF in sRGB. Die genauen Seiten- und Umschlagmaße (mit Beschnitt) liefert CEWEs kostenloser Template Generator: Vorlage für Format, Papier und Seitenzahl erzeugen und die Umschlag-PDF hier importieren. Innenteil ab 26 Seiten.'),
    bindings: {
      hardcover: { status: 'partial', bleed: 3, safety: 10, glue: 10, interior: 'single', blankEnds: false, pages: { min: 26, max: 202, step: 2 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 15, overW: 3, overH: 3, joint: 0, hinge: 8 }, spine: { type: 'printer', perPage: 0.2, url: 'https://www.cewe.co.uk/pdf2book.html' } },
      softcover: { status: 'partial', bleed: 3, safety: 10, glue: 6, interior: 'single', blankEnds: false, pages: { min: 26, max: 202, step: 2 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 3, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'printer', perPage: 0.15, url: 'https://www.cewe.co.uk/pdf2book.html' } },
    },
    formats: [
      { id: 'cewe-15x15', binding: 'hardcover', w: 150, h: 150, label: lbl('Compact Square 15 × 15 cm', 'Kompakt quadratisch 15 × 15 cm') },
      { id: 'cewe-19x15', binding: 'hardcover', w: 190, h: 150, label: lbl('Compact Panorama 19 × 15 cm', 'Kompakt Panorama 19 × 15 cm') },
      { id: 'cewe-21x21', binding: 'hardcover', w: 210, h: 210, label: lbl('Square 21 × 21 cm', 'Quadratisch 21 × 21 cm') },
      { id: 'cewe-21x28', binding: 'hardcover', w: 210, h: 280, label: lbl('Large Portrait 21 × 28 cm', 'Groß 21 × 28 cm') },
      { id: 'cewe-28x21', binding: 'hardcover', w: 280, h: 210, label: lbl('Large Landscape 28 × 21 cm', 'Groß Panorama 28 × 21 cm') },
      { id: 'cewe-30x30', binding: 'hardcover', w: 300, h: 300, label: lbl('XL Square 30 × 30 cm', 'XL 30 × 30 cm') },
      { id: 'cewe-28x36', binding: 'hardcover', w: 280, h: 360, label: lbl('XXL Portrait 28 × 36 cm', 'XXL 28 × 36 cm') },
      { id: 'cewe-38x29', binding: 'hardcover', w: 380, h: 290, label: lbl('XXL Landscape 38 × 29 cm', 'XXL Panorama 38 × 29 cm') },
      { id: 'cewe-sc-21x28', binding: 'softcover', w: 210, h: 280, label: lbl('Large Portrait 21 × 28 cm, softcover', 'Groß 21 × 28 cm, Softcover') },
      { id: 'cewe-sc-21x21', binding: 'softcover', w: 210, h: 210, label: lbl('Square 21 × 21 cm, softcover', 'Quadratisch 21 × 21 cm, Softcover') },
    ],
  },
  {
    id: 'whitewall',
    name: 'WhiteWall (Coffee Table Book)',
    region: 'EU · UK · US',
    url: 'https://www.whitewall.com/eu/coffee-table-book/pdf-upload',
    units: 'mm',
    checked: '2026-11-22',
    sources: ['https://whitewall.com/eu/coffee-table-book', 'https://www.whitewall.com/eu/coffee-table-book/pdf-upload', 'https://service.whitewall.com/hc/en-us/articles/4411222658321-05-PDF-file-requirements-and-export-instructions'],
    notes: lbl('Single pages, sRGB, 28 to 200 pages in steps of four, cover and content as separate PDFs. WhiteWall shows the exact sizes with bleed after you choose format, paper, cover and page count, and generates InDesign templates: import the cover template. Keep 2 mm from the spine centre; the cover fold reaches 10–12 mm onto front and back.',
      'Einzelseiten, sRGB, 28 bis 200 Seiten in Viererschritten, Umschlag und Inhalt als getrennte PDFs. Die genauen Maße mit Beschnitt zeigt WhiteWall nach Wahl von Format, Papier, Umschlag und Seitenzahl und erzeugt InDesign-Vorlagen: Umschlagvorlage importieren. 2 mm Abstand zur Rückenmitte; der Umschlagfalz reicht 10–12 mm auf Vorder- und Rückseite.'),
    bindings: {
      hardcover: { status: 'partial', bleed: 3, safety: 10, glue: 10, interior: 'single', blankEnds: false, pages: { min: 28, max: 200, step: 4 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 15, overW: 3, overH: 3, joint: 0, hinge: 12 }, spine: { type: 'printer', perPage: 0.2, url: 'https://www.whitewall.com/eu/coffee-table-book/pdf-upload' } },
    },
    formats: [
      { id: 'ww-story', binding: 'hardcover', w: 205, h: 205, label: lbl('Story Square 20.5 × 20.5 cm', 'Story Square 20,5 × 20,5 cm') },
      { id: 'ww-exh-p', binding: 'hardcover', w: 205, h: 270, label: lbl('Exhibition A4 portrait 20.5 × 27 cm', 'Exhibition A4 hoch 20,5 × 27 cm') },
      { id: 'ww-exh-l', binding: 'hardcover', w: 270, h: 205, label: lbl('Exhibition A4 landscape 27 × 20.5 cm', 'Exhibition A4 quer 27 × 20,5 cm') },
      { id: 'ww-gallery', binding: 'hardcover', w: 290, h: 290, label: lbl('Gallery Square 29 × 29 cm') },
      { id: 'ww-port-p', binding: 'hardcover', w: 270, h: 356, label: lbl('Portfolio A3 portrait 27 × 35.6 cm', 'Portfolio A3 hoch 27 × 35,6 cm') },
      { id: 'ww-port-l', binding: 'hardcover', w: 382, h: 290, label: lbl('Portfolio A3 landscape 38.2 × 29 cm', 'Portfolio A3 quer 38,2 × 29 cm') },
    ],
  },
  {
    id: 'standard',
    name: 'Standard formats (any print shop)',
    region: 'Any',
    url: '',
    units: 'mm',
    checked: '2026-11-22',
    sources: ['https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6', 'https://marketing.ingramcontent.com/mrkng/documents/publishers/trim-sizes.pdf'],
    notes: lbl('Common photo book, book and magazine sizes with typical starting values (3 mm bleed, CMYK). Check bleed, spine and page rules against your print shop’s data sheet, or give the sheet to your assistant: read_print_spec and apply_print_spec set everything from it.',
      'Gängige Fotobuch-, Buch- und Magazinformate mit typischen Startwerten (3 mm Beschnitt, CMYK). Beschnitt, Rücken und Seitenregeln mit dem Datenblatt der Druckerei abgleichen, oder das Datenblatt dem Assistenten geben: read_print_spec und apply_print_spec übernehmen alles daraus.'),
    bindings: {
      hardcover: { status: 'manual', bleed: 3, safety: 5, glue: 7, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 15, overW: 3, overH: 3, joint: 0, hinge: 7 }, spine: { type: 'printer', perPage: 0.07 } },
      softcover: { status: 'manual', bleed: 3, safety: 5, glue: 5, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 3, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'printer', perPage: 0.08 } },
      layflat: { status: 'manual', bleed: 3, safety: 8, glue: 0, interior: 'spreads', blankEnds: true, pages: { min: null, max: null, step: 2 }, colour: 'srgb',
        cover: { mode: 'spread', wrap: 15, overW: 3, overH: 3, joint: 0, hinge: 8 }, spine: { type: 'printer', perPage: 0.4 } },
      saddle: { status: 'manual', bleed: 3, safety: 5, glue: 0, interior: 'single', blankEnds: false, pages: { min: 8, max: 64, step: 4 }, colour: 'cmyk',
        cover: { mode: 'none', wrap: 0, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'formula', perPage: 0, base: 0 } },
    },
    formats: [
      // Photo books
      ...[[150, 150], [200, 200], [210, 210], [300, 300], [210, 280], [280, 210], [210, 297], [297, 210], [240, 300], [300, 240], [280, 360], [380, 290], [400, 300]]
        .map(([w, h]) => ({ id: `std-photo-${w}x${h}`, binding: 'hardcover', w, h, label: lbl(`Photo book ${w / 10} × ${h / 10} cm`, `Fotobuch ${String(w / 10).replace('.', ',')} × ${String(h / 10).replace('.', ',')} cm`) })),
      ...[[300, 300], [300, 210], [210, 210], [400, 300]]
        .map(([w, h]) => ({ id: `std-lf-${w}x${h}`, binding: 'layflat', w, h, label: lbl(`Layflat ${w / 10} × ${h / 10} cm`) })),
      // Books: German trade sizes and ISO
      ...[[120, 190, '12 × 19 cm'], [125, 190, '12.5 × 19 cm'], [135, 215, '13.5 × 21.5 cm'], [148, 210, 'A5'], [155, 230, '15.5 × 23 cm'], [170, 220, '17 × 22 cm'], [170, 240, '17 × 24 cm'], [176, 250, 'B5'], [210, 280, '21 × 28 cm'], [210, 297, 'A4']]
        .flatMap(([w, h, n]) => ['softcover', 'hardcover'].map((b) => ({ id: `std-book-${b[0]}-${w}x${h}`, binding: b, w, h, label: lbl(`Book ${n}, ${b}`, `Buch ${n.replace('.', ',')}, ${b === 'softcover' ? 'Softcover' : 'Hardcover'}`) }))),
      // Books: US trade sizes
      ...[[5, 8], [5.25, 8], [5.5, 8.5], [6, 9], [7, 10], [8, 10], [8.5, 11]]
        .flatMap(([w, h]) => ['softcover', 'hardcover'].map((b) => ({ id: `std-us-${b[0]}-${String(w).replace('.', '')}x${h}`, binding: b, ...inch(w, h), label: lbl(`Book ${w} × ${h} in, ${b}`, `Buch ${String(w).replace('.', ',')} × ${h} Zoll, ${b === 'softcover' ? 'Softcover' : 'Hardcover'}`) }))),
      // Magazines
      { id: 'std-mag-a4', binding: 'saddle', w: 210, h: 297, label: lbl('Magazine A4', 'Magazin A4') },
      { id: 'std-mag-a5', binding: 'saddle', w: 148, h: 210, label: lbl('Magazine A5', 'Magazin A5') },
      { id: 'std-mag-230x300', binding: 'saddle', w: 230, h: 300, label: lbl('Magazine 23 × 30 cm', 'Magazin 23 × 30 cm') },
      { id: 'std-mag-210x280', binding: 'saddle', w: 210, h: 280, label: lbl('Magazine 21 × 28 cm', 'Magazin 21 × 28 cm') },
      { id: 'std-mag-210', binding: 'saddle', w: 210, h: 210, label: lbl('Magazine 21 × 21 cm', 'Magazin 21 × 21 cm') },
      { id: 'std-mag-letter', binding: 'saddle', ...inch(8.5, 11), label: lbl('Magazine US Letter', 'Magazin US Letter') },
      { id: 'std-mag-digest', binding: 'saddle', ...inch(5.5, 8.5), label: lbl('Digest 5.5 × 8.5 in', 'Digest 5,5 × 8,5 Zoll') },
      { id: 'std-zine-a6', binding: 'saddle', w: 105, h: 148, label: lbl('Zine A6') },
      { id: 'std-mag-pb-a4', binding: 'softcover', w: 210, h: 297, label: lbl('Magazine A4, perfect bound', 'Magazin A4, Klebebindung') },
      { id: 'std-mag-pb-230x300', binding: 'softcover', w: 230, h: 300, label: lbl('Magazine 23 × 30 cm, perfect bound', 'Magazin 23 × 30 cm, Klebebindung') },
    ],
  },
  {
    id: 'custom',
    name: 'Custom / Eigene Druckerei',
    region: 'Any',
    url: '',
    units: 'mm',
    sources: [],
    notes: lbl('Enter your print shop’s values, or import its cover template so Billerbook reads the cover size from it. Export the result as a profile to reuse or share it.',
      'Trag die Werte deiner Druckerei ein oder importiere ihre Umschlagvorlage, dann liest Billerbook das Umschlagmaß daraus. Exportiere das Ergebnis als Profil, um es wiederzuverwenden oder zu teilen.'),
    bindings: {
      hardcover: { status: 'manual', bleed: 3, safety: 5, glue: 7, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 15, overW: 5, overH: 2.5, joint: 0, hinge: 7 }, spine: { type: 'printer', perPage: 0.07 } },
      softcover: { status: 'manual', bleed: 3, safety: 5, glue: 5, interior: 'single', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 3, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'printer', perPage: 0.09 } },
      layflat: { status: 'manual', bleed: 3, safety: 5, glue: 0, interior: 'spreads', blankEnds: false, pages: { min: null, max: null, step: 2 }, colour: 'cmyk',
        cover: { mode: 'spread', wrap: 15, overW: 3, overH: 3, joint: 0, hinge: 7 }, spine: { type: 'printer', perPage: 0.25 } },
      saddle: { status: 'manual', bleed: 3, safety: 5, glue: 0, interior: 'single', blankEnds: false, pages: { min: 8, max: 64, step: 4 }, colour: 'cmyk',
        cover: { mode: 'none', wrap: 0, overW: 0, overH: 0, joint: 0, hinge: 0 }, spine: { type: 'formula', perPage: 0, base: 0 } },
    },
    formats: [
      { id: 'custom', binding: 'hardcover', w: 300, h: 240, custom: true, label: lbl('Custom size', 'Freies Format') },
      { id: 'custom-sc', binding: 'softcover', w: 210, h: 297, custom: true, label: lbl('Custom size, softcover', 'Freies Format, Softcover') },
      { id: 'custom-lf', binding: 'layflat', w: 300, h: 300, custom: true, label: lbl('Custom size, layflat', 'Freies Format, Layflat') },
      { id: 'custom-mag', binding: 'saddle', w: 210, h: 297, custom: true, label: lbl('Custom size, magazine (saddle stitched)', 'Freies Format, Magazin (Rückendrahtheftung)') },
    ],
  },
];

// Every print shop and binding gets a special size ("Sonderformat") with free width and height,
// starting from that binding's first format. customLimits (mm) are checked in preflight.
const binLabel = { hardcover: ['hardcover', 'Hardcover'], softcover: ['softcover', 'Softcover'], layflat: ['layflat', 'Layflat'], saddle: ['saddle stitched', 'Rückendrahtheftung'] };
export function withSpecialSizes(p) {
  const formats = [...p.formats];
  for (const b of Object.keys(p.bindings || {})) {
    if (formats.some((f) => f.binding === b && f.custom)) continue;
    const first = formats.find((f) => f.binding === b) || formats[0] || { w: 210, h: 297 };
    const [en, de] = binLabel[b] || [b, b];
    formats.push({ id: `${p.id}-special-${b}`, binding: b, w: first.w, h: first.h, custom: true, label: lbl(`Special size, ${en}`, `Sonderformat, ${de}`) });
  }
  return { ...p, formats };
}
for (let i = 0; i < PROVIDERS.length; i++) PROVIDERS[i] = withSpecialSizes(PROVIDERS[i]);

// User profiles (imported JSON) are registered at runtime and win over built-ins with the same id.
const extra = new Map();
export function registerProfiles(list = []) {
  extra.clear();
  for (const p of list) if (p && p.id && p.bindings && p.formats) extra.set(p.id, withSpecialSizes({ ...p, user: true }));
}
export function allProviders() {
  const ids = new Set(extra.keys());
  return [...[...extra.values()], ...PROVIDERS.filter((p) => !ids.has(p.id))];
}

export function findProvider(id) {
  return extra.get(id) || PROVIDERS.find((p) => p.id === id) || PROVIDERS[PROVIDERS.length - 1];
}

export function bindingOf(p, binding) {
  return p.bindings[binding] || Object.values(p.bindings)[0];
}

export function papersOf(p, binding) {
  const b = bindingOf(p, binding);
  return b.papers || [];
}

// Spine rule for a provider/binding/paper.
export function spineRuleOf(p, binding, paperId) {
  const b = bindingOf(p, binding);
  const paper = (b.papers || []).find((x) => x.id === paperId) || (b.papers || [])[0];
  return { ...(paper?.spine || b.spine || { type: 'printer', perPage: 0.08 }) };
}

// Spine width in mm for a page count and a rule. Returns { mm, exact, source }.
export function spineFor(rule, pages) {
  const n = Math.max(0, Number(pages) || 0);
  if (!rule) return { mm: 0, exact: false, source: 'none' };
  if (rule.type === 'formula') return { mm: round2((rule.base || 0) + n * rule.perPage), exact: true, source: 'formula' };
  if (rule.type === 'table') {
    const row = rule.rows.find(([max]) => n <= max) || rule.rows[rule.rows.length - 1];
    return { mm: row[1], exact: true, source: 'table' };
  }
  return { mm: round2(n * (rule.perPage || 0.08)), exact: false, source: 'estimate', url: rule.url };
}
const round2 = (v) => Math.round(v * 100) / 100;

// Build edition print settings from provider + format (+ paper).
export function editionSpecFrom(providerId, formatId, paperId) {
  const p = findProvider(providerId);
  const f = p.formats.find((x) => x.id === formatId) || p.formats[0];
  const b = bindingOf(p, f.binding);
  const papers = b.papers || [];
  const paperObj = papers.find((x) => x.id === paperId) || papers[0] || null;
  const paper = paperObj?.id || null;
  return {
    provider: p.id, format: f.id, binding: f.binding, w: f.w, h: f.h, paper,
    bleed: b.bleed, safety: b.safety, glue: b.glue,
    interior: b.interior || 'single', blankEnds: !!b.blankEnds,
    pageMin: b.pages?.min ?? null, pageMax: paperObj?.maxPages ?? b.pages?.max ?? null, pageStep: b.pages?.step ?? 2,
    colourWanted: b.colour || 'cmyk', spineTextMin: b.spineTextMin || 0,
    cover: { mode: 'spread', joint: 0, ...b.cover }, spineRule: spineRuleOf(p, f.binding, paper),
    profileStatus: b.status || 'manual',
    customLimits: f.custom ? (b.customLimits || null) : null,
  };
}

// Profile JSON for export/sharing: one provider with only the binding/format in use, or the whole provider.
export function profileFromEdition(ed, name) {
  const id = `user-${(name || ed.provider || 'profile').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  return {
    id, name: name || `${findProvider(ed.provider).name} (custom)`, region: '', url: '', units: 'mm', sources: [], checked: new Date().toISOString().slice(0, 10),
    bindings: { [ed.binding]: {
      status: 'manual', bleed: ed.bleed, safety: ed.safety, glue: ed.glue, interior: ed.interior, blankEnds: ed.blankEnds,
      pages: { min: ed.pageMin, max: ed.pageMax, step: ed.pageStep }, colour: ed.colourWanted, spineTextMin: ed.spineTextMin,
      cover: { ...ed.cover }, spine: { ...ed.spineRule },
    } },
    formats: [{ id: `${id}-${ed.w}x${ed.h}`, binding: ed.binding, w: ed.w, h: ed.h, label: { en: `${ed.w} × ${ed.h} mm`, de: `${ed.w} × ${ed.h} mm` } }],
  };
}

export function validateProfile(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['not an object'];
  if (!p.id || !/^[\w-]+$/.test(p.id)) errs.push('id');
  if (!p.name) errs.push('name');
  if (!p.bindings || !Object.keys(p.bindings).length) errs.push('bindings');
  for (const [k, b] of Object.entries(p.bindings || {})) {
    for (const f of ['bleed', 'safety']) if (!(Number(b[f]) >= 0)) errs.push(`${k}.${f}`);
    if (!b.cover) errs.push(`${k}.cover`);
  }
  if (!Array.isArray(p.formats) || !p.formats.length) errs.push('formats');
  for (const f of p.formats || []) if (!(f.w > 0 && f.h > 0) || !p.bindings?.[f.binding]) errs.push(`format ${f.id}`);
  return errs;
}
