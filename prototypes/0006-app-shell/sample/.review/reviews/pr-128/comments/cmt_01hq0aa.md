---
schema: docent/comment@1
id: cmt_01hq0aa
author: { kind: agent, name: "claude-code" }
anchor: { file: src/parser/stream.ts, side: head, lines: [42, 47], blobSha: 9f8e7d6 }
bornChangeId: chg_1
createdAt: 2026-07-08T09:12:00Z
resolved: false
---
The backpressure high-water mark is hard-coded to 16. Should this be
configurable, or is 16 a deliberate default tied to the chunk size?
