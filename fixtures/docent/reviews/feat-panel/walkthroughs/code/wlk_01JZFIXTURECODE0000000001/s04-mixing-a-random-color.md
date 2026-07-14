---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S04
title: "Mixing a random color"
ranges: [{ file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [28, 30] }, { file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [32, 34] }]
---

{{range:0}} `randomChannel` draws a single channel uniformly across the full 0–255 range.

{{range:1}} `randomColor` samples three of them independently and hands the triple straight to `channelsToHex`. Independent channels mean a generated palette roams the whole color cube — including the near-black and near-white corners, where the swatch's own hex label starts to disappear into its background.
