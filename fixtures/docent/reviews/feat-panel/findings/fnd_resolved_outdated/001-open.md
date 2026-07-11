---
schema: docent/finding@3
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-4" }
changeId: chg_001
createdAt: 2026-07-10T02:40:00Z
anchor: { kind: line, file: app.js, side: head, blobSha: {{blob change1 app.js}}, lines: [26, 32] }
---

`generate` hard-codes five swatches. Pull the count into a named constant so it is configurable.
