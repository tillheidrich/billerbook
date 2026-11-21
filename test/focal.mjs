import sharp from 'sharp';
process.env.BILLERBOOK_CACHE = '/tmp/fbs-focal-cache'; process.env.BILLERBOOK_DATA = '/tmp/fbs-focal-data';
const { focalPoint } = await import('../lib/store.mjs');
const { placement } = await import('../public/lib/geometry.js');
// grey noise-free background, a detailed red/white subject top-right
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#7a8a99"/>
<g transform="translate(900,200)">${Array.from({length:40},(_,i)=>`<circle cx="${(i%8)*12-40}" cy="${Math.floor(i/8)*12-30}" r="5" fill="${i%2?'#e33':'#fff'}"/>`).join('')}</g></svg>`;
const f = '/tmp/focal-test.jpg';
await sharp(Buffer.from(svg)).jpeg().toFile(f);
const fp = await focalPoint(f);
console.log('focal', fp, 'expected ≈ x 0.75, y 0.25');
const pl = placement(100, 100, 1200, 800, {}, fp);
console.log('square crop of landscape → ox', pl.ox.toFixed(2), '(1 = right edge)');
