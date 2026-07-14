---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S01
title: "The preset palettes"
ranges: [{ file: src/presets.js, side: head, blobSha: {{blob change1 src/presets.js}}, lines: [1, 6] }, { file: src/presets.js, side: head, blobSha: {{blob change1 src/presets.js}}, lines: [8, 8] }]
---

The page never opens empty — it opens on a named preset. {{range:0}} Each palette is a plain array of hex strings with no wrapper object and no metadata, so a preset stays readable and editable at a glance.

{{range:1}} `DEFAULT_PRESET` names which one loads first. Keeping it a separate export makes the default a one-word edit rather than a reordering of the object above it.
