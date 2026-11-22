// Import a web page or HTML file as book pages: headings become chapter pages, photos become
// plates with their caption, paragraphs become text pages. Works for blog posts (WordPress,
// Ghost, Astro …) and for Billerbook's own HTML export.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import dnsCb from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

const MAX_HTML = 8 << 20, MAX_IMG = 60 << 20, MAX_IMAGES = 400;
const decode = (s) => String(s || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
const attr = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? (m[2] ?? m[3] ?? m[4]) : null; };

// Only public http(s) addresses: no localhost, no private or special networks (the import runs on
// the user's Mac, next to the router, NAS and other local services). The address is checked inside the
// connection's own DNS lookup, so a name cannot resolve to a public address for the check and to a
// local one for the request. Redirects are followed by hand, each hop checked again.
const BLOCK4 = new net.BlockList(), BLOCK6 = new net.BlockList();
for (const [a, n] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) BLOCK4.addSubnet(a, n, 'ipv4');
for (const [a, n] of [['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) BLOCK6.addSubnet(a, n, 'ipv6');
BLOCK6.addAddress('::1', 'ipv6'); BLOCK6.addAddress('::', 'ipv6');
export function isPublicAddress(ip) {
  const v = net.isIP(ip);
  if (!v) return false;
  return v === 4 ? !BLOCK4.check(ip, 'ipv4') : !BLOCK6.check(ip, 'ipv6');
}
function checkedLookup(host, opts, cb) {
  dnsCb.lookup(host, { all: true }, (err, list) => {
    if (err) return cb(err);
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || !list.length) return cb(Object.assign(new Error('local addresses are not allowed'), { code: 'EBLOCKED' }));
    if (opts?.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}
function assertPublicUrl(u) {
  const url = new URL(u);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only http and https');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicAddress(host)) throw new Error('local addresses are not allowed');
  if (/^(localhost|.*\.local|.*\.localhost|.*\.internal)$/i.test(host)) throw new Error('local addresses are not allowed');
  return url;
}
export async function fetchLimited(u, limit, accept, hops = 0) {
  const url = assertPublicUrl(u); // throws → rejected promise (async)
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { lookup: checkedLookup, timeout: 15_000, headers: { 'user-agent': 'Billerbook (photo book import)', accept } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (hops >= 5) return reject(new Error('too many redirects'));
        // Everything that can throw stays inside the promise: a bad or blocked Location rejects
        // the import instead of crashing the process.
        try { return resolve(fetchLimited(new URL(res.headers.location, url).toString(), limit, accept, hops + 1)); } catch (e) { return reject(e); }
      }
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(new Error(`${res.statusCode} for ${u}`)); }
      if (Number(res.headers['content-length'] || 0) > limit) { res.destroy(); return reject(new Error('file too large')); }
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > limit) { res.destroy(); reject(new Error('file too large')); } else chunks.push(c); });
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: String(res.headers['content-type'] || '') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    setTimeout(() => req.destroy(new Error('timeout')), 60_000).unref();
  });
}

// Largest candidate from srcset, else src (also lazy-loading attributes).
function imageUrl(tag, baseUrl) {
  const set = attr(tag, 'srcset') || attr(tag, 'data-srcset');
  let best = null, bestW = 0;
  if (set) for (const part of set.split(',')) {
    const [u, w] = part.trim().split(/\s+/);
    const n = parseInt(w, 10) || 1;
    if (u && n >= bestW) { best = u; bestW = n; }
  }
  const src = best || attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src');
  if (!src || src.startsWith('data:')) return null;
  try { return new URL(src, baseUrl).toString(); } catch { return null; }
}

// Blocks in reading order: { kind: 'heading'|'text'|'image', text, url, caption }
export function parseHtml(html, baseUrl) {
  // Prefer <article>, but themes also use small <article> elements for teasers: take the
  // candidate that carries the most images (ties go to <article>).
  let body = html, bestImgs = -1;
  for (const tag of ['article', 'main']) {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
    if (!m) continue;
    const n = (m[1].match(/<img\b/gi) || []).length;
    if (n > bestImgs) { body = m[1]; bestImgs = n; }
  }
  body = body.replace(/<(script|style|noscript|nav|footer|header|aside|form|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '');
  const blocks = [];
  const re = /<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>|<figure[^>]*>([\s\S]*?)<\/figure>|<img\b[^>]*>|<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(body))) {
    if (m[1]) {
      const t = decode(m[2]);
      // Themes put "related posts" and comment sections into the same container: stop there.
      if (/^(you might also like|related( posts)?|more posts|weitere beiträge|das könnte dich auch interessieren|ähnliche beiträge|kommentare|comments|leave a reply)\b/i.test(t)) break;
      if (t) blocks.push({ kind: 'heading', text: t });
      continue;
    }
    if (m[3] != null) {
      const cap = decode((/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(m[3]) || [])[1] || '');
      const imgs = m[3].match(/<img\b[^>]*>/gi) || [];
      for (const tag of imgs) { const u = imageUrl(tag, baseUrl); if (u) blocks.push({ kind: 'image', url: u, caption: cap || decode(attr(tag, 'alt')) }); }
      continue;
    }
    if (m[0].startsWith('<img')) { const u = imageUrl(m[0], baseUrl); if (u) blocks.push({ kind: 'image', url: u, caption: decode(attr(m[0], 'alt')) }); continue; }
    // Paragraphs can hold images (page builders put galleries inside <p>): keep their order.
    for (const part of m[4].split(/(<img\b[^>]*>)/i)) {
      if (/^<img\b/i.test(part)) { const u = imageUrl(part, baseUrl); if (u) blocks.push({ kind: 'image', url: u, caption: decode(attr(part, 'alt')) }); continue; }
      const t = decode(part);
      if (t && t.length > 1) blocks.push({ kind: 'text', text: t });
    }
  }
  // Skip tiny images (icons, tracking pixels) by URL hints.
  return { title, blocks: blocks.filter((b) => b.kind !== 'image' || !/(\bicon|logo|avatar|emoji|gravatar|pixel|spinner)/i.test(b.url)) };
}

// Loads a page (URL or local .html) and its images into dir. Returns blocks with local files.
// maxImages: take that many photos, evenly spread over the page (a gallery of 90 becomes 8 plates).
export async function loadHtmlSource(source, dir, { maxImages = 0 } = {}) {
  let html, baseUrl;
  if (/^https?:\/\//i.test(source)) {
    const r = await fetchLimited(source, MAX_HTML, 'text/html');
    html = r.buf.toString('utf8'); baseUrl = source;
  } else {
    if (!/\.html?$/i.test(source)) throw new Error('only .html files or https URLs');
    html = await fsp.readFile(source, 'utf8'); baseUrl = `file://${path.resolve(source)}`;
  }
  let { title, blocks } = parseHtml(html, baseUrl);
  if (maxImages > 0) {
    const imgs = blocks.filter((b) => b.kind === 'image');
    if (imgs.length > maxImages) {
      const keep = new Set(Array.from({ length: maxImages }, (_, i) => imgs[Math.round((i * (imgs.length - 1)) / Math.max(1, maxImages - 1))]));
      blocks = blocks.filter((b) => b.kind !== 'image' || keep.has(b));
    }
  }
  await fsp.mkdir(dir, { recursive: true });
  let n = 0;
  const seen = new Map();
  for (const b of blocks) {
    if (b.kind !== 'image') continue;
    if (++n > MAX_IMAGES) { b.skip = true; continue; }
    if (seen.has(b.url)) { b.file = seen.get(b.url); continue; }
    try {
      let buf;
      if (b.url.startsWith('file://')) {
        const f = decodeURIComponent(new URL(b.url).pathname);
        if (!path.resolve(f).startsWith(path.dirname(path.resolve(source)) + path.sep)) throw new Error('outside the page folder');
        buf = await fsp.readFile(f);
      } else {
        const r = await fetchLimited(b.url, MAX_IMG, 'image/*');
        if (!/^image\//.test(r.type)) throw new Error('not an image');
        buf = r.buf;
      }
      const ext = (path.extname(new URL(b.url).pathname).toLowerCase().match(/^\.(jpe?g|png|webp|tiff?|heic|avif)$/) || ['.jpg'])[0];
      const name = `${String(seen.size + 1).padStart(3, '0')}-${crypto.createHash('sha1').update(b.url).digest('hex').slice(0, 8)}${ext}`;
      b.file = path.join(dir, name);
      fs.writeFileSync(b.file, buf);
      seen.set(b.url, b.file);
    } catch (e) { b.skip = true; b.error = e.message; }
  }
  return { title, blocks: blocks.filter((b) => !b.skip), failed: blocks.filter((b) => b.skip && b.kind === 'image').length };
}

// Blocks → pages (heading → chapter page, text → canon text page, image → plate with caption).
export function blocksToPages(blocks, newPage) {
  const pages = [];
  let text = [], heading = null;
  const flushText = () => {
    if (!text.length) return;
    const p = newPage('text-kanon', []);
    p.texts = [{ value: heading || '' }, { value: text.join('\n\n') }];
    pages.push(p); text = []; heading = null;
  };
  for (const b of blocks) {
    if (b.kind === 'heading') {
      flushText();
      heading = b.text;
      const p = newPage('kapitel', []);
      p.texts = [{ value: b.text }, { value: '' }];
      pages.push(p);
      heading = null;
    } else if (b.kind === 'text') {
      text.push(b.text);
      if (text.join(' ').length > 1400) flushText();
    } else if (b.kind === 'image' && b.file) {
      flushText();
      const p = newPage(b.caption ? 'tafel-legende' : 'tafel', [{ key: `f:${b.file}` }]);
      if (b.caption) p.texts = [{ value: b.caption }];
      pages.push(p);
    }
  }
  flushText();
  return pages;
}
