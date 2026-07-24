---
schema: docent/walkthrough-section
id: sec_01JZFIXTUREPROD00000000S06
title: Changing the swatch count
captures: [cap_01JZFIXTUREPROD00000000C5]
callouts: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C5,kind: screenshot-region,rect: [0.357,0.274,0.07,0.04]},body: "The count field, clamped to 1–12."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C5,kind: screenshot-region,rect: [0.025,0.13,0.806,0.118]},body: "Ten swatches, wrapping within the same row."}]
---

The Swatches field controls how many colors a generation produces {{capture:0}}. Committing a new count regenerates immediately, so the row redraws without a separate Generate click.

The value is clamped to 1–12 and falls back to five when the field is emptied, which is what keeps a stray keystroke from asking for a thousand swatches. Note the History strips below: the ten-swatch entry carries ten bands while the earlier five-swatch ones keep theirs, so a row always reflects the count it was generated at.
