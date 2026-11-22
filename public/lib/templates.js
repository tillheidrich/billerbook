// Book templates: typography, cover, page colour, graphics and how pages are filled, in one choice.
// Built on the canon layouts, asymmetric covers and one restrained accent colour per template.
// Colours are off-black and paper tones, never pure black on pure white.

export const TEMPLATES = [
  {
    id: 'monografie',
    name: { en: 'Monograph', de: 'Monografie' },
    about: { en: 'One photo per right page, plates in the canon block, the left page stays white. Garamond, italic captions.', de: 'Ein Foto pro rechter Seite, Tafeln im Satzspiegel, die linke Seite bleibt weiß. Garamond, kursive Legenden.' },
    font: 'eb-garamond',
    styles: {
      cover: { size: 26, weight: 400, color: '#1f1d1a' }, title: { size: 22, weight: 400 }, caption: { size: 8.5, italic: true, color: '#5b564e' },
      body: { size: 10.5, leading: 1.5 }, spine: { size: 9, weight: 500, caps: true, tracking: 120 }, chapter: { size: 40, weight: 400, italic: true },
    },
    page: { bg: '#f7f4ee' },
    cover: { layout: 'cover-plate', bg: '#e9e3d6', graphic: { id: 'linen', color: '#e9e3d6' } },
    fill: { style: 'monograph', rightHand: true },
    pageNumbers: 'outer',
  },
  {
    id: 'jahresband',
    name: { en: 'Year book', de: 'Jahresband' },
    about: { en: 'A chapter page for every month, then the photos of that month: full bleed, plates and small pauses. Jost, light large type.', de: 'Eine Kapitelseite pro Monat, danach die Fotos des Monats: randlos, als Tafel und kleine Pausen. Jost, große leichte Schrift.' },
    font: 'jost',
    styles: {
      cover: { size: 64, weight: 300, tracking: -20, color: '#f6f3ee' }, chapter: { size: 58, weight: 300, tracking: -20 }, title: { size: 24, weight: 300 },
      caption: { size: 7.5, caps: true, tracking: 140, color: '#6b665e' }, body: { size: 10, leading: 1.5 }, spine: { size: 9, weight: 500, caps: true, tracking: 200 },
    },
    page: { bg: '#fbfaf7' },
    cover: { layout: 'cover-year', bg: '#1f1d1a' },
    fill: { style: 'monograph', chapters: 'month' },
    pageNumbers: 'outer',
  },
  {
    id: 'galerie',
    name: { en: 'Gallery', de: 'Galerie' },
    about: { en: 'Small photos in a lot of white, captions in spaced capitals. For series and fine-art prints.', de: 'Kleine Fotos in viel Weiß, Legenden in gesperrten Versalien. Für Serien und Fine-Art.' },
    font: 'jost',
    styles: {
      cover: { size: 13, weight: 500, caps: true, tracking: 260, color: '#24221f' }, title: { size: 12, weight: 500, caps: true, tracking: 220, align: 'left' },
      caption: { size: 7, caps: true, tracking: 160, color: '#7a756c' }, spine: { size: 8, weight: 500, caps: true, tracking: 260 }, chapter: { size: 13, weight: 500, caps: true, tracking: 260 },
    },
    page: { bg: '#ffffff' },
    cover: { layout: 'cover-minimal', bg: '#f1efea' },
    fill: { style: 'monograph', rightHand: false },
    pageNumbers: 'none',
  },
  {
    id: 'botanik',
    name: { en: 'Botanical', de: 'Botanik' },
    about: { en: 'Warm paper, Cormorant headings, plates with captions like a herbarium sheet.', de: 'Warmes Papier, Cormorant-Überschriften, Tafeln mit Legende wie ein Herbarbogen.' },
    font: 'cormorant-garamond',
    styles: {
      cover: { size: 40, weight: 300, italic: true, color: '#2c3327' }, title: { size: 26, weight: 300, italic: true }, chapter: { size: 46, weight: 300, italic: true, color: '#3d4a36' },
      caption: { family: 'work-sans', size: 7.5, caps: true, tracking: 120, color: '#55604c' }, body: { size: 11.5, leading: 1.5 }, spine: { size: 10, weight: 500, italic: true },
    },
    page: { bg: '#f5f1e8', graphic: { id: 'paper-warm', color: '#f5f1e8' } },
    cover: { layout: 'cover-plate', bg: '#dcd5c3', graphic: { id: 'paper-warm', color: '#dcd5c3' } },
    fill: { style: 'monograph', captions: true },
    pageNumbers: 'outer',
  },
  {
    id: 'reise',
    name: { en: 'Travel journal', de: 'Reisetagebuch' },
    about: { en: 'Dot grid, handwritten captions, several photos per page in chronological order.', de: 'Punktraster, handschriftliche Legenden, mehrere Fotos pro Seite in zeitlicher Reihenfolge.' },
    font: 'archivo',
    styles: {
      cover: { family: 'caveat', size: 44, weight: 700, color: '#2a2622' }, title: { family: 'caveat', size: 30, weight: 700 }, caption: { family: 'caveat', size: 12, color: '#3b3631' },
      chapter: { family: 'caveat', size: 48, weight: 700 }, body: { size: 9.5, leading: 1.45 }, spine: { family: 'caveat', size: 14, weight: 700 },
    },
    page: { bg: '#fbf8f2', graphic: { id: 'dots', color: '#c9c1b3' } },
    cover: { layout: 'cover-minimal', bg: '#b8946a', graphic: { id: 'kraft' } },
    fill: { style: 'grid', perPage: 3, chapters: 'day' },
    pageNumbers: 'outer',
  },
  {
    id: 'hochzeit',
    name: { en: 'Wedding', de: 'Hochzeit' },
    about: { en: 'Ivory paper, thin frame, light Cormorant. Diptychs and plates, the best photos full bleed.', de: 'Elfenbeinpapier, feiner Rahmen, leichte Cormorant. Diptychen und Tafeln, die besten Fotos randlos.' },
    font: 'cormorant-garamond',
    styles: {
      cover: { size: 34, weight: 300, tracking: 40, color: '#3a3530' }, title: { size: 28, weight: 300, tracking: 40 }, caption: { size: 10, italic: true, color: '#6d665d' },
      chapter: { size: 40, weight: 300, italic: true }, spine: { size: 10, weight: 500, caps: true, tracking: 200 },
    },
    page: { bg: '#fbf8f1' },
    cover: { layout: 'cover-typo', bg: '#f3eee4', graphic: { id: 'frame-thin', color: '#a99a82' } },
    fill: { style: 'monograph' },
    pageNumbers: 'none',
  },
  {
    id: 'weihnachten',
    name: { en: 'Christmas year review', de: 'Weihnachtsbuch Jahresrückblick' },
    about: { en: 'The year as a gift: deep pine-green cover with a fine gold frame, an opening page for a personal line, a chapter for every month. Playfair headings, Work Sans captions.', de: 'Das Jahr als Geschenk: tannengrüner Umschlag mit feinem Goldrahmen, eine Eröffnungsseite für ein paar persönliche Zeilen, ein Kapitel pro Monat. Playfair-Überschriften, Work-Sans-Legenden.' },
    font: 'playfair-display',
    styles: {
      cover: { size: 40, weight: 400, color: '#f3ecdc', tracking: -10 }, title: { size: 30, weight: 400 }, chapter: { size: 52, weight: 400, italic: true, color: '#26402f' },
      caption: { family: 'work-sans', size: 7.5, caps: true, tracking: 140, color: '#6a5d48' }, body: { family: 'work-sans', size: 10.5, leading: 1.6, weight: 300 },
      spine: { size: 10, weight: 500, color: '#f3ecdc', tracking: 60 }, back: { family: 'work-sans', size: 8.5, color: '#e6dcc6', leading: 1.5 },
    },
    page: { bg: '#faf6ee' },
    cover: { layout: 'cover-plate', bg: '#22392c', graphic: { id: 'frame-thin', color: '#b39561' } },
    intro: { de: ['Unser Jahr', 'Für euch, mit allem, was dieses Jahr passiert ist. Frohe Weihnachten.'], en: ['Our year', 'For you, with everything that happened this year. Merry Christmas.'] },
    fill: { style: 'monograph', chapters: 'month' },
    pageNumbers: 'outer',
  },
];
export const findTemplate = (id) => TEMPLATES.find((t) => t.id === id);
