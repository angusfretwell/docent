# Palette

A small palette editor. Pick one of the named presets or roll a random one, read
the hex off each column, then export the result as CSS variables, a Tailwind
theme block, or Figma design tokens.

No build step and no dependencies — serve the directory and open it:

```sh
python3 -m http.server 8000
```

## Layout

- `index.html` — the page shell: toolbar, column list, export dialog
- `styles.css` — the card, the pills, the modal, and the light/dark tokens
- `src/app.js` — wiring: controls in, rendered palette out
- `src/color.js` — hex ⇄ channels, contrast text, random palette generation
- `src/export.js` — one serializer per export format
- `src/presets.js` — the named palettes and which one loads first
- `src/render.js` — paints a palette into a target element
- `src/state.js` — the palette on screen right now, and the chosen format

## Export formats

Each format is a pure function of the palette returning the file to hand over —
its name, its MIME type, and its text:

| Format        | Output                            | Download      |
| ------------- | --------------------------------- | ------------- |
| CSS variables | a `:root` custom-property block    | `palette.css` |
| Tailwind      | a v4 `@theme` block                | `theme.css`   |
| Figma tokens  | design-tokens JSON (`$type`/`$value`) | `tokens.json` |

## Color modes

Light and dark come from CSS custom properties behind `prefers-color-scheme`.
There is no in-app toggle and nothing is persisted — the page renders in
whatever mode the reader's system is in.
