# Changelog

## 0.11.0 – 22 Nov 2026

Affinity, InDesign, Capture One
- IDML export: the book as an editable layout for Affinity (free, by Canva) and Adobe InDesign. Real pages and spreads with bleed, image frames with the same crops, photos in a Links folder (tones applied), text frames with font, size, leading, alignment and colour, page colours; the cover as its own file. Background graphics, page numbers and the barcode stay in the print PDF.
- Capture One (Mac): pick albums, projects or groups of the open catalog or session as the photo source. Processed JPEG/TIFF files from an export folder are matched to the variants by name; JPEG originals work directly. Read-only, through Capture One's AppleScript dictionary.

Page overview
- Overview tab with the cover as the first tile.
- Page overview PDF: every spread on A4 landscape sheets with page numbers, cover first, for sign-off before printing.
- MCP `view_overview`: the whole book as a contact sheet, so an assistant checks rhythm and repeated layouts before looking at single spreads.
- The interactive HTML book shows one page at a time on phones and tells an embedding page its height.

Design
- Seven book templates (Monograph, Year book, Gallery, Botanical, Travel journal, Wedding, Christmas year review) with a live preview from the project's photos; apply style only or lay the pages out again.
- Photo-book layouts on the Van de Graaf canon: plate, plate with caption, small photo with white, small photo in the corner, chapter page, canon text page; spreads: caption left and plate right, diptych, bleed left and white right.
- Four new covers: plate, full-bleed year cover, minimal, type only. Cover texts keep their role when the layout changes.
- Monograph auto layout (one photo per page, optional right pages only) and chapter pages per month or day.
- Nine bundled typefaces (SIL Open Font License) and your own TTF/OTF; text styles per edition with presets; text printed as outlines; the editor shows the PDF's line breaks.
- Black and white and four tones per photo; eleven background graphics; edition-wide page graphic.
- Free frames: move handle, position and size in millimetres, snapping to thirds and the canon block.
- Light theme (follows the system, or fixed light or dark).

Print and check
- Soft proof in the editor (P) with gamut warning (⇧P).
- Proof PDF with trim, safe area, glue zone and numbered preflight messages.
- ISBN check and EAN-13 barcode with price add-on as vector bars; KDP placeholder; IngramSpark requires it in preflight.
- Print PDFs carry PDF/X-4 identification (Info, XMP, output intent, trailer ID).
- Preflight: text that does not fit, text below 6 pt, spine text longer than the spine, barcode rules.

Share, import, files
- Interactive HTML book with embed snippet (Astro or any site), screen PDF, page or spread images (JPEG/PNG), Instagram carousel, fixed-layout EPUB, CBZ. Every export can take a page selection.
- Import PDFs (whole pages or photos and text blocks as movable frames), web pages and HTML files, `.billerbook` project files.
- `.billerbook` project file with all photos and fonts.
- File list (CSV, TXT of paths and of file names) and *Collect originals*.
- Spelling check with suggestions in the Mac app.

AI
- Connect AI dialog: Claude Desktop in one click, local HTTP MCP at /mcp, ChatGPT and claude.ai through a tunnel with OAuth 2.1 (PKCE, dynamic client registration, pairing code shown in the app, hashed and rotating tokens).
- New MCP tools: apply_template, design_catalog, set_text_style, format_text, add_font, set_tone, set_background_graphic, set_barcode, list_used_files, import_web_page, open_project_file; view_spread with page and soft proof; export_pdf with all formats and page selection (46 tools).


Print shops and formats
- 185 formats in 12 profiles. New: CEWE (PDF to Book, 8 sizes), WhiteWall Coffee Table Book (6 sizes), and "Standard formats" for any print shop: photo books, German and US book sizes, magazines and zines.
- KDP: all 16 paperback and 5 hardcover trim sizes from KDP's table (the 8.5 × 11 in hardcover KDP does not make is gone). IngramSpark: the trim matrix. Blurb: trade books and magazines. Mixam: magazines.
- Saddle stitching as a binding for magazines and booklets: pages in steps of four, no separate cover file.
- Give the assistant your print shop's data sheet: `read_print_spec` reads the PDF (path or link) and lists every measurement with the sentence it came from, `apply_print_spec` sets the edition up exactly like that and saves a profile for the shop.

Security (review before release)
- The local API only accepts changes from the editor itself: requests from other web pages are refused (Origin / Sec-Fetch-Site), JSON only as application/json, no CORS on localhost.
- Pairing codes: at most one new code per 10 seconds, pairing locks after 20 wrong codes until restart; the consent page names the address the approval goes to.
- Connecting ChatGPT or claude.ai now finishes in Chrome (the consent page allowed no redirect to the assistant).
- Colours, opacity and font names are checked on every save and on package import; the editor runs only its own scripts (CSP).
- Remote assistants get no tools that take file paths on the Mac; exports from them go to the default export folder.
- Web import checks addresses while connecting (also IPv6-mapped, CGNAT and redirects), with time limits.
- Uploads: images only, up to 400 MB. Package import: smaller limits, fonts only from the package.
- Desktop app: sandboxed window, links outside the editor only as web or mail links, no developer tools in releases.
- Refresh tokens: reuse of an old token ends the whole session; exports run at most two at a time.
- sharp 0.35.5, zod 4.6.7, MCP SDK 1.32.2.

## 0.10.0 – 21 Nov 2026

Print shops
- New profiles: Amazon KDP, Lulu, Blurb (PDF to Book), IngramSpark, Mixam, Saal Digital Professional Line, PrestoPhoto, each with sources and a status (verified / partial / manual).
- Spine width from the printer's formula or table per paper and page count; estimates are marked and link to the printer's calculator.
- Import the printer's cover template PDF: the cover takes its exact size and the spine follows from it.
- Interior PDF as single pages or as spreads (one PDF page per double page), optional blank first and last page.
- Cover joints (extra width beside the spine), cover mode "none".
- Page count rules per printer and paper, spine-text minimum, colour space check in preflight.
- Your own print profiles: export from an edition, import, share as JSON.

Pages
- Duplicate pages and spreads (⌘D), copy layout to the next page, a range or all pages with the same photo count (⇧⌘C / ⇧⌘V).
- Save page arrangements as your own layouts and reuse them.
- Background photo with opacity, margin and photo gap per page, hide the page number on a page.

Lightroom
- Lightroom Classic plug-in: a collection per edition and a "missing" collection, synced automatically while Billerbook runs.

AI
- MCP: get_print_specs, set_print_setup, import_cover_template, save_print_profile, page_tools, set_page_style, lightroom_usage (35 tools).

## 0.9.0 – 2026-11-21

First public release.

- Editions: several books from one photo pool, usage dots and *missing here* filter
- 23 page and spread layouts, justified auto grid that keeps aspect ratios, re-flow between formats
- Smart crop (saliency), space-bar variants, free frames with snapping, fill ⇄ whole photo, full-bleed in one key
- Lightroom Classic: collections, previews, cropped sizes, captions, book import (read-only)
- Folders without Lightroom: EXIF date, XMP/IPTC rating and caption
- Print PDF: bleed, TrimBox/BleedBox, CMYK with ICC output intent, output sharpening, page numbers, cover with spine
- Preflight: resolution, empty frames, missing print files, glue zone, page count, spine
- Print profiles: WIRmachenDRUCK (verified), custom
- MCP server with 28 tools, including spread previews as images
- macOS app with automatic updates; English and German UI
