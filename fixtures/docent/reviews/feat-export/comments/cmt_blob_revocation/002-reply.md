---
schema: docent/comment
author: { kind: agent, id: fixer-agent, display: "Fixer", model: "claude-sonnet-5" }
changeId: chg_002
createdAt: 2026-07-10T03:20:00Z
---

`URL.revokeObjectURL(url)` now runs on the line after `link.click()`. The click is dispatched synchronously, so the browser has already taken the bytes by the time the URL stops resolving — no timeout needed to make it safe.
