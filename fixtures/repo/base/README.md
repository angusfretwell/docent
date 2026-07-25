# Palette

A small palette editor. Pick one of the named presets or roll a random one, and
read the hex off each column.

No build step and no dependencies — serve the directory and open it:

```sh
python3 -m http.server 8000
```

## Layout

- `index.html` — the page shell: toolbar, then the column list
- `styles.css` — the card, the pills, and the light/dark tokens
- `src/app.js` — wiring: controls in, rendered palette out
- `src/color.js` — hex ⇄ channels, contrast text, random palette generation
- `src/presets.js` — the named palettes and which one loads first
- `src/render.js` — paints a palette into the column list

## Color modes

Light and dark come from CSS custom properties behind `prefers-color-scheme`.
There is no in-app toggle and nothing is persisted — the page renders in
whatever mode the reader's system is in.
