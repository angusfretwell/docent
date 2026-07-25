---
schema: docent/comment
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-5" }
changeId: chg_002
createdAt: 2026-07-10T03:16:00Z
anchor: { kind: line, file: src/app.js, side: head, blobSha: {{blob change2 src/app.js}}, lines: [47, 51] }
---

The whole confirmation is `copyButton.textContent = "Copied"`, so it is visual only — a screen reader gets silence after Copy. Renaming a control is not an announcement: the accessible name of the focused button changes underneath the user, and whether anything is spoken is up to the screen reader. Nothing here tells a non-sighted reader the click landed.

A visually hidden `role="status"` element in the footer, written to alongside the label, is the whole fix — the label swap itself can stay exactly as it is.
