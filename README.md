<p align="center"><img src="build/icon.png" width="128" alt="Billerbook icon"></p>

<h1 align="center">Billerbook</h1>

<p align="center"><b>Lay out photo books fast. Print them anywhere.</b><br>
Open source · macOS app · works with Lightroom Classic or any folder · print-ready PDF for every print shop · MCP server for AI assistants</p>

<p align="center">
  <a href="https://github.com/tillheidrich/billerbook/releases/latest">Download for Mac</a> ·
  <a href="https://billerbook.heidrich-digital.de">Website</a> ·
  <a href="docs/mcp.md">AI / MCP</a> ·
  <a href="#deutsch">Deutsch</a>
</p>

![Billerbook editor with a panorama across a spread](docs/images/spread.jpg)

*Billerbook* is Low German for picture book. It is the tool I wanted after years of the same routine: pick photos in Lightroom, lay them out in Lightroom's Book module, export a PDF that never quite matched the printer, fix it in InDesign, and fight every crop by hand. Billerbook does the whole thing in one place and writes the PDF the print shop asks for.

## What it does

**One photo pool, several books.** Make the big hardcover for yourself and a shorter portrait softcover for the family from the same photos. Every thumbnail shows which edition already uses it, and the *Missing here* filter lists what is still left out, so the year in photos is actually complete.

**Layouts that adapt.** 23 page and spread layouts, all calculated from the page size. Copy a landscape hardcover into a portrait softcover and the pages re-flow instead of breaking. The auto grid keeps every photo's aspect ratio, so 3:2 photos are not squeezed into square templates.

**Cropping without the fiddling.** Drag inside a photo to move the crop, scroll to zoom. `F` switches between *fill the frame* and *show the whole photo*. `V` turns a photo into a full-bleed page. `Space` tries the next arrangement for the same photos. Smart crop finds the subject (saliency detection) and centres it before you touch anything.

**Free frames when you need them.** Turn any layout into free frames, then Alt+drag to move and drag the corner to resize. Frames snap to margins, centre and gutter.

**Lightroom Classic, read-only.** Billerbook reads the catalog (also while Lightroom is open), uses your collections as the photo pool, shows Lightroom's previews and picks up captions. Books made in Lightroom's Book module can be imported with their pages, photo positions and crops. Nothing is ever written back to the catalog.

**No Lightroom needed.** Any folder of JPEG, TIFF, PNG or WebP works. Capture date, star rating and caption come from EXIF/XMP/IPTC.

**Print-ready PDF.** Interior and cover as separate files with bleed, TrimBox/BleedBox, CMYK with an ICC output intent (e.g. FOGRA39) or RGB, resampling to the target resolution, output sharpening, page numbers, and a cover with spine and turn-in calculated from the print profile. The PDF is written page by page, so a 500-page book does not need gigabytes of memory.

**Preflight before you pay.** Empty frames, low resolution, missing print files, photos in the glue zone, page count and spine width are checked before export.

**Ask your AI to lay it out.** Billerbook ships an MCP server with 28 tools. Claude, Codex, Cursor or any other MCP client can create a project from a folder, fill pages, look at each spread as an image, fix what looks off, run preflight and export. Changes appear live in the app.

| | |
|---|---|
| ![Overview of all spreads](docs/images/overview.jpg) | ![Cover with spine and turn-in](docs/images/cover.jpg) |
| ![Portrait softcover edition from the same photos](docs/images/softcover.jpg) | ![Export dialog](docs/images/export.jpg) |

## Print shops

Billerbook writes standard print PDFs, so it works with any print shop that accepts PDF uploads. Print profiles hold the numbers that differ between shops: bleed, safety margin, glue zone and the cover formula.

| Profile | Status |
|---|---|
| WIRmachenDRUCK (hardcover and softcover, 12 formats) | verified against the shop's data sheets |
| Custom (any size, hardcover / softcover / layflat) | every value editable |

Want your print shop in the list? See [docs/print-profiles.md](docs/print-profiles.md). A profile needs a link to the shop's own specification.

## Install

**Mac:** download the DMG for Apple silicon or Intel from [Releases](https://github.com/tillheidrich/billerbook/releases/latest). The app is signed and notarized and updates itself.

**From source (macOS, Linux, Windows):** Node.js 22.13 or newer.

```bash
git clone https://github.com/tillheidrich/billerbook.git
cd billerbook
npm install
npm start            # opens http://localhost:4580
```

Projects live in `~/Library/Application Support/Billerbook` on macOS (`~/.billerbook` on Linux, `%APPDATA%\Billerbook` on Windows). Set `BILLERBOOK_DATA` to change it.

## Workflow with Lightroom Classic

1. Put the photos for the book into a collection.
2. In Billerbook: **Sources** → choose the catalog → tick the collection.
3. For printing, export that collection from Lightroom as full-size JPEG or TIFF into one folder (file names like the originals) and set it as the **export folder**. Until then Billerbook shows Lightroom's previews and preflight lists the photos without a print file.
4. Optional: import a book you already made in Lightroom's Book module as a new edition.

## Keyboard

| Key | Action |
|---|---|
| ← → | previous / next spread |
| Space | next arrangement for the photos on the page |
| F | fill frame ⇄ whole photo |
| V | photo as full-bleed page |
| 1 – 9 | layout with that many photos |
| A | auto grid |
| N | new page after |
| + / − | zoom inside the frame |
| Del | remove photo |
| Alt + drag | move a free frame |
| ⌘Z / ⇧⌘Z | undo / redo |

## AI / MCP

```json
{
  "mcpServers": {
    "billerbook": {
      "command": "/Applications/Billerbook.app/Contents/MacOS/Billerbook",
      "args": ["/Applications/Billerbook.app/Contents/Resources/app/mcp.mjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

From source use `"command": "node", "args": ["/path/to/billerbook/mcp.mjs"]`. The app shows the exact entry under **?**. Details and example prompts: [docs/mcp.md](docs/mcp.md).

## Development

```bash
npm test             # end-to-end: folder → layout → PDF (needs poppler-utils and qpdf for the checks)
npm run app          # run the Electron app from source
npm run dist:mac     # signed + notarized DMGs (see scripts/build-mac.sh)
```

The shared core in `public/lib/` (geometry, layouts, operations, print profiles, translations) runs in the browser, the server and the MCP server alike. `lib/` holds the Lightroom reader, photo pool and thumbnails, the streaming PDF writer and the preview renderer. See [CONTRIBUTING.md](CONTRIBUTING.md).

How Billerbook compares to Lightroom's Book module, BookWright, CEWE, Saal Digital, Mixbook and others, and which of their rules we adopted: [docs/competitors.md](docs/competitors.md).

## License

AGPL-3.0. You can use, change and share Billerbook freely. If you offer a modified version as a service, its source code has to be available too.

Demo photos in the screenshots: Till Heidrich.

---

## Deutsch

Billerbook ist ein quelloffenes Werkzeug für Fotobücher. Aus einem Bilderpool entstehen mehrere Ausgaben desselben Buchs, etwa ein dickes Hardcover quer und ein kürzeres Softcover hoch für die Verwandtschaft. An jedem Foto sieht man, in welchem Buch es steckt. Der Filter „Fehlen hier“ zeigt, was noch fehlt.

Lightroom Classic ist optional: Billerbook liest Sammlungen, Vorschauen und Bildunterschriften aus dem Katalog und übernimmt Bücher aus dem Buch-Modul. Ohne Lightroom reicht ein Bilderordner. Am Ende steht ein druckfertiges PDF mit Beschnitt, CMYK und Umschlag samt Rücken, für jede Druckerei, die PDF annimmt. Das Profil für WIRmachenDRUCK ist gegen deren Datenblätter geprüft.

Die Oberfläche gibt es auf Deutsch und Englisch. Download für den Mac unter [Releases](https://github.com/tillheidrich/billerbook/releases/latest), die App aktualisiert sich selbst.
