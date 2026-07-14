# Palette

A tiny static color-palette toy. Serve the directory, press **Generate**, and
tune the swatch count — no build step, no dependencies.

## Features

- Random palettes of 1–12 swatches
- Four named presets, restorable with **Reset**
- Export the current palette as CSS custom properties or JSON
- A bounded history of recent palettes, each restorable in one click
- The last palette is restored on reload

## Layout

- `index.html` — the page shell
- `styles.css` — swatch grid, controls, panels, and typography
- `src/app.js` — wiring and the generate loop
- `src/color.js` — hex/channel conversion, clamping, and random color mixing
- `src/presets.js` — the named starter palettes
- `src/render.js` — swatch and history DOM rendering
- `src/history.js` — the bounded palette log
- `src/export.js` — CSS and JSON serialization
- `src/storage.js` — best-effort `localStorage` persistence
