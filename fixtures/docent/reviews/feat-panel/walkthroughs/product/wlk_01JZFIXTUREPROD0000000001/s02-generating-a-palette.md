---
schema: docent/walkthrough-section
id: sec_01JZFIXTUREPROD00000000S02
title: Generating a palette
captures: [cap_01JZFIXTUREPROD00000000C2]
callouts: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C2,fromMs: 0,kind: recording-timestamp,toMs: 900},body: "The first click replaces every swatch at once."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C2,fromMs: 1500,kind: recording-timestamp,toMs: 2008},body: "By the third click the History panel has three rows."}]
---

Generate throws away the current row and paints a fresh one {{capture:0}}. The recording runs three clicks back to back, and no two rows share a color — each swatch is three independently sampled channels, so the palettes roam the whole color cube.

Watch the lower half of the frame as it goes: every generated palette is also pushed onto History, so the panel grows by a row on each click without the user asking for it.
