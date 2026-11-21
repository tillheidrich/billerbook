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

`CONTACT_EMAIL` is the address on the imprint and privacy pages. In Coolify it is a build variable of the app.

## Deploy

Push to `main`. Coolify rebuilds when files under `site/` change.
