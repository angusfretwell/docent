---
schema: docent/walkthrough-section
id: sec_01JZFIXTUREPROD00000000S03
title: The shape Figma reads
captures: [cap_01JZFIXTUREPROD00000000C3]
callouts: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C3,kind: screenshot-region,rect: [0.5526, 0.3344, 0.1021, 0.0338]},body: "Third tab; the code block and the download extension both follow it."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C3,kind: screenshot-region,rect: [0.343, 0.3869, 0.3141, 0.275]},body: "One `$type`/`$value` token per column, grouped under `palette` — what Tokens Studio imports."}]
---

The third tab is the one that leaves the browser entirely {{capture:0}}. It is design-tokens JSON in the shape Tokens Studio reads, so a palette rolled here lands in a Figma file without anyone retyping a hex.

Note what stays put while the tab changes: the palette behind the scrim, the modal's width, and Copy and Download in their corner — both are sized for their longest label, so neither slides when the extension goes from `.css` to `.json`. Only the code block and that extension change, which is what makes tabbing through the three formats feel like reading one thing three ways rather than opening three screens.
