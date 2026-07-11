---
schema: docent/finding@3
author: { kind: human, id: angusfretwell@me.com, display: "Angus" }
changeId: chg_001
createdAt: 2026-07-10T02:25:00Z
anchor: { kind: file, file: src/filter.js, side: head, blobSha: {{blob change1 src/filter.js}} }
---

`byBrightness` destructures `[r, g, b]`, but `randomColor` hands it `rgb(...)` strings. This throws — parse the channels before comparing.
