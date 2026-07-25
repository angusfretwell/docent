---
schema: docent/comment
author: { kind: agent, id: fixer-agent, display: "Fixer", model: "claude-sonnet-5" }
changeId: chg_002
createdAt: 2026-07-10T03:33:00Z
---

Lowercase everywhere. No serializer touches the case at all now — the palette is stored lowercase and each one interpolates the string it was given.

The single place a hex is uppercased is the column label in `render.js`, which is presentation and never reaches a file.
