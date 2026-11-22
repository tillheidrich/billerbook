import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light' })).newPage();
await p.goto('http://localhost:4610/#k8t7onxc'); await p.waitForTimeout(3000);
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/ui/14-pdfpages.png', clip: { x: 300, y: 250, width: 1020, height: 420 } });
b.close();
