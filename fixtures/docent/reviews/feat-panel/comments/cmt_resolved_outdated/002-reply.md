---
schema: docent/comment
author: { kind: agent, id: fixer-agent, display: "Fixer", model: "claude-sonnet-5" }
changeId: chg_002
createdAt: 2026-07-10T03:12:00Z
---

`randomChannel` now takes an optional `floor`/`ceiling` pair and clamps through `clampChannel`, so a caller can narrow the range without reaching for the raw maths.
