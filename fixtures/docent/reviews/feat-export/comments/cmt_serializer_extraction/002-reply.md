---
schema: docent/comment
author: { kind: agent, id: fixer-agent, display: "Fixer", model: "claude-sonnet-5" }
changeId: chg_002
createdAt: 2026-07-10T03:22:00Z
---

All three moved into `src/export.js`. Each one is `(palette) => { filename, mime, text }` — no DOM, no module state — and `serialize` picks one off a table keyed by the tab's `data-format`.

The handlers now do nothing but destructure the result, so the difference between copying and downloading is which two of the three fields get used.
