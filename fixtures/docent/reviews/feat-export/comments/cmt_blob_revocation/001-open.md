---
schema: docent/comment
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-5" }
changeId: chg_002
createdAt: 2026-07-10T03:12:00Z
anchor: { kind: line, file: src/app.js, side: head, blobSha: {{blob change2 src/app.js}}, lines: [55, 65] }
---

`download` mints an object URL on every click and nothing ever released it, so each export pinned its blob for the life of the tab. Rolling palettes and downloading each one is a perfectly ordinary session, and it leaked every time.

Revoke once the click has been dispatched.
