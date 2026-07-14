---
schema: docent/finding
author: { kind: human, id: angusfretwell@me.com, display: "Angus" }
changeId: chg_001
createdAt: 2026-07-10T02:45:00Z
anchor: { kind: line, file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [19, 22] }
---

`brightness` hard-codes the ITU-R BT.601 luma weights inline. Pull 299/587/114 into a named constant so the next reader doesn't have to recognise them by sight.
