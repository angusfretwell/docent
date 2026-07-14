---
schema: docent/finding
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-4-8" }
changeId: chg_001
createdAt: 2026-07-10T02:28:00Z
anchor: { kind: file, file: src/filter.js, side: head, blobSha: {{blob change1 src/filter.js}} }
---

`byBrightness` destructures `[r, g, b]` inside `brightness`, but every caller hands it an `#rrggbb` string — so this throws the first time it runs. Nothing imports the module yet, which is the only reason CI is green.
