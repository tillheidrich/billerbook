import assert from 'node:assert/strict';
// Checks from the security review (G3): CSRF, pairing brute force, colour injection, SSRF, uploads.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.BILLERBOOK_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-'));
const { start } = await import('../server.mjs');
const { graphicSvg } = await import('../public/lib/graphics.js');
const { isPublicAddress } = await import('../lib/htmlimport.mjs');
const srv = await start({ port: 0 }); const port = srv.address().port;
const L = `http://127.0.0.1:${port}`;
const post = (p, body, headers = {}) => fetch(`${L}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

// 1 CSRF: a foreign page may not change anything; text/plain bodies are no JSON.
assert.equal((await post('/api/projects', { name: 'x', folder: '/etc' }, { origin: 'https://evil.example' })).status, 403);
assert.equal((await post('/api/remote/pair', {}, { origin: 'https://evil.example' })).status, 403);
assert.equal((await post('/api/remote/pair', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
assert.equal((await post('/api/remote/pair', {}, { origin: 'null' })).status, 403);
assert.equal((await post('/api/remote/pair', {}, { origin: `http://localhost:${port + 1}` })).status, 403, 'other local port');
const plain = await fetch(`${L}/api/projects`, { method: 'POST', headers: { 'content-type': 'text/plain; charset=application/json', origin: L }, body: '{"name":"y"}' });
assert.notEqual(plain.status, 200, 'text/plain is not parsed as JSON');
const reg = await fetch(`${L}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://a.example/cb'] }) });
assert.equal(reg.headers.get('access-control-allow-origin'), null, 'no CORS on localhost');
const pr = await (await post('/api/projects', { name: 'Sicher' }, { origin: L })).json();
assert.ok(pr.id, 'same origin works');

// 2 Pairing: no burst of new codes, global lock after 20 wrong codes.
const r1 = await post('/api/remote/pair', {}); assert.equal(r1.status, 200);
assert.equal((await post('/api/remote/pair', {})).status, 429, 'second code within 10 s');

// 4 Colour injection: refused on save, escaped in the SVG.
const evil = '"/><img src=x onerror=alert(1)>';
const op = await post(`/api/project/${pr.id}/op`, { op: 'setCover', args: { edition: pr.editions[0].id, bgGraphic: { id: 'frame-thin', color: evil } } });
assert.equal(op.status, 400, 'invalid colour refused');
assert.ok(!graphicSvg('frame-thin', 100, 100, { color: evil, bg: evil, opacity: '1"><x' }).includes('<img'));
assert.ok(!graphicSvg('frame-thin', 100, 100, { opacity: '1"><x' }).includes('<x'));

// 6 SSRF: special addresses are not public; the import refuses them.
for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::', '100.64.0.1', '198.18.0.1', '169.254.169.254', 'fd12::1', '224.0.0.1']) assert.equal(isPublicAddress(a), false, a);
assert.equal(isPublicAddress('1.1.1.1'), true);
for (const src of ['http://127.0.0.1:1/', 'http://[::ffff:127.0.0.1]/', 'http://localhost/', '/etc/hosts']) {
  const r = await post(`/api/project/${pr.id}/import-html`, { source: src });
  assert.ok(r.status >= 400, src);
}

// 12 Uploads: images only.
const up = (name, body) => fetch(`${L}/api/project/${pr.id}/upload?name=${encodeURIComponent(name)}`, { method: 'PUT', body });
assert.equal((await up('x.terminal', 'echo hi')).status, 400);
assert.equal((await up('x.jpg', 'not an image')).status, 400);

// 17 Headers
const idx = await fetch(`${L}/`);
assert.equal(idx.headers.get('x-frame-options'), 'DENY');
assert.equal(idx.headers.get('x-content-type-options'), 'nosniff');
assert.ok(idx.headers.get('content-security-policy').includes("script-src 'self'"));
// N1: blocked or broken addresses reject; they never throw outside the promise (process stays up)
const { fetchLimited } = await import('../lib/htmlimport.mjs');
await assert.rejects(fetchLimited('http://127.0.0.1:1/x', 1000, '*/*'));
await assert.rejects(fetchLimited('http://[', 1000, '*/*'));
// N2: remote events go to stderr; stdout stays clean for stdio MCP
const writes = []; const orig = process.stdout.write.bind(process.stdout);
process.stdout.write = (c, ...r) => { writes.push(String(c)); return orig(c, ...r); };
await fetch(`${L}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'X\n[billerbook] fake', redirect_uris: ['https://e.example/cb'] }) });
process.stdout.write = orig;
assert.ok(!writes.some((w) => w.includes('[remote]')), 'no remote log on stdout');
// N3: ISBN with markup is refused and never reaches the label
const { isbnLabel } = await import('../public/lib/barcode.js');
assert.ok(!isbnLabel('978-3-16-148410-0<b>', '9783161484100').includes('<'));
const badIsbn = await post(`/api/project/${pr.id}/op`, { op: 'setCover', args: { edition: pr.editions[0].id, barcode: { mode: 'isbn', isbn: '978<b>' } } });
assert.equal(badIsbn.status, 400);
console.log('ok security: CSRF, pairing throttle, colour injection, SSRF ranges, uploads, headers, redirect errors, clean stdout, ISBN');
srv.close(); process.exit(0);
