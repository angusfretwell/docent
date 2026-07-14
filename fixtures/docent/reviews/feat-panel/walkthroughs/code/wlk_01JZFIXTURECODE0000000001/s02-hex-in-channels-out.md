---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S02
title: "Hex in, channels out"
ranges: [{ file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [3, 10] }, { file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [12, 17] }]
---

Everything downstream reasons about numeric channels, so the first job is getting out of hex. {{range:0}} `hexToChannels` slices the string at fixed offsets and parses each pair as base-16. It assumes a six-digit `#rrggbb` — which is exactly what the presets provide, and nothing else is validated.

The return trip is the mirror image. {{range:1}} Each channel is formatted back to two hex digits and left-padded, so a channel of `5` becomes `05` instead of collapsing the string by a character.
