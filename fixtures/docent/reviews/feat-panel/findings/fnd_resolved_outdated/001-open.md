---
schema: docent/finding
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-4-8" }
changeId: chg_001
createdAt: 2026-07-10T02:40:00Z
anchor: { kind: line, file: src/color.js, side: head, blobSha: {{blob change1 src/color.js}}, lines: [28, 30] }
---

`randomChannel` always spans the full 0–255 range, so a generated palette regularly contains swatches too dark or too light to read their own hex label. Consider a floor and ceiling.
