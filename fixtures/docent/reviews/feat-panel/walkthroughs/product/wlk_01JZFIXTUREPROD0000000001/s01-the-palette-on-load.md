---
schema: docent/walkthrough-section@2
id: sec_01JZFIXTUREPROD00000000S01
title: The palette on load
captures: [cap_01JZFIXTUREPROD00000000C1]
annotations: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C1,kind: screenshot-region,rect: [0.02,0.1,0.22,0.07]},body: "Five random swatches, painted on first load."}]
---

Palette opens with a row of five swatches already rendered {{capture:0}} — `generate()` runs once on load, so the page is never empty. Each swatch is a fresh random `rgb()` color.
