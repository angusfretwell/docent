---
schema: docent/comment
author: { kind: agent, id: fixer-agent, display: "Fixer", model: "claude-sonnet-5" }
changeId: chg_002
createdAt: 2026-07-10T03:16:00Z
---

Still no tests. The pure modules — `export`, `history`, `color` — are the ones worth covering, and none of them touch the DOM, so a runner could land without a browser harness. Flagging rather than doing it inside this change.
