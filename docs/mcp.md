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

The exact entry for your installation is shown in the app under **?**. If Billerbook is not running, the MCP server starts it in the background.

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
| `save_print_profile` | create or share a profile for any print shop, also derived from an edition |
| `list_images` | photo pool with usage; filter `unplaced` for completeness |
| `add_edition`, `update_edition` | editions, format, spine, margins, colour, page numbers, sharpening |
| `auto_layout` | fill pages chronologically |
| `get_pages`, `view_spread` | read the layout; `view_spread` returns the spread as an image |
| `set_page_layout`, `shuffle_layout`, `place_images`, `adjust_image`, `make_full_bleed`, `swap_images`, `remove_image`, `pages`, `edit_frames` | edit pages |
| `set_text`, `fill_captions`, `set_cover` | texts, captions from metadata, cover |
| `page_tools` | duplicate pages, copy a layout to other pages, save / apply / delete your own layouts |
| `set_page_style` | page background colour or photo with opacity, margin, photo gap, hide page number |
| `lightroom_usage` | which photos are in which edition (what the Lightroom plug-in mirrors) |
| `preflight`, `export_pdf` | check and export |

## Example prompts

> Make a photo book from ~/Pictures/Summer 2026. Landscape hardcover A4, three photos per page, five-star photos get their own page. Look at every spread and fix anything that looks unbalanced. Then run preflight.

> In my project "Year 2026", make a portrait softcover for the family with only the four- and five-star photos, at most 60 pages.

> Which photos from the Lightroom collection are not in the hardcover yet? Put them on new pages after page 120.

> Set the softcover up for Blurb, Standard Landscape, premium paper. Here is Blurb's cover template: ~/Downloads/blurb-cover.pdf. Then tell me the PDF sizes Blurb will get.

> Copy the layout of page 12 to every page with three photos, then duplicate the spread 30–31.
