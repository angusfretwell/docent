---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S03
title: "The Tailwind and token shapes"
ranges: [{ file: src/export.js, side: head, blobSha: {{blob change2 src/export.js}}, lines: [12, 21] }, { file: src/export.js, side: head, blobSha: {{blob change2 src/export.js}}, lines: [23, 35] }]
---

The two formats that aren't plain CSS are where the opinions live. {{range:0}} The Tailwind output is a v4 `@theme` block, and the names are `--color-palette-n` rather than `--color-n` — Tailwind derives utilities from the token name, so this is the difference between `bg-palette-2` and a class called `bg-2`. It also assumes v4; a project still on v3 gets nothing it can paste, which is an open question on this branch rather than a settled call.

{{range:1}} The token export is DTCG-shaped — `$type` and `$value` per token, nested under one `palette` group — which is what Tokens Studio reads on the Figma side. Note what both of them do with the hex: nothing. Each interpolates the string the palette already holds, which is how all three formats stay byte-identical to each other.
