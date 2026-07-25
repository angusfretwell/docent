---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S06
title: "What the export never touched"
ranges: [{ file: src/render.js, side: head, blobSha: {{blob change2 src/render.js}}, lines: [23, 25] }, { file: src/render.js, side: head, blobSha: {{blob change2 src/render.js}}, lines: [12, 13] }]
---

Worth ending on the file the feature did not change. {{range:0}} `render` still takes a target and a palette and paints columns into it — the prep commit gave it that signature, and the export feature had no reason to touch it again. Nothing about producing a `.css` file goes through the renderer, and nothing about painting a column knows a modal exists.

{{range:1}} The one place the two nearly meet is here: the column label uppercases its hex, purely so the value reads as a value. The serializers deliberately don't, which is why the exported files and the on-screen labels disagree on case — the screen is presentation, the file is data.
