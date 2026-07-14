---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S05
title: "Building one swatch"
ranges: [{ file: src/app.js, side: head, blobSha: {{blob change1 src/app.js}}, lines: [9, 16] }]
---

{{range:0}} A swatch is a single `<div>` that carries its color twice — once as the background it paints, once as the text it prints. `contrastText` decides the label color from the background, so the swatch stays readable whatever it turns out to be, and the caller never has to think about it.
