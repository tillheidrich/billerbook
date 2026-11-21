import sharp from 'sharp';
import { PdfWriter } from '../lib/pdf.mjs';
import { execSync } from 'node:child_process';
const red = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#d02020' } }).toColourspace('cmyk').withIccProfile('cmyk').jpeg({ quality: 95 }).toBuffer();
const m = await sharp(red).metadata(); console.log('channels', m.channels, m.space);
for (const inv of [true, false]) {
  const w = new PdfWriter(`/tmp/c${inv}.pdf`);
  const id = inv ? w.image(red, 100, 100, true) : (() => { const i = w.alloc(); w.stream(i, '/Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /DCTDecode', red); return i; })();
  w.page({ wPt: 100, hPt: 100, trim: [0, 0, 100, 100], content: 'q 100 0 0 100 0 0 cm /Im0 Do Q', images: { Im0: id }, fonts: {} });
  w.finish({});
  execSync(`pdftoppm -r 10 -png /tmp/c${inv}.pdf /tmp/c${inv}`);
  const { data } = await sharp(`/tmp/c${inv}-1.png`).raw().toBuffer({ resolveWithObject: true });
  console.log('decode-invert', inv, 'rgb', data[0], data[1], data[2]);
}
