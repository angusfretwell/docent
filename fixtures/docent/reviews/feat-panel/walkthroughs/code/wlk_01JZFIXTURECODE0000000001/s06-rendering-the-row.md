---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S06
title: "Rendering the row"
ranges: [{ file: src/app.js, side: head, blobSha: {{blob change1 src/app.js}}, lines: [18, 23] }]
---

{{range:0}} `render` empties the container and rebuilds it from scratch on every call — no diffing, no reuse of existing nodes. At five to twelve swatches that is cheaper than tracking what changed, and it buys a useful guarantee: the DOM can never drift out of step with the array that produced it.
