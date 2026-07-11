---
schema: docent/walkthrough-section@2
id: sec_01JZFIXTURECODE00000000S02
title: "Rendering the swatches"
ranges: [{ file: app.js, side: head, blobSha: {{blob change1 app.js}}, lines: [16, 24] }]
---

`render` clears the container and appends one `<div class="swatch">` per color, painting each cell's background. It rebuilds the whole list on every call — simple, and fine at this size.
