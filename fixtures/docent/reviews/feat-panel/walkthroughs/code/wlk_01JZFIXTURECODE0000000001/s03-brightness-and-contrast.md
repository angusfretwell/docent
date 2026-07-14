---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S03
title: "Brightness and readable text"
ranges: [{ file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [19, 22] }, { file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [24, 26] }]
---

{{range:0}} `brightness` is a weighted average rather than a plain mean: green counts for roughly six times as much as blue, because the eye is far more sensitive to it. The 299/587/114 weights are the ITU-R BT.601 luma coefficients.

That single number is enough to choose a legible label. {{range:1}} Above the midpoint the swatch reads as light, so the text goes dark; below it, the reverse. One threshold, no per-color tuning — which is why every swatch can carry its own hex label without anyone picking colors by hand.
