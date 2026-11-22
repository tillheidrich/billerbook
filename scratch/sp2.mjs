import sharp from 'sharp';
const grey = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).jpeg().toBuffer();
const neon = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00ff40' } }).jpeg().toBuffer();
for (const src of [grey, neon]) {
const cmyk = await sharp(src).toColourspace('cmyk').withIccProfile('cmyk').jpeg({ quality: 95 }).toBuffer();
const r = await sharp(cmyk).toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
console.log(r.info.channels, [...r.data.slice(0,3)]);
const r2 = await sharp(cmyk).toColourspace('srgb').jpeg().toBuffer(); console.log([...(await sharp(r2).raw().toBuffer()).slice(0,3)]);
}
