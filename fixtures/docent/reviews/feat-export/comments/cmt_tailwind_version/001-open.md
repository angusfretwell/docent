---
schema: docent/comment
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-5" }
changeId: chg_002
createdAt: 2026-07-10T03:08:00Z
anchor: { kind: line, file: src/export.js, side: head, blobSha: {{blob change2 src/export.js}}, lines: [12, 21] }
---

The Tailwind tab emits a v4 `@theme` block, which is exactly right for a project already on v4 and useless to one still on v3 — there the palette has to land in `theme.extend.colors` inside `tailwind.config.js`, which is a different file in a different language.

Worth deciding now rather than later: is v4-only the deliberate call, or should the tab offer both shapes? Adding a fourth tab is cheap; changing what the "Tailwind" tab already means to someone is not.
