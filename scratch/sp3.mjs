import sharp from 'sharp';
for (const hex of ['#808080','#00ff40','#c8503c','#ffffff','#202020']) {
const src = await sharp({ create: { width: 8, height: 8, channels: 3, background: hex } }).png().toBuffer();
const t = await sharp(src).withIccProfile('cmyk').tiff().toBuffer();
const m = await sharp(t).metadata();
const r = await sharp(t).toColourspace('srgb').raw().toBuffer();
const t2 = await sharp(src).toColourspace('cmyk').tiff().toBuffer();
const r2 = await sharp(t2).toColourspace('srgb').raw().toBuffer();
console.log(hex, m.space, [...r.slice(0,3)], [...r2.slice(0,3)]);
}
