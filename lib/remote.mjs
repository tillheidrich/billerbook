// MCP over HTTP with OAuth 2.1, so ChatGPT and claude.ai can use Billerbook as a connector.
//
// Billerbook runs on the user's Mac. Remote clients reach it through a tunnel (for example
// `cloudflared tunnel --url`), which gives a public https address. Only three things are reachable
// through that address: the OAuth endpoints, the metadata documents and /mcp. The editor and the
// HTTP API stay on localhost. Every /mcp request from outside needs a bearer token.
//
// Approving a client needs a six-digit code that only the Billerbook app shows, so someone who
// finds the tunnel address cannot connect on their own.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rnd = (n = 32) => crypto.randomBytes(n).toString('base64url');
const now = () => Date.now();
const ACCESS_TTL = 60 * 60 * 1000;            // 1 hour
const REFRESH_TTL = 90 * 24 * 60 * 60 * 1000; // 90 days
const CODE_TTL = 2 * 60 * 1000;
const PAIR_TTL = 10 * 60 * 1000;

export class Remote {
  constructor(dataDir, { port }) {
    this.file = path.join(dataDir, 'remote.json');
    this.port = port;
    this.state = { clients: {}, tokens: [], publicUrl: null };
    try { this.state = { ...this.state, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch {}
    this.codes = new Map(); // auth codes, in memory only
    this.pair = null;       // { code, expires, tries }
    this.pairIssued = 0;    // time of the last new code (rate limit)
    this.pairFailures = 0;  // wrong codes since start, across all codes
    this.tunnel = null;
    this.audit = [];        // recent remote events, shown in the app (no secrets)
  }
  save() { fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), { mode: 0o600 }); }

  // ---------- public address ----------
  get publicUrl() { return this.state.publicUrl; }
  setPublicUrl(u) {
    if (u) {
      const url = new URL(u);
      if (url.protocol !== 'https:') throw new Error('public address must be https');
      this.state.publicUrl = url.origin;
    } else this.state.publicUrl = null;
    this.save();
  }
  isPublicHost(host) {
    if (!this.state.publicUrl || !host) return false;
    return new URL(this.state.publicUrl).host === host;
  }

  // ---------- pairing code shown in the app ----------
  // A new code needs a click in the app (the API only accepts same-origin calls) and at most one
  // per 10 seconds. After 20 wrong codes in total, remote pairing stays locked until restart.
  newPairing({ unlock = false } = {}) {
    // The user can lift the lock with a click in the app (same-origin only); outsiders cannot.
    if (unlock && this.pairFailures >= 20) { this.pairFailures = 0; this.log('pairing unlocked by the user'); }
    if (this.pairFailures >= 20) throw Object.assign(new Error('too many wrong codes; unlock pairing in Billerbook (Connect AI)'), { status: 423 });
    if (now() - this.pairIssued < 10_000 && this.pair) throw Object.assign(new Error('wait a few seconds before asking for a new code'), { status: 429 });
    this.pairIssued = now();
    this.pair = { code: String(crypto.randomInt(0, 1e6)).padStart(6, '0'), expires: now() + PAIR_TTL, tries: 0 };
    return { code: this.pair.code, expires: this.pair.expires };
  }
  checkPairing(code) {
    const p = this.pair;
    if (!p || p.expires < now() || p.tries >= 5 || this.pairFailures >= 20) return false;
    p.tries++;
    const given = Buffer.from(String(code ?? '').replace(/\D/g, '').padEnd(6, 'x').slice(0, 6));
    const ok = crypto.timingSafeEqual(given, Buffer.from(p.code));
    if (ok) this.pair = null; // one approval per code
    else this.pairFailures++;
    this.log(ok ? 'pairing ok' : 'pairing failed');
    return ok;
  }
  log(event, detail = '') {
    const d = String(detail).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 120);
    this.audit.unshift({ at: now(), event, detail: d });
    this.audit.length = Math.min(this.audit.length, 50);
    // stderr: with stdio MCP, stdout carries JSON-RPC and must stay clean.
    console.error(`[billerbook] [remote] ${event}${d ? ` ${d}` : ''}`);
  }

  // ---------- OAuth ----------
  metadata(base) {
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['billerbook'],
    };
  }
  resourceMetadata(base) {
    return { resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['billerbook'], bearer_methods_supported: ['header'], resource_name: 'Billerbook' };
  }
  register(body) {
    const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (!uris.length || uris.length > 10) throw Object.assign(new Error('redirect_uris required'), { status: 400, oauth: 'invalid_redirect_uri' });
    for (const u of uris) {
      const url = new URL(u);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw Object.assign(new Error('redirect_uri must be https'), { status: 400, oauth: 'invalid_redirect_uri' });
    }
    this.pruneClients();
    if (Object.keys(this.state.clients).length > 200) throw Object.assign(new Error('too many clients'), { status: 429 });
    const id = `bb_${rnd(16)}`;
    const name = String(body.client_name || 'MCP client').slice(0, 80);
    this.state.clients[id] = { redirect_uris: uris, name, created: now() };
    this.save();
    this.log('client registered', `${name} → ${new URL(uris[0]).host}`);
    return { client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
  }
  // Validates an authorization request; returns the client or throws.
  checkAuthorize(q) {
    const c = this.state.clients[q.client_id];
    if (!c) throw Object.assign(new Error('unknown client'), { status: 400 });
    if (!c.redirect_uris.includes(q.redirect_uri)) throw Object.assign(new Error('redirect_uri not registered'), { status: 400 });
    if (q.response_type !== 'code') throw Object.assign(new Error('response_type must be code'), { status: 400 });
    if (q.code_challenge_method !== 'S256' || !/^[\w-]{43,128}$/.test(q.code_challenge || '')) throw Object.assign(new Error('PKCE S256 required'), { status: 400 });
    return c;
  }
  issueCode(q) {
    const code = rnd(24);
    this.codes.set(sha(code), { client_id: q.client_id, redirect_uri: q.redirect_uri, challenge: q.code_challenge, resource: q.resource || null, expires: now() + CODE_TTL });
    return code;
  }
  token(form) {
    const err = (e, d) => Object.assign(new Error(d || e), { status: 400, oauth: e });
    this.prune();
    if (form.grant_type === 'authorization_code') {
      const key = sha(form.code || '');
      const c = this.codes.get(key);
      this.codes.delete(key); // single use
      if (!c || c.expires < now()) throw err('invalid_grant', 'code expired or unknown');
      if (c.client_id !== form.client_id || c.redirect_uri !== form.redirect_uri) throw err('invalid_grant', 'client or redirect_uri mismatch');
      if (!/^[\w.~-]{43,128}$/.test(String(form.code_verifier || ''))) throw err('invalid_grant', 'code_verifier must be 43-128 characters');
      const calc = crypto.createHash('sha256').update(String(form.code_verifier || '')).digest('base64url');
      if (calc !== c.challenge) throw err('invalid_grant', 'PKCE check failed');
      this.log('token issued', this.state.clients[c.client_id]?.name);
      return this.mint(c.client_id);
    }
    if (form.grant_type === 'refresh_token') {
      const h = sha(form.refresh_token || '');
      const t = this.state.tokens.find((x) => x.refresh === h);
      if (!t) {
        // A rotated refresh token used again means it was copied: end that whole token family.
        const used = (this.state.rotated || []).find((x) => x.refresh === h);
        if (used) { this.state.tokens = this.state.tokens.filter((x) => x.family !== used.family); this.save(); this.log('refresh token reused, family revoked', used.client_id); }
        throw err('invalid_grant', 'refresh token invalid');
      }
      if (t.refreshExpires < now() || form.client_id !== t.client_id) throw err('invalid_grant', 'refresh token invalid');
      this.state.tokens = this.state.tokens.filter((x) => x !== t); // rotate
      this.state.rotated = [{ refresh: t.refresh, family: t.family, client_id: t.client_id, at: now() }, ...(this.state.rotated || [])].slice(0, 500);
      return this.mint(t.client_id, t.family);
    }
    throw err('unsupported_grant_type');
  }
  mint(clientId, family = rnd(9)) {
    const access = rnd(32), refresh = rnd(32);
    this.state.tokens.push({ access: sha(access), refresh: sha(refresh), family, client_id: clientId, expires: now() + ACCESS_TTL, refreshExpires: now() + REFRESH_TTL, created: now() });
    this.save();
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: 'billerbook' };
  }
  checkBearer(header) {
    const m = /^Bearer\s+(\S+)$/i.exec(header || '');
    if (!m) return null;
    const h = sha(m[1]);
    const t = this.state.tokens.find((x) => x.access === h && x.expires > now());
    return t ? { client: this.state.clients[t.client_id]?.name || t.client_id } : null;
  }
  prune() {
    const before = this.state.tokens.length;
    this.state.tokens = this.state.tokens.filter((t) => t.refreshExpires > now() && this.state.clients[t.client_id]);
    for (const [k, c] of this.codes) if (c.expires < now()) this.codes.delete(k);
    if (this.state.tokens.length !== before) this.save();
  }
  // Clients that registered but never got a token are dropped after a day.
  pruneClients() {
    const day = 24 * 60 * 60 * 1000;
    let changed = false;
    for (const [id, c] of Object.entries(this.state.clients)) {
      if (now() - c.created > day && !this.state.tokens.some((t) => t.client_id === id)) { delete this.state.clients[id]; changed = true; }
    }
    if (changed) this.save();
  }
  connections() {
    this.prune();
    return Object.entries(this.state.clients).map(([id, c]) => ({ id, name: c.name, created: c.created, active: this.state.tokens.some((t) => t.client_id === id) }));
  }
  revoke(clientId) {
    if (clientId === '*') { this.state.clients = {}; this.state.tokens = []; } else {
      delete this.state.clients[clientId];
      this.state.tokens = this.state.tokens.filter((t) => t.client_id !== clientId);
    }
    this.save();
  }

  // ---------- tunnel (cloudflared quick tunnel, optional) ----------
  cloudflared() {
    for (const p of ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared']) if (fs.existsSync(p)) return p;
    try { return execFileSync('which', ['cloudflared']).toString().trim() || null; } catch { return null; }
  }
  startTunnel() {
    if (this.tunnel) return Promise.resolve({ url: this.state.publicUrl });
    const bin = this.cloudflared();
    if (!bin) return Promise.reject(Object.assign(new Error('cloudflared is not installed (brew install cloudflared)'), { status: 501 }));
    return new Promise((resolve, reject) => {
      const p = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${this.port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      this.tunnel = p;
      const fail = (e) => { clearTimeout(timer); p.kill(); this.tunnel = null; reject(e); };
      const timer = setTimeout(() => fail(new Error('tunnel did not start within 30 s')), 30000);
      p.on('error', fail);
      const onData = (d) => {
        const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(d.toString());
        if (m && this.tunnel === p) { clearTimeout(timer); this.setPublicUrl(m[0]); this.log('tunnel started', m[0]); resolve({ url: m[0] }); }
      };
      p.stdout.on('data', onData); p.stderr.on('data', onData);
      p.on('exit', () => { this.tunnel = null; if (this.state.publicUrl?.endsWith('trycloudflare.com')) this.setPublicUrl(null); });
    });
  }
  stopTunnel() { this.tunnel?.kill(); this.tunnel = null; if (this.state.publicUrl?.endsWith('trycloudflare.com')) this.setPublicUrl(null); }
  status() { return { publicUrl: this.state.publicUrl, tunnel: !!this.tunnel, cloudflared: !!this.cloudflared(), connections: this.connections(), locked: this.pairFailures >= 20, events: this.audit.slice(0, 20) }; }
}

// Consent page: plain HTML, no scripts, the form posts back to /oauth/authorize.
export function consentPage(q, client, { error = '', lang = 'de' } = {}) {
  const de = lang !== 'en';
  let target = '';
  try { target = new URL(q.redirect_uri).host; } catch {}
  const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  const hidden = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']
    .map((k) => (q[k] != null ? `<input type="hidden" name="${k}" value="${esc(q[k])}">` : '')).join('');
  return `<!doctype html><html lang="${de ? 'de' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Billerbook</title>
<style>body{font:15px/1.5 -apple-system,system-ui,sans-serif;background:#f4f3f0;color:#1f1e1c;display:grid;place-items:center;min-height:100dvh;margin:0}
main{background:#fff;border:1px solid #e2dfd8;border-radius:12px;padding:28px;max-width:380px;width:calc(100% - 32px)}h1{font-size:18px;margin:0 0 8px}
p{margin:0 0 16px;color:#55524c}input[name=pair]{font:600 24px ui-monospace,monospace;letter-spacing:.3em;width:100%;padding:10px;border:1px solid #cfcac0;border-radius:8px;box-sizing:border-box}
button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:8px;background:#d9a441;color:#1f1e1c;font-weight:600;font-size:15px;cursor:pointer}.err{color:#b3261e}</style></head>
<body><main><h1>${de ? `${esc(client.name)} möchte Billerbook steuern` : `${esc(client.name)} wants to control Billerbook`}</h1>
<p>${de ? 'Der Assistent kann dann deine Fotobuch-Projekte lesen und ändern und Dateien exportieren. Gib den sechsstelligen Code ein, den Billerbook unter „KI verbinden“ zeigt.' : 'The assistant can then read and change your photo book projects and export files. Enter the six-digit code Billerbook shows under "Connect AI".'}</p>
<p>${de ? 'Freigabe geht an' : 'Approval goes to'} <strong>${esc(target)}</strong>. ${de ? 'Steht da nicht die Adresse deines Assistenten (z. B. claude.ai oder chatgpt.com), brich ab.' : 'If this is not your assistant\'s address (for example claude.ai or chatgpt.com), stop here.'}</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/oauth/authorize">${hidden}<input name="pair" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus aria-label="Code"><button>${de ? 'Erlauben' : 'Allow'}</button></form></main></body></html>`;
}

// Claude Desktop: add Billerbook to claude_desktop_config.json (with a backup of the old file).
export function installClaudeDesktop(mcp) {
  const dir = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude')
    : process.platform === 'win32' ? path.join(process.env.APPDATA || os.homedir(), 'Claude') : path.join(os.homedir(), '.config', 'Claude');
  const file = path.join(dir, 'claude_desktop_config.json');
  let cfg = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    try { cfg = JSON.parse(raw); } catch { throw Object.assign(new Error(`${file} is not valid JSON; not changed`), { status: 409 }); }
    const bak = `${file}.billerbook-backup`;
    if (!fs.existsSync(bak)) fs.writeFileSync(bak, raw); // keep the very first original
  }
  fs.mkdirSync(dir, { recursive: true });
  cfg.mcpServers = { ...(cfg.mcpServers || {}), billerbook: mcp };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return { file, note: 'Restart Claude Desktop.' };
}
