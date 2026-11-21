# Print profiles

A print profile describes what a print shop needs in the PDF. Profiles live in [`public/lib/providers.js`](../public/lib/providers.js). Every value can still be changed per edition in the app.

## Fields

Per binding (`hardcover`, `softcover`, `layflat`):

| Field | Meaning |
|---|---|
| `bleed` | bleed around every interior page, mm |
| `safety` | distance from the trim that text and important content should keep, mm |
| `glue` | strip next to the spine on the first and last interior page that gets glued to the cover, mm |
| `cover.wrap` | bleed / turn-in around the whole cover, mm |
| `cover.overW`, `cover.overH` | board overhang beyond the trimmed book block (hardcover), mm |
| `cover.hinge` | hinge zone next to the spine, mm (shown as a guide) |
| `spinePerPage` | rough spine thickness per page for the estimate, mm |
| `pageStep` | page count must be a multiple of this |

The cover canvas is calculated as

```
width  = 2 × (page width + overW) + spine + 2 × wrap
height = page height + 2 × overH + 2 × wrap
```

For WIRmachenDRUCK this gives `(2w + 40 + spine) × (h + 35)` for hardcovers and `(2w + spine + 6) × (h + 6)` for softcovers, exactly as in their data sheets.

## Adding a print shop

1. Copy the `custom` entry, give it an `id` and a `name`.
2. Fill in the values from the shop's own specification (data sheet, template, spec calculator). Put the links into `sources`.
3. Add the formats the shop offers (`w`, `h` in mm, trim size without bleed).
4. Set `verified: true` only if every number comes from the shop's own documents.
5. Export a test book, open it in Acrobat or Preview and check page size, TrimBox and cover width against the shop's template.
6. Open a pull request with the links.

Colour: many shops in Europe ask for CMYK with FOGRA39 or PSO Coated v3, some accept RGB. Check the shop's data sheet and set the edition's colour mode and ICC profile accordingly.
