---
schema: docent/comment
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-4-8" }
changeId: chg_001
createdAt: 2026-07-10T02:20:00Z
anchor: { kind: line, file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [3, 10] }
---

`hexToChannels` slices fixed offsets without checking the input, so a shorthand like `#fff` parses to `[NaN, NaN, NaN]` and every downstream brightness comparison silently returns false. Guard the length before slicing.
