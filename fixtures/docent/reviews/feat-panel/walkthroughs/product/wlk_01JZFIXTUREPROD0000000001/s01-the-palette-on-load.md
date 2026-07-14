---
schema: docent/walkthrough-section
id: sec_01JZFIXTUREPROD00000000S01
title: The palette on load
captures: [cap_01JZFIXTUREPROD00000000C1]
annotations: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C1,kind: screenshot-region,rect: [0.025,0.133,0.4,0.12]},body: "The sand preset, painted before any interaction."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C1,kind: screenshot-region,rect: [0.038,0.42,0.923,0.183]},body: "Export is populated from the same load — nothing to click first."}]
---

Palette opens on a named preset rather than an empty page {{capture:0}}. The five sand swatches are the `DEFAULT_PRESET`, and each one prints its own hex value in whichever of the two label colors stays readable against it.

The Export panel is already filled in below. That is deliberate: the palette on screen and its serialized form are always the same state, so there is never a moment where the two disagree.
