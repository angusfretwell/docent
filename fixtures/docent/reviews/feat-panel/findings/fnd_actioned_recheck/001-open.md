---
schema: docent/finding
author: { kind: human, id: angusfretwell@me.com, display: "Angus" }
changeId: chg_001
createdAt: 2026-07-10T02:30:00Z
anchor: { kind: line, file: src/app.js, side: head, blobSha: {{blob change1 src/app.js}}, lines: [25, 31] }
---

`generate` hard-codes `SWATCH_COUNT`, so the count is a source edit rather than a control. If the panel is meant to be playable, this wants to read from the UI.
