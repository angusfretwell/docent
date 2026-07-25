---
schema: docent/walkthrough-section
id: sec_01JZFIXTUREPROD00000000S02
title: One modal, three formats
captures: [cap_01JZFIXTUREPROD00000000C2]
callouts: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C2,kind: screenshot-region,rect: [0.343, 0.3717, 0.3141, 0.0413]},body: "A segmented control, not a dropdown — all three formats are readable without opening anything."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C2,kind: screenshot-region,rect: [0.343, 0.4279, 0.3141, 0.1854]},body: "The actual file contents, not a description of them. Switching tabs re-renders this block in place."}]
---

The button opens a native `<dialog>` over the dimmed columns {{capture:0}}. Focus moves into the modal, `Escape` closes it, and the columns stay visible behind the scrim — you can still see the palette you are exporting.

CSS variables is the default because it is the format that needs no explanation. The download button underneath names the file it will write, and that name changes with the tab, so nothing about the format is a surprise after the click.
