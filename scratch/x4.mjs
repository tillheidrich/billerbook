import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.BILLERBOOK_DATA = fs.mkdtempSync(path.join(os.tmpdir(),'x4-'));
const ops = await import('../public/lib/ops.js'); const { exportInterior } = await import('../lib/pdf.mjs');
const pr = ops.newProject('X'); const ed = ops.addEdition(pr,{provider:'wmd',format:'hc-a4-quer'}); ops.insertPages(pr, ed.id, 0, 2, 'text');
ops.setTextProps(pr, ed.id, {page:0}, 0, {value:'Titel'});
await exportInterior({ ed, pool:new Map(), project: pr, file: '/tmp/x4.pdf' });
