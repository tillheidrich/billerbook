import sharp from 'sharp';
const grey = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).jpeg().toBuffer();
const cmyk = await sharp(grey).toColourspace('cmyk').withIccProfile('cmyk').jpeg({ quality: 95 }).toBuffer();
const m = await sharp(cmyk).metadata(); console.log(m.space, m.channels, !!m.icc);
console.log('raw cmyk', [...(await sharp(cmyk).raw().toBuffer()).slice(0,4)]);
for (const v of [sharp(cmyk).toColourspace('srgb'), sharp(cmyk).withIccProfile('srgb'), sharp(cmyk).pipelineColourspace('cmyk').toColourspace('srgb')]) {
  try { console.log([...(await v.raw().toBuffer()).slice(0,4)]); } catch(e){console.log(e.message)}
}
const c2 = await sharp(grey).withIccProfile('cmyk').jpeg().toBuffer(); const m2=await sharp(c2).metadata(); console.log('c2', m2.space, [...(await sharp(c2).toColourspace('srgb').raw().toBuffer()).slice(0,3)]);
