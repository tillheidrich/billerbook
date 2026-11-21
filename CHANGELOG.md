# Changelog

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
