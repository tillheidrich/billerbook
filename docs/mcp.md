# Billerbook and AI assistants (MCP)

Billerbook includes a [Model Context Protocol](https://modelcontextprotocol.io) server. Any MCP client can use it: Claude Desktop, Claude Code, Codex, Cursor, LM Studio and others. The AI works on the same projects as the app, and the app updates live while it works.

## Setup

Mac app:

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

From source:

```json
{ "mcpServers": { "billerbook": { "command": "node", "args": ["/path/to/billerbook/mcp.mjs"] } } }
```

The exact entry for your installation is shown in the app under **Connect AI**, which also writes it into Claude Desktop with one click. If Billerbook is not running, the MCP server starts it in the background.

### Over HTTP (local)

While Billerbook runs, MCP is also served at `http://127.0.0.1:4580/mcp` (Streamable HTTP). Clients on the same Mac can use that address without a sign-in, for example `claude mcp add --transport http billerbook http://127.0.0.1:4580/mcp`. Web pages in a browser cannot reach it: requests with a foreign `Origin` header are refused.

### ChatGPT and claude.ai (remote, OAuth)

These assistants run in the cloud, so they need a public https address that leads to your Mac.

1. **Connect AI › Start tunnel** starts a `cloudflared` quick tunnel (`brew install cloudflared`), or **Own address…** takes an address you run yourself, for example a reverse proxy on your own server.
2. Add `https://<address>/mcp` as a connector: ChatGPT under Settings › Apps & Connectors (developer mode), claude.ai under Settings › Connectors.
3. The assistant registers itself (OAuth dynamic client registration) and opens Billerbook's sign-in page. Click **Show code** in Billerbook and type the six digits. The code works once and for ten minutes; five wrong tries end it.

What the public address exposes: the OAuth metadata, `/oauth/register`, `/oauth/authorize`, `/oauth/token` and `/mcp`. The editor, the photo thumbnails and the app API answer only on localhost. `/mcp` from outside needs a bearer token; tokens are stored as SHA-256 hashes, access tokens last one hour, refresh tokens 90 days and rotate on every use. **Disconnect** in the dialog removes a client and its tokens. Stopping the tunnel closes the public address.

A remote assistant works on your photo book projects only: it gets no tools that take file paths on your Mac (no image folders, Lightroom catalogs, fonts, project files, export folders or local HTML/PDF paths), and its exports go to `~/Desktop/Billerbook-Export`. Local clients (Claude Desktop, Codex, Cursor) get every tool. If someone enters too many wrong codes, pairing locks; **Show code** asks whether to unlock it.

## Tools

| Tool | What it does |
|---|---|
| `create_project` | new project from an image folder and/or a Lightroom catalog |
| `set_sources` | folders, Lightroom catalog, collections, export folder |
| `list_lightroom_collections`, `import_lightroom_book` | read the catalog, take over a Lightroom book |
| `get_project`, `list_projects` | overview, placed / missing counts per edition |
| `list_formats`, `list_layouts` | print shops (built-in and your own), formats, papers, profile status, layouts |
| `get_print_specs` | what the printer receives: PDF page sizes, single pages or spreads, page rules, spine width and its source, cover size and panel positions |
| `set_print_setup` | print shop, format, paper, single pages / spreads, blank first and last page, spine value, cover measurements, colour |
| `import_cover_template` | read the printer's cover template PDF (or its size) and use it exactly |
| `read_print_spec` | read a print shop's data sheet PDF (path or link): trim and data size, bleed, safety margin, spine, wrap, page rules, colour, ICC, each with its sentence |
| `apply_print_spec` | set an edition up exactly as the sheet says (also magazines with saddle stitching) and save it as a profile for that shop |
| `save_print_profile` | create or share a profile for any print shop, also derived from an edition (local clients only) |
| `list_images` | photo pool with usage; filter `unplaced` for completeness |
| `add_edition`, `update_edition` | editions, format, spine, margins, colour, page numbers, sharpening |
| `auto_layout` | fill pages automatically, in capture-time order or as sorted in the Lightroom collection (`order`) |
| `get_pages`, `view_spread` | read the layout; `view_spread` returns the spread as an image |
| `view_overview` | the whole book as a contact sheet with page numbers, cover first; `from` and `count` page through long books |
| `list_captureone_collections`, `use_captureone` | Capture One (Mac, app running): albums, projects and groups; use them as the photo source, processed files matched from an export folder |
| `set_page_layout`, `shuffle_layout`, `place_images`, `adjust_image`, `make_full_bleed`, `swap_images`, `remove_image`, `pages`, `edit_frames` | edit pages |
| `set_text`, `fill_captions`, `set_cover` | texts, captions from metadata, cover |
| `page_tools` | duplicate pages, copy a layout to other pages, save / apply / delete your own layouts |
| `set_page_style` | page background colour or photo with opacity, margin, photo gap, hide page number |
| `lightroom_usage` | which photos are in which edition (what the Lightroom plug-in mirrors) |
| `apply_template` | book templates: fonts, styles, colours, cover, page sequence; optional new layout of all pages |
| `design_catalog` | fonts, presets, templates, background graphics and tones the design tools accept |
| `set_text_style`, `format_text`, `add_font` | text styles per edition, formatting of one text, your own font files |
| `set_tone`, `set_background_graphic`, `set_barcode` | black and white or toning per photo, page and cover graphics, ISBN barcode or placeholder |
| `view_spread` | spread, single page or cover as an image; `soft_proof` and `gamut` show the CMYK result |
| `preflight` | check before printing, including text overflow, small text and barcode rules |
| `export_pdf` | print PDFs, proof PDF, page overview PDF, IDML for Affinity and InDesign, screen PDF, page images, Instagram carousel, HTML book, EPUB, CBZ, file list, collected originals, `.billerbook` project file; `pages` limits it to some pages |
| `list_used_files` | every photo in an edition with page, path, Lightroom id, ppi and tone |
| `import_web_page`, `open_project_file` | a web page or HTML file as pages; a `.billerbook` file as a new project |

## Example prompts

> Here is the data sheet from my print shop (attached PDF, or ~/Downloads/datenblatt-hardcover-a4.pdf). Set up the hardcover edition exactly like that, tell me which values you took from where, and what is still missing (usually the spine width from their order form).

> Make a 32-page magazine in A4 with saddle stitching for my club, like the data sheet from the Druckerei says.

> Make a photo book from ~/Pictures/Summer 2026. Landscape hardcover A4, three photos per page, five-star photos get their own page. Look at every spread and fix anything that looks unbalanced. Then run preflight.

> In my project "Year 2026", make a portrait softcover for the family with only the four- and five-star photos, at most 60 pages.

> Which photos from the Lightroom collection are not in the hardcover yet? Put them on new pages after page 120.

> Set the softcover up for Blurb, Standard Landscape, premium paper. Here is Blurb's cover template: ~/Downloads/blurb-cover.pdf. Then tell me the PDF sizes Blurb will get.

> Copy the layout of page 12 to every page with three photos, then duplicate the spread 30–31.

> Turn "Year 2026" into a Christmas year review, check every spread with soft proof, and export an HTML book of pages 1–12 for my website plus the print PDFs.

> Import https://example.org/journal/roses as a new edition with the Botanical template and list which photos have less than 240 ppi.
