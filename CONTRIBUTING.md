# Contributing

Thanks for helping. Billerbook should stay fast, honest about print output and pleasant to use.

## Setup

```bash
npm install
npm start          # browser UI on http://localhost:4580
npm run app        # Electron app
npm test           # end-to-end tests (needs poppler-utils and qpdf)
```

## Structure

| Path | Purpose |
|---|---|
| `public/lib/geometry.js` | crop maths, cover formula, bleed |
| `public/lib/layouts.js` | all layouts, justified grid, page numbers |
| `public/lib/ops.js` | every change to a project (shared by UI, HTTP API and MCP) |
| `public/lib/providers.js` | print profiles |
| `public/lib/i18n.js` | translations |
| `public/app.js` | editor UI |
| `lib/catalog.mjs` | Lightroom Classic catalog, previews, book import, folders |
| `lib/store.mjs` | projects, photo pool, thumbnails, smart crop |
| `lib/pdf.mjs` | streaming PDF writer and print export |
| `lib/preview.mjs` | spread previews as JPEG (used by `view_spread`) |
| `server.mjs` | local HTTP API and live updates |
| `mcp.mjs` | MCP server |
| `desktop/` | Electron shell, auto-update |

## Rules

- Changes to a project go through `public/lib/ops.js`, so the UI, the API and the MCP server behave the same.
- The Lightroom catalog is opened read-only. Never write to it.
- Print numbers in a profile need a source from the print shop.
- New UI text goes into `i18n.js` in English and German.
- Add a test for new behaviour in `test/`.

## Translations

Copy the `en` block in `public/lib/i18n.js`, translate, and add the language to the selector in the help dialog.
