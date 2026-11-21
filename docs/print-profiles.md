# Print profiles

A print profile describes what a print shop needs: page size and bleed, how the interior PDF is built (single pages or spreads), page count rules, how the spine width follows from page count and paper, and how big the cover sheet is. Built-in profiles live in [`public/lib/providers.js`](../public/lib/providers.js). Your own profiles are stored in `profiles.json` in the Billerbook data folder and can be exported, imported and shared as JSON. Every value can still be changed per edition.

## Built-in profiles (checked 21 Nov 2026)

| Print shop | Region | Interior | Spine | Cover | Status |
|---|---|---|---|---|---|
| WIRmachenDRUCK | DE · AT · CH | single pages, 3 mm bleed | from the order configurator (estimate until entered) | hardcover 15 mm wrap, 5/2.5 mm overhang; softcover 3 mm | verified against data sheets and printed books |
| Amazon KDP | worldwide | single pages, 1/8 in bleed | paperback: published formula per paper (white, cream, premium colour) | paperback exact; hardcover via KDP template | paperback verified, hardcover partial |
| Lulu | worldwide | single pages, 1/8 in bleed | paperback formula, hardcover table | paperback exact; casewrap via Lulu template | paperback verified, hardcover partial |
| Blurb (PDF to Book) | worldwide | single pages, 1/8 in bleed, even page count, 20–440 pages (premium 240, layflat 110) | from Blurb’s specification calculator | via Blurb template | partial |
| IngramSpark | worldwide | single pages, 1/8 in bleed | from the cover template | case laminate 0.625 in wrap, 0.5 in hinge each side | partial |
| Mixam | UK · US · DE · AU · CA | single pages, 3 mm bleed | shown in the cart | hardcover 20 mm bleed, 5 mm hinge each side | partial |
| Saal Digital Professional Line | EU · UK · US | **spreads**, first and last half empty, sRGB | from the InDesign template | via template | partial |
| PrestoPhoto | US · worldwide | single pages, 1/8 in bleed, sRGB | from the cover calculator | via template | partial |
| Custom | any | everything editable | your value or a template | your values | manual |

“Partial” means the interior rules are published, but the cover size depends on the printer’s own calculator or template. That is not a weakness of the profile: the printers themselves say to take the spine from their tool. Billerbook handles it in two ways:

1. **Import the cover template.** Download the template PDF from the printer’s calculator (KDP, Lulu, Blurb, IngramSpark, Saal and most others offer one) and import it in *Edition settings → Spine and cover*. Billerbook reads the page size, makes the cover exactly that size and works out the spine width from it.
2. **Enter the spine width** the printer shows. Until you do, Billerbook estimates it, marks the value as an estimate and links to the printer’s calculator. Preflight warns about it.

## Fields

Per binding (`hardcover`, `softcover`, `layflat`):

| Field | Meaning |
|---|---|
| `status` | `verified`, `partial` or `manual` (see above) |
| `bleed` | bleed on every interior page edge, mm |
| `safety` | distance from the trim for text and faces, mm |
| `glue` | zone next to the spine on the first/last page that is glued to the cover, mm |
| `interior` | `single`: one PDF page per book page. `spreads`: one PDF page per double page |
| `blankEnds` | first left and last right page stay empty |
| `pages` | `{ min, max, step }` page count rules (`null` = not published) |
| `colour` | `srgb` or `cmyk`, what the printer wants |
| `spineTextMin` | page count from which the printer prints spine text |
| `cover.mode` | `spread` (back + spine + front on one page) or `none` |
| `cover.wrap` | bleed or turn-in around the outside of the cover, mm |
| `cover.overW`, `cover.overH` | board overhang beyond the book block, mm |
| `cover.joint` | extra width on each side of the spine (IngramSpark, Mixam), mm |
| `cover.hinge` | hinge zone next to the spine, drawn as a guide, mm |
| `spine` | `{ type: 'formula', perPage, base }`, `{ type: 'table', rows: [[maxPages, mm], …] }` or `{ type: 'printer', perPage, url }` |
| `papers` | optional list of papers, each with its own `spine` rule and optional `maxPages` |

Cover size:

```
width  = 2 × (page width + overW) + 2 × joint + spine + 2 × wrap
height = page height + 2 × overH + 2 × wrap
```

An imported template overrides both, and the spine becomes `template width − 2 × wrap − 2 × (page width + overW) − 2 × joint`.

## Adding a print shop

In the app: set up an edition with the *Custom* profile, enter the printer’s values, then *Export as print profile*. Others import that file with *Import print profile*.

To add it to Billerbook for everyone:

1. Add an entry to `PROVIDERS` in `public/lib/providers.js` with links to the printer’s own specification in `sources` and the date in `checked`.
2. Only use numbers from those sources. Leave unknown page limits as `null`; use `type: 'printer'` for spines the printer only gives through its calculator.
3. Add a check to `test/print.mjs` that recomputes one cover size by hand from the printer’s formula.
4. Export a test book and compare page size, TrimBox and cover width with the printer’s template.
5. Open a pull request.

Through the MCP server, an assistant can do the same with `save_print_profile`.
