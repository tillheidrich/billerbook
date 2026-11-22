import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await p.goto('http://localhost:4610/#k8t7onxc'); await p.waitForTimeout(3500);
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/ui/1-spread.png' });
// select caption text
const t = await p.$$('.text-edit'); console.log('text frames', t.length);
if (t.length) { await t[t.length - 1].click(); await p.waitForTimeout(800); }
await p.screenshot({ path: '/tmp/ui/2-text.png' });
await p.keyboard.press('Escape');
// select image on page 2 → tone row
const fr = await p.$$('.frame.has'); if (fr.length) { await fr[0].click(); await p.waitForTimeout(1500); }
await p.screenshot({ path: '/tmp/ui/3-frame.png' });
await p.keyboard.press('Shift+P'); await p.waitForTimeout(3000);
await p.screenshot({ path: '/tmp/ui/4-proof.png' });
await p.keyboard.press('p'); await p.waitForTimeout(500);
await p.click('#exportBtn'); await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/ui/5-export.png', fullPage: true });
await p.keyboard.press('Escape');
b.close();
