// The Mac app imports server.mjs from Electron, where process.argv has no script path.
// 0.9.0–0.13.1 crashed on that first start when no other Billerbook server was running.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-startup-'));
const script = `
process.argv.length = 1;
const { start } = await import(${JSON.stringify(pathToFileURL(path.join(root, 'server.mjs')).href)});
const srv = await start({ port: 0 });
const r = await fetch('http://127.0.0.1:' + srv.address().port + '/api/system');
const j = await r.json();
if (j.app !== 'Billerbook') throw new Error('unexpected /api/system answer');
srv.close(); process.exit(0);
`;
execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, BILLERBOOK_DATA: data }, stdio: 'inherit', timeout: 60000 });
fs.rmSync(data, { recursive: true, force: true });
console.log('ok - server starts when imported without a script argument (Mac app first start)');
