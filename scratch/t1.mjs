import sharp from 'sharp';
import { softProof, renderGraphic, applyTone } from '/home/claude/fbs/lib/imagefx.mjs';
import { GRAPHICS } from '/home/claude/fbs/public/lib/graphics.js';
const img = await sharp({create:{width:400,height:300,channels:3,background:{r:0,g:220,b:60}}}).jpeg().toBuffer();
const p = await softProof(img,'cmyk',{gamut:true}); console.log('proof', p.length, p.marked);
const t = await applyTone(sharp(img),'sepia',0.6).jpeg().toBuffer(); console.log('tone', (await sharp(t).stats()).channels.map(c=>Math.round(c.mean)));
for (const g of GRAPHICS){ const t0=Date.now(); const b = await renderGraphic({id:g.id}, 210, 297, {ppi:150, bleed:3}); const m=await sharp(b).metadata(); console.log(g.id, m.width, m.height, Date.now()-t0,'ms'); }
