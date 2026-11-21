# How other photo book tools work, and what Billerbook takes from them

Research from November 2026. Sources are the vendors' own documentation and help pages, independent reviews and user forums (Adobe Community, Lightroom Queen). Forum posts are qualitative signals from individual users, not statistics.

## The tools

| Tool | Who it is for | Print shop | Output |
|---|---|---|---|
| Lightroom Classic Book module | photographers already in Lightroom | Blurb only, or PDF/JPEG | PDF without bleed control for other printers |
| Blurb BookWright | Blurb customers | Blurb only | PDF for Blurb |
| CEWE Fotowelt (also Pixum, dm, WhiteWall) | consumers | CEWE family only | order upload |
| Saal Digital | consumers and pros | Saal only (accepts PDFs from InDesign/Photoshop) | order upload |
| Mixbook / Shutterfly | US consumers | own | order |
| PrestoPhoto | Mac users | own (accepts PDF) | order, PDF/JPG export |
| InDesign / Affinity Publisher | designers | any | anything, but everything by hand |
| fotobuch (open source, Rust) | technical users | any (tested with Saal Digital) | automatic layout to PDF |

## Business rules we found (and our decision)

Each rule is written as observed behaviour, then what Billerbook does.

### Layout and placement

1. **Auto layout fills the whole book from the selection** (Lightroom, Mixbook Auto-Create, CEWE assistant). Lightroom applies one preset to every page and can only be used sensibly at the start.
   Billerbook: `auto_layout` appends or replaces, breaks pages at time gaps, gives top-rated photos their own page, can be limited to photos not yet placed in this edition.
2. **Space bar proposes a new layout for the page** (CEWE).
   Billerbook: `Space` cycles through justified-grid variants for the same photos or through layouts with the same photo count.
3. **Templates force aspect ratios.** Lightroom's templates are mostly not 3:2, so 3:2 photos get cropped (Adobe Community, 2018 thread).
   Billerbook: the auto grid keeps each photo's aspect ratio. Fixed layouts crop, with smart crop and manual adjustment.
4. **Cells cannot be resized freely** in the Lightroom Book module, one of the most requested features in Adobe's forum.
   Billerbook: any page can be turned into free frames with move, resize and snapping.
5. **Faces/subjects are centred automatically** (CEWE "Köpfe mittig").
   Billerbook: saliency-based focal point per photo, used as the default crop until you move it yourself.
6. **Used photos are marked** (Mixbook green check mark).
   Billerbook: coloured dots per edition plus filters *missing here*, *nowhere*, *placed*.
7. **Text boxes fill from photo metadata** (Lightroom: title, caption, file name).
   Billerbook: captions from Lightroom, XMP description or IPTC caption fill empty caption frames on request.
8. **Page numbers** (Lightroom, BookWright).
   Billerbook: off, outside bottom or centre bottom; hidden on full-bleed and spread pages.

### Output

9. **Lightroom's PDF export does not produce the trim + bleed size other printers ask for** (Adobe Community: 8×10 book exported at the wrong page size).
   Billerbook: every page is written at trim + bleed with TrimBox and BleedBox; frames touching the trim are extended into the bleed automatically.
10. **Lightroom PDF settings: JPEG quality, colour profile, resolution, sharpening.**
    Billerbook: target ppi, CMYK with ICC profile or RGB, output sharpening (low/standard/high), quality fixed at 92 for print.
11. **Blurb's PDF checklist: create the cover last, once the page count is known.**
    Billerbook: the spine width is an edition setting with an estimate from the page count; preflight warns until the print shop's value is entered.
12. **Auto-layout in Lightroom is limited to 240 pages for Blurb.**
    Billerbook: no page limit; the PDF writer streams page by page.

### Ecosystem

13. **Every vendor tool locks you to its own printing.** Lightroom's Book module has been Blurb-only since 2012; the request to open it to other printers has been open in Adobe's forum since 2014.
    Billerbook: print profiles, any shop that accepts PDF.
14. **Projects can move between app and desktop** (CEWE).
    Billerbook: projects are plain JSON files; the MCP server lets an AI work on the same project while the app shows the changes.
15. **AI selects and arranges photos** (CEWE, Saal AI, Mixbook Story Mode, posterXXL Smart Assistant).
    Billerbook: no built-in cloud AI. Instead an MCP server, so you pick the assistant (Claude, Codex, local models) and it can look at each spread and correct it.

## Feature parity with Lightroom's Book module and Blurb BookWright (0.10)

| Feature | Lightroom Book module | Blurb BookWright | Billerbook |
|---|---|---|---|
| Auto layout from a selection | yes (presets) | – | yes, with time breaks, star rating and "only missing photos" |
| Page layout templates | yes | yes | 23 layouts, re-flow on format change |
| Save own page layouts | yes ("custom pages") | yes | yes (*Save as my layout*) |
| Copy / paste a page layout | yes | – | yes, also to a range or all pages with the same photo count |
| Duplicate page | – | yes | yes (⌘D), spreads stay whole |
| Free placement of frames | no (cells fixed) | yes | yes, with snapping |
| Zoom / move photo in frame | yes | yes | yes, plus smart crop |
| Cell padding / page margin | yes | yes | margin and gap per edition and per page |
| Page background colour | yes | yes | yes |
| Background photo with opacity | yes ("graphic") | yes | yes |
| Built-in background graphics | yes | yes | no |
| Text from metadata | yes | – | yes |
| Text style presets | yes | yes | font family and roles only (open) |
| Page numbers, hide per page | yes | yes | yes |
| Guides (bleed, safe area) | yes | yes | yes |
| Several editions from one photo pool | no | no | yes |
| Printers | Blurb, or PDF/JPEG | Blurb only | any printer that takes PDF; 8 profiles plus own profiles |
| Spine from page count and paper | Blurb only | Blurb only | formula, table, template or entered value |
| Interior as spreads | – | – | yes |
| JPEG export of pages | yes | – | no (only the MCP spread preview) |
| E-book export | – | yes | no |

## Gaps we closed in 0.9

Smart crop, space-bar variants, free frames with snapping, captions from metadata, page numbers, output sharpening. Each has an acceptance test in `test/` or the UI test run.

## Open ideas

- duplicate and blur detection before auto layout (CEWE, posterXXL)
- background graphics and textures (Lightroom)
- more print profiles with verified data (Saal Digital, Blurb PDF to Book, PrestoPhoto)
- spell check for captions (Mixbook tested negative here, but it is still useful)

## Sources

- Adobe: [Create photo books in Lightroom Classic](https://helpx.adobe.com/lightroom-classic/desktop/photo-books/create-photo-book.html)
- Adobe Community: [Alternative vendors to Blurb in Book module](https://community.adobe.com/feature-requests-676/p-alternative-vendors-to-blurb-in-book-module-665006), [alternative for 3:2 photos](https://community.adobe.com/t5/lightroom-classic-discussions/alternative-to-blurb-pdf-for-books-which-properly-supports-3-2/td-p/10175553), [Export Book to PDF with bleed](https://community.adobe.com/t5/lightroom-classic-discussions/how-to-quot-export-book-to-pdf-quot-with-quot-bleed-quot/m-p/9570750/highlight/true), [custom templates and sizes](https://community.adobe.com/t5/lightroom-classic-ideas/p-ability-to-create-custom-book-templates-sizes-from-scratch/idi-p/12249427/page/2)
- Lightroom Queen forum: [LR Book module vs BookWright](https://www.lightroomqueen.com/community/threads/lr-c-book-module-vs-bookwright.46007/)
- Blurb: [BookWright features](https://www.blurb.com/blog/new-bookwright-features), [PDF to Book](https://www.blurb.co.uk/pdf-to-book)
- Mixbook: [Auto-Create and Auto-Layout](https://www.mixbook.com/inspiration/summer-photo-book-tips-mixbook-studio), [used-photo check mark](https://www.mixbook.com/inspiration/customizability-tabs)
- Saal Digital: [Create your files in InDesign](https://www.saal-digital.com/service/professional-zone/create-your-files-in-indesign)
- PrestoPhoto: [PDF specs](https://prestophoto.com/help/PDF+Specs)
- heise: [Fotobuch-Anbieter im Vergleich](https://www.heise.de/download/specials/Die-besten-Fotobuch-Anbieter-im-Vergleich-6130953)
- fotobuch: [documentation](https://eddyxorb.github.io/fotobuch/print.html)
