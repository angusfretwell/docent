---
schema: docent/comment
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-5" }
changeId: chg_002
createdAt: 2026-07-10T03:16:00Z
anchor: { kind: line, file: index.html, side: head, blobSha: {{blob change2 index.html}}, lines: [85, 85] }
---

The "Copied" toast is toggled with the `hidden` attribute and nothing else, so the confirmation is visual only — a screen reader gets silence after Copy, and the button's own label doesn't change either. Nothing tells a non-sighted reader whether the click landed.

`role="status"` on the toast (or `aria-live="polite"`) is the whole fix: the text is already correct, it just needs to be in a region that announces when it appears.
