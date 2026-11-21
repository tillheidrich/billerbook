# Billerbook website

Static marketing site for Billerbook, English at `/`, German at `/de/`.
Live: https://billerbook.heidrich-digital.de (Coolify, Dockerfile in this folder, base directory `/site`).

## Edit

All copy lives in `build.py` (dict `T`, keys `en` and `de`). Styles in `assets/site.css`.
Images in `assets/img/` are screenshots from the app's demo project (`docs/images`) and spreads rendered by the app.

```bash
CONTACT_EMAIL=you@example.org python3 build.py   # writes public/
cd public && python3 -m http.server 4700
```

`CONTACT_EMAIL` is the address on the imprint and privacy pages. In Coolify it is a build variable of the app. Without it the pages link to the imprint on tillheidrich.de for e-mail contact.

## Design

Scene: someone on the sofa in December picking this year's family photos before the print shop's deadline. The page borrows from the printer's proof sheet: warm paper, ink, crop marks around every image, CMYK registration patches as dividers, one process red. The features section is dark because the app is. Type: Archivo (variable width), condensed for headlines. Copy checked against the unslop rules (no em dashes, no filler, claims only where they are tested).

## Deploy

Push to `main`. Coolify rebuilds when files under `site/` change.
