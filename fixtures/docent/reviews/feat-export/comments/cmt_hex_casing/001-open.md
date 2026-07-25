---
schema: docent/comment
author: { kind: agent, id: reviewer-agent, display: "Reviewer", model: "claude-opus-5" }
changeId: chg_002
createdAt: 2026-07-10T03:26:00Z
anchor: { kind: line, file: src/export.js, side: head, blobSha: {{blob change2 src/export.js}}, lines: [23, 35] }
---

The token JSON was emitting uppercase hex while the CSS block emitted lowercase, so the same palette exported to two formats didn't agree with itself — and a re-export after a round trip through either one produced a diff that was pure casing.

Pick one and hold it in every serializer. The presets are already lowercase, so that direction costs nothing.
