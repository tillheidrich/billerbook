#!/usr/bin/env node
// MCP server (stdio) for Billerbook. Works with Claude Desktop/Code, Codex, Cursor and any
// other MCP client. It talks to the local Billerbook server and starts it if needed,
// so changes made by the AI show up live in the browser UI.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DATA = process.env.BILLERBOOK_DATA || (process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'Billerbook')
  : process.platform === 'win32' ? path.join(process.env.APPDATA || os.homedir(), 'Billerbook') : path.join(os.homedir(), '.billerbook'));
let PORT = Number(process.env.BILLERBOOK_PORT || 4580);
let BASE = `http://127.0.0.1:${PORT}`;

// Reuse a running Billerbook (the Mac app or `npm start`), otherwise start the server in-process.
async function ensureServer() {
  const candidates = [];
  try { candidates.push(JSON.parse(fs.readFileSync(path.join(DATA, 'server.json'), 'utf8')).port); } catch {}
  candidates.push(PORT);
  for (const p of candidates) {
    try { const r = await fetch(`http://127.0.0.1:${p}/api/system`); if (r.ok && (await r.json()).app === 'Billerbook') { PORT = p; BASE = `http://127.0.0.1:${p}`; return; } } catch {}
  }
  const { start } = await import('./server.mjs');
  let srv;
  try { srv = await start({ port: PORT }); } catch { srv = await start({ port: 0 }); }
  PORT = srv.address().port; BASE = `http://127.0.0.1:${PORT}`;
}

async function call(path, opts = {}) {
  await ensureServer();
  const r = await fetch(`${BASE}${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', 'x-client': 'mcp' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return opts.raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}

async function projectId(ref) {
  const list = await call('/api/projects');
  const hit = list.find((p) => p.id === ref) || list.find((p) => p.name.toLowerCase() === String(ref).toLowerCase());
  if (!hit) throw new Error(`Projekt nicht gefunden: ${ref}. Vorhanden: ${list.map((p) => `${p.name} (${p.id})`).join(', ') || 'keine'}`);
  return hit.id;
}
async function editionId(pid, ref) {
  const p = await call(`/api/project/${pid}`);
  if (ref == null) return p.editions[0]?.id;
  const e = p.editions.find((x) => x.id === ref || x.name.toLowerCase() === String(ref).toLowerCase()) || p.editions[Number(ref)];
  if (!e) throw new Error(`Edition nicht gefunden: ${ref}. Vorhanden: ${p.editions.map((x) => x.name).join(', ')}`);
  return e.id;
}
const op = async (pid, name, args) => (await call(`/api/project/${pid}/op`, { body: { op: name, args, returnProject: false } })).result;
const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const P = z.string().describe('Project id or name');
const E = z.string().optional().describe('Edition id or name (default: first edition)');
const PAGE = z.number().int().describe('Page index, 0-based. Page index 0 is the first (right-hand) page; odd indices are left pages.');

const server = new McpServer({ name: 'billerbook', version: JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version }, {
  instructions: [
    'Billerbook lays out print-ready photo books (interior PDF + cover PDF) for print shops such as WIRmachenDRUCK.',
    'Workflow: create_project (with an image folder and/or a Lightroom catalog) → get_project → auto_layout or place images page by page → view_spread to check the result visually → preflight → export_pdf.',
    'One project can hold several editions of the same book (e.g. a large hardcover and a shorter portrait softcover). Images are shared; usage per edition is tracked.',
    'Layouts re-flow automatically when the format changes. Use layout "auto" to fit any number of photos without cropping, "voll" for a full-bleed photo page, spread layouts ("dps-…") only on left pages (odd index).',
    'Always look at view_spread before telling the user a layout is done.',
  ].join('\n'),
});

server.tool('list_projects', 'List photo book projects with their editions.', {}, async () => text(await call('/api/projects')));

server.tool('create_project', 'Create a project from an image folder and/or a Lightroom Classic catalog + collection ids. Default editions: hardcover A4 landscape and softcover A4 portrait (WIRmachenDRUCK).', {
  name: z.string(),
  image_folder: z.string().optional().describe('Absolute path to a folder with JPEG/TIFF/PNG files (sub-folders included)'),
  lightroom_catalog: z.string().optional().describe('Absolute path to a .lrcat file (read-only)'),
  collection_ids: z.array(z.number()).optional().describe('Lightroom collection ids, see list_lightroom_collections'),
  editions: z.array(z.object({ name: z.string(), provider: z.string().default('wmd'), format: z.string() })).optional(),
}, async (a) => {
  const p = await call('/api/projects', { body: { name: a.name, folder: a.image_folder, catalog: a.lightroom_catalog, collections: a.collection_ids, editions: a.editions } });
  return text({ id: p.id, name: p.name, editions: p.editions.map((e) => ({ id: e.id, name: e.name, format: e.format })), ui: `${BASE.replace('127.0.0.1', 'localhost')}/#${p.id}` });
});

server.tool('set_sources', 'Change where images come from: extra folders, Lightroom catalog, collections, and the folder with full-resolution Lightroom exports used for printing.', {
  project: P,
  folders: z.array(z.string()).optional(),
  lightroom_catalog: z.string().optional(),
  collection_ids: z.array(z.number()).optional(),
  export_folder: z.string().optional().describe('Folder with exported JPEG/TIFF files named like the originals'),
}, async (a) => {
  const pid = await projectId(a.project);
  const cur = await call(`/api/project/${pid}`);
  const sources = { ...cur.sources };
  if (a.folders) sources.folders = a.folders;
  if (a.lightroom_catalog || a.collection_ids || a.export_folder) {
    sources.lightroom = { ...(sources.lightroom || {}), ...(a.lightroom_catalog && { catalog: a.lightroom_catalog }), ...(a.collection_ids && { collections: a.collection_ids }), ...(a.export_folder && { exportFolder: a.export_folder }) };
  }
  await op(pid, 'setSources', { sources });
  return text(await call(`/api/project/${pid}/summary`));
});

server.tool('list_lightroom_collections', 'List collections and books in a Lightroom Classic catalog.', { catalog: z.string() },
  async (a) => text(await call('/api/lightroom/collections', { body: { catalog: a.catalog } })));

server.tool('import_lightroom_book', 'Import a book made in the Lightroom Classic Book module as a new edition (pages, photo positions, crops).', {
  project: P, collection_id: z.number(), name: z.string().optional(),
  provider: z.string().default('wmd'), format: z.string().default('hc-a4-quer'), catalog: z.string().optional(),
}, async (a) => {
  const pid = await projectId(a.project);
  return text(await call(`/api/project/${pid}/lightroom-book`, { body: { collectionId: a.collection_id, name: a.name, provider: a.provider, format: a.format, catalog: a.catalog } }));
});

server.tool('get_project', 'Summary: editions, formats, page counts, how many pool images are placed per edition.', { project: P },
  async (a) => text(await call(`/api/project/${await projectId(a.project)}/summary`)));

server.tool('list_formats', 'Print shop profiles and their book formats (for add_edition / update_edition).', {}, async () => {
  const s = await call('/api/system');
  return text(s.providers.map((p) => ({ provider: p.id, name: p.name, verified: p.verified, formats: p.formats.map((f) => ({ id: f.id, binding: f.binding, size: `${f.w}×${f.h}`, label: f.label.en })) })));
});

server.tool('list_layouts', 'Available page and cover layouts.', {}, async () => {
  const s = await call('/api/system');
  return text({
    page: s.layouts, cover: s.coverLayouts,
    notes: {
      auto: 'justified grid, any number of photos, no cropping', voll: 'one photo full bleed', passepartout: 'one photo filling the margins', einzeln: 'one photo uncropped inside margins',
      galerie: 'small photo centred, lots of white', 'bild-text': 'photo + caption', 'halb-text': 'half-page bleed photo + text', text: 'title + body text',
      'dps-voll': 'panorama across the spread (left pages only)', 'dps-streifen': 'panorama strip across the spread', 'dps-voll-zwei': 'left full bleed + 2 on the right', 'dps-voll-raster': 'left full bleed + 2×2 right', 'dps-auto': 'justified per half',
    },
  });
});

server.tool('list_images', 'List images in the pool with usage. Use filter "unplaced" to find photos missing from an edition (completeness check).', {
  project: P, edition: E,
  filter: z.enum(['all', 'unplaced', 'placed', 'nowhere', 'no_file']).default('all'),
  min_rating: z.number().optional(), offset: z.number().default(0), limit: z.number().default(200),
}, async (a) => {
  const pid = await projectId(a.project);
  const eid = await editionId(pid, a.edition);
  const { items } = await call(`/api/project/${pid}/pool`);
  let list = items;
  if (a.filter === 'unplaced') list = list.filter((i) => !i.used?.[eid]);
  if (a.filter === 'placed') list = list.filter((i) => i.used?.[eid]);
  if (a.filter === 'nowhere') list = list.filter((i) => !Object.keys(i.used || {}).length);
  if (a.filter === 'no_file') list = list.filter((i) => !i.hasFile);
  if (a.min_rating) list = list.filter((i) => i.rating >= a.min_rating);
  return text({
    total: list.length,
    images: list.slice(a.offset, a.offset + a.limit).map((i) => ({ key: i.key, name: i.name, time: i.time, rating: i.rating, caption: i.caption || undefined, orientation: i.w >= i.h ? 'landscape' : 'portrait', aspect: +(i.w / i.h).toFixed(3), printable: i.hasFile, uses: i.used })),
  });
});

server.tool('add_edition', 'Add an edition (another version of the same book, e.g. a shorter softcover). Optionally copy pages from an existing edition; layouts re-flow to the new format.', {
  project: P, name: z.string(), provider: z.string().default('wmd'), format: z.string(), copy_from: z.string().optional(),
}, async (a) => {
  const pid = await projectId(a.project);
  const copyFrom = a.copy_from ? await editionId(pid, a.copy_from) : undefined;
  const ed = await op(pid, 'addEdition', { name: a.name, provider: a.provider, format: a.format, copyFrom });
  return text({ id: ed.id, name: ed.name, pages: ed.pages.length });
});

server.tool('update_edition', 'Change edition settings: format, spine width (mm, from the print shop), margins, gutter, gap, ppi, colorMode (cmyk|rgb), icc (path), font (sans|serif), bg, pageNumbers (none|outer|center), sharpen (none|low|standard|high).', {
  project: P, edition: E, settings: z.record(z.any()),
}, async (a) => {
  const pid = await projectId(a.project);
  await op(pid, 'updateEdition', { edition: await editionId(pid, a.edition), patch: a.settings });
  return text('ok');
});

server.tool('auto_layout', 'Lay out photos automatically in chronological order: new page at time gaps, high-rated photos get their own page. Appends by default.', {
  project: P, edition: E,
  per_page: z.number().default(3), highlight_rating: z.number().default(5).describe('0 disables full pages for top-rated photos'),
  filter: z.enum(['all', 'unplaced', 'nowhere']).default('unplaced'), min_rating: z.number().optional(),
  keys: z.array(z.string()).optional().describe('Explicit image keys in the desired order'),
  replace: z.boolean().default(false), at: z.number().optional(), break_hours: z.number().default(36),
}, async (a) => {
  const pid = await projectId(a.project);
  const r = await op(pid, 'autoFill', {
    edition: await editionId(pid, a.edition), perPage: a.per_page, highlightRating: a.highlight_rating, filter: a.filter,
    minRating: a.min_rating, keys: a.keys, replace: a.replace, at: a.at, breakHours: a.break_hours,
  });
  return text(r);
});

server.tool('get_pages', 'Pages of an edition with layout and placed images.', { project: P, edition: E, from: z.number().default(0), to: z.number().optional() }, async (a) => {
  const pid = await projectId(a.project);
  const eid = await editionId(pid, a.edition);
  const p = await call(`/api/project/${pid}`);
  const ed = p.editions.find((e) => e.id === eid);
  const to = a.to ?? Math.min(ed.pages.length - 1, a.from + 40);
  return text({
    pages: ed.pages.length, format: `${ed.w}×${ed.h} mm ${ed.binding}`,
    list: ed.pages.slice(a.from, to + 1).map((pg, k) => ({
      index: a.from + k, side: (a.from + k) % 2 ? 'left' : 'right', layout: pg.spanned ? '(part of spread)' : pg.layout,
      images: pg.slots.map((s) => s && { key: s.key, fit: s.fit || 'fill', zoom: s.zoom || 1 }), texts: pg.texts.map((t) => t?.value).filter(Boolean),
    })),
  });
});

server.tool('view_spread', 'Render a spread (two facing pages) or the cover as an image to check the layout visually. Spread 0 is page 1 alone; spread n shows pages 2n and 2n+1 (1-based numbering: pages 2n, 2n+1).', {
  project: P, edition: E, spread: z.number().default(0), cover: z.boolean().default(false),
}, async (a) => {
  const pid = await projectId(a.project);
  const eid = await editionId(pid, a.edition);
  const buf = await call(`/api/project/${pid}/spread.jpg?edition=${eid}&spread=${a.spread}${a.cover ? '&cover=1' : ''}&w=1400`, { raw: true });
  return { content: [{ type: 'image', data: buf.toString('base64'), mimeType: 'image/jpeg' }] };
});

server.tool('set_page_layout', 'Set the layout of a page. Extra images that no longer fit are returned.', { project: P, edition: E, page: PAGE, layout: z.string() }, async (a) => {
  const pid = await projectId(a.project);
  return text(await op(pid, 'setLayout', { edition: await editionId(pid, a.edition), page: a.page, layout: a.layout }));
});

server.tool('place_images', 'Place images on a page. With slot: into that frame. Without slot: fill free frames, otherwise switch to the "auto" layout and append.', {
  project: P, edition: E, page: PAGE, keys: z.array(z.string()), slot: z.number().optional(),
  fit: z.enum(['fill', 'contain']).optional().describe('fill = crop to frame (default), contain = whole photo'),
}, async (a) => {
  const pid = await projectId(a.project);
  const eid = await editionId(pid, a.edition);
  if (a.slot != null) await op(pid, 'placeImage', { edition: eid, page: a.page, slot: a.slot, key: a.keys[0], extra: a.fit === 'contain' ? { fit: 'contain' } : {} });
  else await op(pid, 'addImages', { edition: eid, page: a.page, keys: a.keys });
  return text('ok');
});

server.tool('adjust_image', 'Crop control for one frame: zoom ≥ 1, ox/oy from -1 (left/top) to 1 (right/bottom), fit fill|contain.', {
  project: P, edition: E, page: PAGE, slot: z.number(), zoom: z.number().optional(), ox: z.number().optional(), oy: z.number().optional(), fit: z.enum(['fill', 'contain']).optional(),
}, async (a) => {
  const pid = await projectId(a.project);
  const patch = {};
  for (const k of ['zoom', 'ox', 'oy']) if (a[k] != null) patch[k] = a[k];
  if (a.fit) patch.fit = a.fit === 'contain' ? 'contain' : undefined;
  await op(pid, 'updateSlot', { edition: await editionId(pid, a.edition), page: a.page, slot: a.slot, patch });
  return text('ok');
});

server.tool('make_full_bleed', 'Turn the photo in a frame into a full-bleed page; the other photos move to a new page after it.', { project: P, edition: E, page: PAGE, slot: z.number() }, async (a) => {
  const pid = await projectId(a.project);
  return text(await op(pid, 'makeFullBleed', { edition: await editionId(pid, a.edition), page: a.page, slot: a.slot }));
});

server.tool('shuffle_layout', 'Next arrangement for the photos on a page (another justified grid variant or another layout with the same number of photos). Like the space bar in the editor.', { project: P, edition: E, page: PAGE }, async (a) => {
  const pid = await projectId(a.project);
  return text(await op(pid, 'shuffleLayout', { edition: await editionId(pid, a.edition), page: a.page }));
});

server.tool('fill_captions', 'Fill empty caption text frames from photo metadata (Lightroom caption, XMP/IPTC description or title). Whole edition or one page.', { project: P, edition: E, page: z.number().optional() }, async (a) => {
  const pid = await projectId(a.project);
  return text(await op(pid, 'fillCaptions', { edition: await editionId(pid, a.edition), page: a.page }));
});

server.tool('edit_frames', 'Free layout editing on a page: convert to free frames, move/resize a frame (fractions 0–1 of the page or spread), add or remove frames.', {
  project: P, edition: E, page: PAGE, action: z.enum(['convert', 'update', 'add_image', 'add_text', 'remove']),
  index: z.number().optional(), x: z.number().optional(), y: z.number().optional(), w: z.number().optional(), h: z.number().optional(),
}, async (a) => {
  const pid = await projectId(a.project);
  const eid = await editionId(pid, a.edition);
  if (a.action === 'convert') return text(await op(pid, 'toFreeLayout', { edition: eid, page: a.page }));
  if (a.action === 'add_image' || a.action === 'add_text') return text(await op(pid, 'addFreeFrame', { edition: eid, page: a.page, kind: a.action === 'add_text' ? 'text' : 'image' }));
  if (a.action === 'remove') return text(await op(pid, 'removeFreeFrame', { edition: eid, page: a.page, index: a.index }));
  const rect = {}; for (const k of ['x', 'y', 'w', 'h']) if (a[k] != null) rect[k] = a[k];
  return text(await op(pid, 'updateFreeFrame', { edition: eid, page: a.page, index: a.index, rect }));
});

server.tool('remove_image', 'Remove the image from a frame.', { project: P, edition: E, page: PAGE, slot: z.number() }, async (a) => {
  const pid = await projectId(a.project);
  await op(pid, 'removeImage', { edition: await editionId(pid, a.edition), page: a.page, slot: a.slot });
  return text('ok');
});

server.tool('swap_images', 'Swap two frames (also across pages).', { project: P, edition: E, a_page: z.number(), a_slot: z.number(), b_page: z.number(), b_slot: z.number() }, async (a) => {
  const pid = await projectId(a.project);
  await op(pid, 'swapSlots', { edition: await editionId(pid, a.edition), a: { page: a.a_page, slot: a.a_slot }, b: { page: a.b_page, slot: a.b_slot } });
  return text('ok');
});

server.tool('pages', 'Insert, delete or move pages.', {
  project: P, edition: E, action: z.enum(['insert', 'delete', 'move']), at: z.number().optional(), count: z.number().default(1), to: z.number().optional(), layout: z.string().optional(),
}, async (a) => {
  const pid = await projectId(a.project);
  const eid = await editionId(pid, a.edition);
  if (a.action === 'insert') return text(await op(pid, 'insertPages', { edition: eid, at: a.at, count: a.count, layout: a.layout || 'auto' }));
  if (a.action === 'delete') return text(await op(pid, 'deletePages', { edition: eid, from: a.at, count: a.count }));
  return text(await op(pid, 'movePages', { edition: eid, from: a.at, count: a.count, to: a.to }));
});

server.tool('set_text', 'Set the text of a text frame on a page (index = text frame number on that page).', { project: P, edition: E, page: PAGE, index: z.number().default(0), value: z.string() }, async (a) => {
  const pid = await projectId(a.project);
  await op(pid, 'setText', { edition: await editionId(pid, a.edition), page: a.page, index: a.index, value: a.value });
  return text('ok');
});

server.tool('set_cover', 'Design the cover: layout, photo(s), title/spine/back texts, background colour.', {
  project: P, edition: E, layout: z.string().optional(), key: z.string().optional(), slot: z.number().default(0),
  texts: z.array(z.string()).optional().describe('Texts in the order of the layout text frames (e.g. spine, back)'), bg: z.string().optional(),
}, async (a) => {
  const pid = await projectId(a.project);
  await op(pid, 'setCover', { edition: await editionId(pid, a.edition), layout: a.layout, key: a.key, slot: a.key ? a.slot : undefined, texts: a.texts?.map((v) => ({ value: v })), bg: a.bg });
  return text('ok');
});

server.tool('preflight', 'Check an edition before printing: empty frames, low resolution, missing print files, glue zone, page count, spine.', { project: P, edition: E }, async (a) => {
  const pid = await projectId(a.project);
  return text(await call(`/api/project/${pid}/preflight?edition=${await editionId(pid, a.edition)}`));
});

server.tool('export_pdf', 'Export print PDFs (interior and/or cover). preview=true makes a small RGB proof. Waits until done and returns the file paths.', {
  project: P, edition: E, parts: z.array(z.enum(['interior', 'cover'])).default(['interior', 'cover']), preview: z.boolean().default(false), out_dir: z.string().optional(),
}, async (a) => {
  const pid = await projectId(a.project);
  const job = await call(`/api/project/${pid}/export`, { body: { edition: await editionId(pid, a.edition), parts: a.parts, preview: a.preview, outDir: a.out_dir } });
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const j = await call(`/api/jobs/${job.id}`);
    if (j.state !== 'running') return text(j);
  }
});

await server.connect(new StdioServerTransport());
