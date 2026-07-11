# Docent

An interactive, local-first tool for reviewing code changes — especially agent-authored ones — on local git branches. This glossary is the ubiquitous language; the Change / Dossier model is pinned by [#3](https://github.com/angusfretwell/docent/issues/3) as amended by [#24](https://github.com/angusfretwell/docent/issues/24), which hold its schemas.

## Language

**Dossier**:
The durable per-branch file of record — everything docent holds about one branch under review: its append-only history of Changes, its Findings, and its Walkthroughs. Identified by its branch name (one Dossier per branch), with the base ref recorded at creation; created automatically on first use.
_Avoid_: Review (names the act, as in the `/review` skill, never the artifact), Session, Workspace

**Change**:
An immutable snapshot of a diff, identified by its resolved `(baseSha, headSha)` with `base` at the merge-base. Minted lazily on first reference — when a Finding, Walkthrough, or review pass must refer to the branch's current head — and never edited in place; the diff itself always renders live from git.
_Avoid_: Diff, Snapshot, Revision, Round

**Pending**:
A read-only preview of the dirty working tree — a Change-shaped view whose head side is the live working tree, letting a reviewer eyeball an uncommitted edit before it is committed. Not a Change: no identity, no persistence, no Finding anchors. Surfaces at the top of the Diff tab's Change selector while the working tree is dirty and hides when clean; owns no lifecycle logic, since on commit its incremental diff simply empties. Pinned by [#23](https://github.com/angusfretwell/docent/issues/23) as amended by [#24](https://github.com/angusfretwell/docent/issues/24).
_Avoid_: Draft, Staged, Uncommitted Change

**Drift**:
A Finding anchor's standing against the newest Change, given it was born on an earlier one — live, shifted, or outdated.
_Avoid_: Staleness

**Walkthrough**:
A curated, ordered tour of a Change authored for a reader — prose woven through selected diff ranges (code) or captures (product). Durable and bound to the Change it was born on; drifts as later Changes are minted, and is superseded (not mutated) by regeneration. Held by a Dossier; the code walkthrough model is pinned by [#14](https://github.com/angusfretwell/docent/issues/14).
_Avoid_: Tour, Guide, Narrative

**Section**:
One step of a Walkthrough: a titled unit of prose interleaved with its targets — diff ranges for a code walkthrough, capture annotations for a product one. The unit a narrative comment anchors to (the `walkthrough-section` arm of the Finding anchor union).
_Avoid_: Step, Slide

**Finding**:
A single review conversation: an anchored, append-only thread of comments held by a Dossier, authored by any actor — reviewing, fixing, and resolving are roles, not actors, so attribution is metadata, never permission. Open or resolved, plus, while open, a _what's-next_ read off the latest reply's Disposition — actor-blind. Anchors and records are pinned by [#7](https://github.com/angusfretwell/docent/issues/7); the queue convention by [#18](https://github.com/angusfretwell/docent/issues/18).
_Avoid_: Comment, Thread (as entity names — plain-English inside a Finding), Issue, Ticket, Note

**Disposition**:
The kind of turn-hand-back a reply on a Finding carries — `actioned`, `declined`, or `question` — from which the Finding's what's-next state (needs verify, needs decision, needs answer) is derived. Actor-agnostic; a fresh Finding or plain comment carries none (it simply needs action).
_Avoid_: Status, Resolution
