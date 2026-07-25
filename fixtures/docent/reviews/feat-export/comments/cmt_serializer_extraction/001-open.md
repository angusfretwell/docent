---
schema: docent/comment
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-5" }
changeId: chg_002
createdAt: 2026-07-10T03:10:00Z
anchor: { kind: line, file: src/export.js, side: head, blobSha: {{blob change2 src/export.js}}, lines: [37, 45] }
---

Each format was being assembled inline inside the copy and download handlers, which made the exported text unreachable except by clicking the button and opening the file. Nothing about producing a CSS block needs a DOM.

Lift each format into its own function of the palette and let the handlers ask for one by name.
