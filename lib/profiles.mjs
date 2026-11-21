// User print profiles (imported or created in the app), stored next to the projects.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { DATA } from './store.mjs';
import { registerProfiles, validateProfile, allProviders } from '../public/lib/providers.js';
import { PT_PER_MM } from '../public/lib/geometry.js';

const FILE = path.join(DATA, 'profiles.json');

export function loadProfiles() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { list = []; }
  registerProfiles(Array.isArray(list) ? list : []);
  return list;
}

export function saveProfile(profile) {
  const errs = validateProfile(profile);
  if (errs.length) throw Object.assign(new Error(`invalid profile: ${errs.join(', ')}`), { status: 400 });
  const list = loadProfiles().filter((p) => p.id !== profile.id);
  list.push(profile);
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
  registerProfiles(list);
  return profile;
}

export function deleteProfile(id) {
  const list = loadProfiles().filter((p) => p.id !== id);
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
  registerProfiles(list);
  return { ok: true };
}

export const providers = () => { loadProfiles(); return allProviders(); };

// Reads the cover size from a printer's cover template PDF. Uses the bleed box (= trim box when
// the printer set none) of the first page, falling back to the media box.
export async function readCoverTemplate(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const page = doc.getPage(0);
  const media = page.getMediaBox();
  let box = media;
  try {
    const bleed = page.getBleedBox();
    if (bleed && bleed.width > 0 && bleed.width <= media.width + 0.01) box = bleed;
  } catch { /* no bleed box */ }
  const r = (v) => Math.round((v / PT_PER_MM) * 100) / 100;
  let trim = null;
  try { const t = page.getTrimBox(); if (t && (t.width < box.width - 0.5)) trim = { W: r(t.width), H: r(t.height) }; } catch { /* none */ }
  return { W: r(box.width), H: r(box.height), trim, pages: doc.getPageCount() };
}
