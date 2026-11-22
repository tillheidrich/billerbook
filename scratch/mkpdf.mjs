import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'; import fs from 'node:fs';
const doc = await PDFDocument.create();
const jpg = await doc.embedJpg(fs.readFileSync('/mnt/user-data/uploads/Digitalisierung-Strategie-etc/Fotobuch-Studio/.testbilder/demo/Tostedt-im-Winter-10-Januar-2026_20260110_L1053953_TH_150dpi.jpg'));
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let n = 0; n < 2; n++) {
  const page = doc.addPage([842, 595]);
  page.drawImage(jpg, { x: 60 + n * 300, y: 180, width: 420, height: 280 });
  page.drawText('Winter in Tostedt', { x: 60, y: 520, size: 28, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Zweiter Absatz, Zeile eins', { x: 60, y: 120, size: 11, font });
  page.drawText('Zweiter Absatz, Zeile zwei', { x: 60, y: 106, size: 11, font });
}
fs.writeFileSync('/tmp/ui/test.pdf', await doc.save());
