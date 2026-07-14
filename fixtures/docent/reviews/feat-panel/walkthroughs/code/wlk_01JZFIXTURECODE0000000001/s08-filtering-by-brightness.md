---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S08
title: "Filtering a palette by brightness"
ranges: [{ file: src/filter.js, side: head, blobSha: {{blob change1 src/filter.js}}, lines: [5, 7] }, { file: src/filter.js, side: head, blobSha: {{blob change1 src/filter.js}}, lines: [9, 13] }]
---

{{range:0}} `byBrightness` keeps only the colors at or above a floor — the intended use is dropping washed-out swatches before a palette is shown.

{{range:1}} `darkest` folds the same measure the other way, reducing a palette to the one color to anchor against.

Both hand the caller's value straight to `brightness`, which expects a channel triple — and every caller in the app holds `#rrggbb` strings. Nothing imports this module yet, which is the only reason that mismatch has not surfaced as a runtime error.
