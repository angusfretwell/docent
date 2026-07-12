---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S01
title: "Mixing a random color"
ranges: [{ file: app.js, side: head, blobSha: {{blob change1 app.js}}, lines: [9, 14] }]
---

`randomColor` draws three independent channels and formats them into an `rgb()` string. Because each channel is a fresh `randomChannel()` sample, every swatch spans the full color range.
