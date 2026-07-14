---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S07
title: "The generate loop"
ranges: [{ file: src/app.js, side: head, blobSha: {{blob change1 src/app.js}}, lines: [25, 31] }, { file: src/app.js, side: head, blobSha: {{blob change1 src/app.js}}, lines: [33, 34] }]
---

{{range:0}} `generate` fills an array with `SWATCH_COUNT` random colors and hands it to `render`. The count is a module constant — there is no control for it on the panel yet, so changing it means editing this file.

{{range:1}} The last two lines wire the button and paint the default preset once on load. That initial `render` is what keeps the page from opening on an empty row before the first click.
