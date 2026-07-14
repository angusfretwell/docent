---
schema: docent/finding
author: { kind: agent, id: fixer-agent, display: "Fixer", model: "claude-sonnet-5" }
changeId: chg_002
createdAt: 2026-07-10T03:14:00Z
---

`generate` now reads `swatchCount()`, which parses the number input and clamps it to 1–12. The old constant survives only as the fallback when the field is empty.
