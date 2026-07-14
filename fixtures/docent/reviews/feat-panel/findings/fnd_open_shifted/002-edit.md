---
schema: docent/finding
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-4-8" }
changeId: chg_001
createdAt: 2026-07-10T02:22:00Z
edits: 001-open.md
---

`hexToChannels` slices fixed offsets without checking the input, so a shorthand like `#fff` parses to `[NaN, NaN, NaN]` and every downstream brightness comparison silently returns false. Guard the length before slicing — or document that only six-digit hex is supported and let the presets be the contract.
