// IDML export: the book as an InDesign Markup Language package, which Affinity (free, by Canva)
// and Adobe InDesign open as an editable layout: real pages, image frames with linked photos,
// text frames with the book's text. Interior and cover are separate files, like the print PDFs.
//
// What carries over: page size, bleed, facing pages, frame positions and crops, photos (written
// to Links/ as JPEG, tones applied), page colours, text with font family, size, leading,
// alignment, colour, italics/bold, caps. What does not: background graphics and textures,
// background photos, page numbers, the barcode (they stay in the print PDF).
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import yazl from 'yazl';
import { spreadsOf, placement, bleedExtend, coverSpec } from '../public/lib/geometry.js';
import { buildFrames, pageOwner, coverFrames } from '../public/lib/layouts.js';
import { resolveStyle, FAMILIES } from '../public/lib/text.js';
import { applyTone } from './imagefx.mjs';

const PT = 72 / 25.4;
const NS = 'xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"';
const DOM = '18.0';
const x = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const n = (v) => (Math.round(v * 1000) / 1000).toString();
const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function hex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()) || /^#?([0-9a-f]{3})$/i.exec(String(c || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((d) => d + d).join('') : m[1];
  return h.toLowerCase();
}

// Collects swatches, stories and links while the pages are written.
class Doc {
  constructor(dir) { this.dir = dir; this.colors = new Map(); this.stories = []; this.links = new Map(); this.id = 0; }
  uid(p = 'u') { return `${p}${(++this.id).toString(36)}`; }
  color(c) {
    const h = hex(c);
    if (!h) return 'Color/Black';
    if (h === '000000') return 'Color/Black';
    if (h === 'ffffff') return 'Color/Paper';
    if (!this.colors.has(h)) this.colors.set(h, `Color/bb-${h}`);
    return this.colors.get(h);
  }
}

const rectPath = (l, t, r, b) => `<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>${[[l, t], [l, b], [r, b], [r, t]].map(([a, c]) => `<PathPointType Anchor="${n(a)} ${n(c)}" LeftDirection="${n(a)} ${n(c)}" RightDirection="${n(a)} ${n(c)}"/>`).join('')}</PathPointArray></GeometryPathType></PathGeometry></Properties>`;

async function linkFor(doc, project, it, slot) {
  const key = `${it.key}|${slot?.tone || ''}|${slot?.toneStrength ?? ''}`;
  if (doc.links.has(key)) return doc.links.get(key);
  const base = (path.basename(it.name || it.file || 'bild').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'bild') + (slot?.tone ? `_${slot.tone}` : '');
  let name = `${base}.jpg`, i = 2;
  const used = new Set([...doc.links.values()].map((l) => l.name));
  while (used.has(name)) name = `${base}-${i++}.jpg`;
  const file = path.join(doc.dir, 'Links', name);
  let s = sharp(it.file, { failOn: 'none', limitInputPixels: false }).rotate();
  if (slot?.tone) s = applyTone(s, slot.tone, slot.toneStrength);
  const info = await s.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).withMetadata().toFile(file);
  const l = { name, file, w: info.width, h: info.height };
  doc.links.set(key, l);
  return l;
}

// Rectangle with a placed photo. f is in spread points; frame in mm (for the crop math).
async function imageItem(doc, project, f, ox, oy, it, slot) {
  const l = await linkFor(doc, project, it, slot);
  const pl = placement(f.w, f.h, l.w, l.h, slot || {}, it.focal);
  const L = ox + f.x * PT, T = oy + f.y * PT, R = L + f.w * PT, B = T + f.h * PT;
  const s = pl.s * PT; // points per image pixel
  const ix = L + (pl.dx - pl.sx * pl.s) * PT, iy = T + (pl.dy - pl.sy * pl.s) * PT;
  const uri = `file:${encodeURI(l.file.split(path.sep).join('/')).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  return `<Rectangle Self="${doc.uid()}" ContentType="GraphicType" ItemLayer="ul" StrokeWeight="0" FillColor="Swatch/None" StrokeColor="Swatch/None" AppliedObjectStyle="ObjectStyle/$ID/[Normal Graphics Frame]" ItemTransform="1 0 0 1 0 0">${rectPath(L, T, R, B)}`
    + `<FrameFittingOption AutoFit="false"/><Image Self="${doc.uid()}" ItemTransform="${s.toFixed(6)} 0 0 ${s.toFixed(6)} ${n(ix)} ${n(iy)}"><Properties><Profile type="string">$ID/Embedded</Profile><GraphicBounds Left="0" Top="0" Right="${l.w}" Bottom="${l.h}"/></Properties>`
    + `<Link Self="${doc.uid()}" LinkResourceURI="${x(uri)}" StoredState="Normal"/></Image></Rectangle>`;
}

function colorRect(doc, L, T, R, B, color) {
  return `<Rectangle Self="${doc.uid()}" ContentType="Unassigned" ItemLayer="ul" StrokeWeight="0" FillColor="${doc.color(color)}" StrokeColor="Swatch/None" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 0 0">${rectPath(L, T, R, B)}</Rectangle>`;
}

const fontName = (id) => FAMILIES.find((f) => f.id === id)?.name || id || 'Work Sans';
function fontStyle(st) {
  const w = Number(st.weight) || 400;
  const base = w >= 700 ? 'Bold' : w >= 500 ? 'Medium' : w <= 300 ? 'Light' : 'Regular';
  return st.italic ? (base === 'Regular' ? 'Italic' : `${base} Italic`) : base;
}
const JUST = { left: 'LeftAlign', center: 'CenterAlign', right: 'RightAlign', justify: 'LeftJustified' };

function textItem(doc, f, ox, oy, value, st, fallbackColor, rotate) {
  const story = doc.uid('st');
  const paras = String(value).split(/\n/);
  const attrs = `AppliedCharacterStyle="CharacterStyle/$ID/[No character style]" AppliedFont="${x(fontName(st.family))}" FontStyle="${x(fontStyle(st))}" PointSize="${n(st.size)}" Leading="${n(st.size * st.leading)}" FillColor="${doc.color(st.color || fallbackColor)}"${st.caps ? ' Capitalization="AllCaps"' : ''}${st.tracking ? ` Tracking="${Math.round(st.tracking)}"` : ''}`;
  const body = paras.map((p, i) => `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle" Justification="${JUST[st.align] || 'LeftAlign'}"><CharacterStyleRange ${attrs}><Content>${x(p)}</Content>${i < paras.length - 1 ? '<Br/>' : ''}</CharacterStyleRange></ParagraphStyleRange>`).join('');
  doc.stories.push({ id: story, xml: `<Story Self="${story}" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">${body}</Story>` });
  const L = ox + f.x * PT, T = oy + f.y * PT, W = f.w * PT, H = f.h * PT;
  let geo, tr;
  if (rotate) { // spine text: frame turned 90° clockwise around its centre
    const cx = L + W / 2, cy = T + H / 2;
    geo = rectPath(-H / 2, -W / 2, H / 2, W / 2);
    tr = `0 1 -1 0 ${n(cx)} ${n(cy)}`;
  } else { geo = rectPath(L, T, L + W, T + H); tr = '1 0 0 1 0 0'; }
  return `<TextFrame Self="${doc.uid()}" ParentStory="${story}" ContentType="TextType" ItemLayer="ul" FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0" AppliedObjectStyle="ObjectStyle/$ID/[Normal Text Frame]" ItemTransform="${tr}">${geo}<TextFramePreference TextColumnCount="1" VerticalJustification="TopAlign" InsetSpacing="0 0 0 0"/></TextFrame>`;
}

const textColorOn = (bg) => { const h = hex(bg) || 'ffffff'; const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) < 0.45 ? '#ffffff' : '#1a1a1a'; };

// Items of one owner page (or spread owner) drawn at spread x offset ox (points); y from the top of the page.
async function ownerItems(doc, project, ed, pool, ownerIndex, ox, oy, bleed) {
  const p = ed.pages[ownerIndex];
  const own = pageOwner(ed, ownerIndex);
  const W = own.spread ? 2 * ed.w : ed.w, H = ed.h;
  const out = [];
  const bg = p.bg || ed.bg;
  if (bg && hex(bg) && hex(bg) !== 'ffffff') out.push(colorRect(doc, ox - bleed * PT, oy - bleed * PT, ox + (W + bleed) * PT, oy + (H + bleed) * PT, bg));
  const aspectOf = (key) => { const it = pool.get(key); return it?.w ? it.w / it.h : null; };
  const fallback = textColorOn(bg);
  for (const f0 of buildFrames(ed, ownerIndex, aspectOf)) {
    if (f0.kind === 'text') {
      const tx = p.texts?.[f0.text];
      if (tx?.value?.trim()) out.push(textItem(doc, f0, ox, oy, tx.value, resolveStyle(ed, f0.role || 'body', tx), fallback, f0.role === 'spine'));
      continue;
    }
    const slot = p.slots?.[f0.slot];
    const it = slot && pool.get(slot.key);
    if (!it?.file || !fs.existsSync(it.file)) continue;
    const f = bleed ? bleedExtend(f0, W, H, bleed) : f0;
    out.push(await imageItem(doc, project, f, ox, oy, it, slot));
  }
  return out;
}

function pkg(name, inner) { return `${head}<idPkg:${name} ${NS} DOMVersion="${DOM}">${inner}</idPkg:${name}>`; }

async function writePackage(doc, file, { pageW, pageH, facing, bleed, spreads, pageCount }) {
  const graphic = pkg('Graphic', `<Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" ColorOverride="Specialblack" Name="Black" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937" SwatchColorGroupReference="u18ColorGroupSwatch3"/>`
    + `<Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" ColorOverride="Specialpaper" Name="Paper" ColorEditable="true" ColorRemovable="false" Visible="true" SwatchCreatorID="7937" SwatchColorGroupReference="u18ColorGroupSwatch2"/>`
    + `<Color Self="Color/Registration" Model="Registration" Space="CMYK" ColorValue="100 100 100 100" ColorOverride="Specialregistration" Name="Registration" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>`
    + [...doc.colors].map(([h, id]) => `<Color Self="${id}" Model="Process" Space="RGB" ColorValue="${[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ')}" ColorOverride="Normal" Name="#${h}" ColorEditable="true" ColorRemovable="true" Visible="true" SwatchCreatorID="7937"/>`).join('')
    + '<Swatch Self="Swatch/None" Name="None" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>');
  const styles = pkg('Styles', '<RootCharacterStyleGroup Self="u79"><CharacterStyle Self="CharacterStyle/$ID/[No character style]" Imported="false" Name="$ID/[No character style]"/></RootCharacterStyleGroup>'
    + '<RootParagraphStyleGroup Self="u78"><ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" Imported="false"/>'
    + '<ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" Imported="false" NextStyle="ParagraphStyle/$ID/NormalParagraphStyle"><Properties><BasedOn type="string">$ID/[No paragraph style]</BasedOn></Properties></ParagraphStyle></RootParagraphStyleGroup>'
    + '<RootCellStyleGroup Self="u8b"><CellStyle Self="CellStyle/$ID/[None]" Name="$ID/[None]"/></RootCellStyleGroup>'
    + '<RootTableStyleGroup Self="u8d"><TableStyle Self="TableStyle/$ID/[No table style]" Name="$ID/[No table style]"/><TableStyle Self="TableStyle/$ID/[Basic Table]" Name="$ID/[Basic Table]"/></RootTableStyleGroup>'
    + '<RootObjectStyleGroup Self="u97"><ObjectStyle Self="ObjectStyle/$ID/[None]" Name="$ID/[None]"/><ObjectStyle Self="ObjectStyle/$ID/[Normal Graphics Frame]" Name="$ID/[Normal Graphics Frame]"/><ObjectStyle Self="ObjectStyle/$ID/[Normal Text Frame]" Name="$ID/[Normal Text Frame]"/><ObjectStyle Self="ObjectStyle/$ID/[Normal Grid]" Name="$ID/[Normal Grid]"/></RootObjectStyleGroup>');
  const used = [...new Set(doc.stories.flatMap((s) => [...s.xml.matchAll(/AppliedFont="([^"]+)"/g)].map((m) => m[1])))];
  const fonts = pkg('Fonts', used.map((f, i) => `<FontFamily Self="di${i}" Name="${f}"/>`).join(''));
  const b = n(bleed * PT);
  const prefs = pkg('Preferences', `<DocumentPreference PageHeight="${n(pageH)}" PageWidth="${n(pageW)}" PagesPerDocument="${pageCount}" FacingPages="${facing}" DocumentBleedTopOffset="${b}" DocumentBleedBottomOffset="${b}" DocumentBleedInsideOrLeftOffset="${b}" DocumentBleedOutsideOrRightOffset="${b}" DocumentBleedUniformSize="true" AllowPageShuffle="true" PageBinding="LeftToRight" StartPageNumber="1" ColumnGuideLocked="true"/>`
    + '<ViewPreference HorizontalMeasurementUnits="Millimeters" VerticalMeasurementUnits="Millimeters"/>');
  const spreadFiles = spreads.map((sp, i) => ({ name: `Spreads/Spread_s${i + 1}.xml`, xml: pkg('Spread', sp) }));
  const storyFiles = doc.stories.map((s) => ({ name: `Stories/Story_${s.id}.xml`, xml: pkg('Story', s.xml) }));
  const design = `${head}<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="${DOM}(0)" ?>\n`
    + `<Document ${NS} DOMVersion="${DOM}" Self="d" StoryList="${doc.stories.map((s) => s.id).join(' ')}" ZeroPoint="0 0" ActiveLayer="ul" CMYKProfile="Coated FOGRA39 (ISO 12647-2:2004)" RGBProfile="sRGB IEC61966-2.1" SolidColorIntent="UseColorSettings" AfterBlendingIntent="UseColorSettings" DefaultImageIntent="UseColorSettings" RGBPolicy="PreserveEmbeddedProfiles" CMYKPolicy="CombinationOfPreserveAndSafeCmyk" AccurateLABSpots="false">`
    + '<idPkg:Graphic src="Resources/Graphic.xml"/><idPkg:Fonts src="Resources/Fonts.xml"/><idPkg:Styles src="Resources/Styles.xml"/><idPkg:Preferences src="Resources/Preferences.xml"/>'
    + '<Layer Self="ul" Name="Billerbook" Visible="true" Locked="false" IgnoreWrap="false" ShowGuides="true" LockGuides="false" UI="true" Expendable="true" Printable="true"/>'
    + spreadFiles.map((f) => `<idPkg:Spread src="${f.name}"/>`).join('')
    + storyFiles.map((f) => `<idPkg:Story src="${f.name}"/>`).join('')
    + '</Document>';
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from('application/vnd.adobe.indesign-idml-package'), 'mimetype', { compress: false });
  zip.addBuffer(Buffer.from(`${head}<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles></container>`), 'META-INF/container.xml');
  zip.addBuffer(Buffer.from(design), 'designmap.xml');
  for (const [name, xml] of [['Resources/Graphic.xml', graphic], ['Resources/Fonts.xml', fonts], ['Resources/Styles.xml', styles], ['Resources/Preferences.xml', prefs]]) zip.addBuffer(Buffer.from(xml), name);
  for (const f of [...spreadFiles, ...storyFiles]) zip.addBuffer(Buffer.from(f.xml), f.name);
  zip.end();
  await new Promise((res, rej) => zip.outputStream.pipe(fs.createWriteStream(file)).on('close', res).on('error', rej));
}

// Writes <dir>/<base>_idml/{<base>.idml, <base>_cover.idml, Links/…, LIESMICH.txt}.
export async function exportIdml({ project, ed, pool, dir, base, onProgress = () => {} }) {
  const out = path.join(dir, `${base}_idml`);
  await fsp.mkdir(path.join(out, 'Links'), { recursive: true });
  const bleed = ed.bleed ?? 3;
  const W = ed.w * PT, H = ed.h * PT;
  const doc = new Doc(out);
  const sps = spreadsOf(ed.pages.length);
  const spreads = [];
  let pageNo = 0;
  for (let s = 0; s < sps.length; s++) {
    const [l, r] = sps[s];
    const pages = [], items = [];
    const ids = [l, r].filter((v) => v != null);
    const single = ids.length === 1;
    // Spread coordinates: binding at x = 0, page tops at y = -H/2.
    const slots = single ? [[ids[0], l == null ? 0 : -W]] : [[l, -W], [r, 0]];
    for (const [i, ox] of slots) {
      pageNo++;
      pages.push(`<Page Self="${doc.uid('pg')}" Name="${ed.subset ? ed.subset[i] : i + 1}" AppliedMaster="n" GeometricBounds="0 0 ${n(H)} ${n(W)}" ItemTransform="1 0 0 1 ${n(ox)} ${n(-H / 2)}" OverrideList="" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true"/>`);
    }
    const done = new Set();
    for (const [i, ox] of slots) {
      const own = pageOwner(ed, i);
      if (done.has(own.owner)) continue;
      done.add(own.owner);
      const sx = own.spread ? -W : ox; // a spread owner always starts at the left page
      items.push(...await ownerItems(doc, project, ed, pool, own.owner, sx, -H / 2, bleed));
    }
    spreads.push(`<Spread Self="${doc.uid('sp')}" PageCount="${pages.length}" BindingLocation="${single ? (l == null ? 0 : 1) : 1}" AllowPageShuffle="true" ShowMasterItems="true" PageTransitionType="None" ItemTransform="1 0 0 1 0 0" FlattenerOverride="Default">${pages.join('')}${items.join('')}</Spread>`);
    onProgress(s + 1, sps.length + 1);
  }
  const file = path.join(out, `${base}.idml`);
  await writePackage(doc, file, { pageW: W, pageH: H, facing: true, bleed, spreads, pageCount: pageNo });

  let coverFile = null;
  if (ed.cover?.mode && ed.cover.mode !== 'none' && ed.cover.mode !== 'pages') {
    const cdoc = new Doc(out);
    cdoc.links = doc.links; // share photos already written
    const aspectOf = (key) => { const it = pool.get(key); return it?.w ? it.w / it.h : null; };
    const { cs, frames } = coverFrames(ed, aspectOf);
    const cd = ed.coverDesign || {};
    const CW = cs.W * PT, CH = cs.H * PT;
    const items = [];
    if (cd.bg && hex(cd.bg) && hex(cd.bg) !== 'ffffff') items.push(colorRect(cdoc, 0, 0, CW, CH, cd.bg));
    for (const f of frames) {
      if (f.kind === 'text') {
        const tx = cd.texts?.[f.text];
        if (tx?.value?.trim()) items.push(textItem(cdoc, f, 0, 0, tx.value, resolveStyle(ed, f.role || 'body', tx), textColorOn(cd.bg), f.role === 'spine'));
        continue;
      }
      const slot = cd.slots?.[f.slot];
      const it = slot && pool.get(slot.key);
      if (it?.file && fs.existsSync(it.file)) items.push(await imageItem(cdoc, project, f, 0, 0, it, slot));
    }
    const spread = `<Spread Self="${cdoc.uid('sp')}" PageCount="1" BindingLocation="0" ShowMasterItems="true" ItemTransform="1 0 0 1 0 0"><Page Self="${cdoc.uid('pg')}" Name="1" AppliedMaster="n" GeometricBounds="0 0 ${n(CH)} ${n(CW)}" ItemTransform="1 0 0 1 0 0"/>${items.join('')}</Spread>`;
    coverFile = path.join(out, `${base}_cover.idml`);
    await writePackage(cdoc, coverFile, { pageW: CW, pageH: CH, facing: false, bleed: 0, spreads: [spread], pageCount: 1 });
  }
  await fsp.writeFile(path.join(out, 'LIESMICH.txt'), [
    'Billerbook – IDML für Affinity und InDesign / IDML for Affinity and InDesign',
    '',
    'DE: Öffne die .idml-Datei in Affinity (Datei › Öffnen) oder InDesign. Die Fotos liegen im Ordner Links daneben; lass den Ordner bei der .idml-Datei.',
    'Übernommen: Seitenformat, Beschnitt, Doppelseiten, Bild- und Textrahmen, Ausschnitte, Fotos (Tönungen eingerechnet), Seitenfarben, Schrift, Größe, Zeilenabstand, Ausrichtung, Farbe.',
    'Nicht übernommen: Hintergrundgrafiken und Papierstrukturen, Hintergrundfotos, Seitenzahlen, Barcode. Diese stehen im Druck-PDF.',
    'Die Schriften (Open Font License) liegen in Billerbook unter fonts/; installiere sie, wenn Affinity sie als fehlend meldet.',
    '',
    'EN: Open the .idml file in Affinity (File › Open) or InDesign. Photos are in the Links folder next to it; keep that folder with the .idml file.',
    'Carried over: page size, bleed, spreads, image and text frames, crops, photos (tones applied), page colours, font, size, leading, alignment, colour.',
    'Not carried over: background graphics and paper textures, background photos, page numbers, barcode. They are in the print PDF.',
    'The fonts (Open Font License) ship with Billerbook in fonts/; install them if Affinity reports them missing.',
    '',
  ].join('\n'));
  onProgress(sps.length + 1, sps.length + 1);
  return { dir: out, file, cover: coverFile, links: doc.links.size, spreads: sps.length };
}
