---
schema: docent/walkthrough-section
id: sec_01JZFIXTUREPROD00000000S05
title: Exporting as CSS or JSON
captures: [cap_01JZFIXTUREPROD00000000C4]
annotations: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C4,kind: screenshot-region,rect: [0.493,0.278,0.063,0.043]},body: "The format switch — CSS or JSON."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C4,kind: screenshot-region,rect: [0.038,0.42,0.923,0.183]},body: "The same palette, re-serialized in place."}]
---

The format select swaps how the current palette is written out {{capture:0}}. CSS emits a `:root` block of `--swatch-N` custom properties ready to paste into a stylesheet; JSON emits a plain `colors` array for anything that needs to read it back.

Switching format never regenerates — it re-serializes what is already on screen. That is why the swatch row above is untouched between the two states, and why the field is read-only: it is a view of the palette, not a second place to edit it.
