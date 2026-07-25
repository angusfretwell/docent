# Docent

An interactive, local-first tool for reviewing code changes — especially agent-authored ones — on local git branches. This glossary is the ubiquitous language; the Change / Review model is pinned by [#3](https://github.com/angusfretwell/docent/issues/3) as amended by [#24](https://github.com/angusfretwell/docent/issues/24) and [#61](https://github.com/angusfretwell/docent/issues/61), which hold its schemas.

## Language

### The branch under review

**Review**: The per-branch, **machine-local** file of record — everything docent holds about one branch under review: its append-only history of Changes, its Comments, and its Walkthroughs. Identified by its branch name (one Review per branch), with the base ref recorded at creation; created automatically on first use. Durability is per-machine, not per-repo: it lives in-repo under `.docent/`, but the `.docent/.gitignore` commit policy keeps its Changes, Comments, and Walkthroughs as machine-local working state that does not survive a clone — only the capture runbook and the ignore policy travel with the repo ([#78](https://github.com/angusfretwell/docent/issues/78)). Names the artifact; the act is a "review pass". Renamed from Dossier by [#61](https://github.com/angusfretwell/docent/issues/61), accepting the act/artifact overlap that [#24](https://github.com/angusfretwell/docent/issues/24) had renamed away. _Avoid_: Dossier (the pre-#61 name), Tour, Session, Workspace

**Change**: An immutable snapshot of a diff, identified by its resolved `(baseSha, headSha)` with `base` at the merge-base. Minted lazily on first reference — when a Comment, Walkthrough, or review pass must refer to the branch's current head — and never edited in place; the diff itself always renders live from git. _Avoid_: Diff, Snapshot, Revision, Round

**Pending**: A read-only preview of the dirty working tree — a Change-shaped view whose head side is the live working tree, letting a reviewer eyeball an uncommitted edit before it is committed. Not a Change: no identity, no persistence, no Comment anchors. Surfaces at the top of the Diff tab's Change selector while the working tree is dirty and hides when clean; owns no lifecycle logic, since on commit its incremental diff simply empties. Pinned by [#23](https://github.com/angusfretwell/docent/issues/23) as amended by [#24](https://github.com/angusfretwell/docent/issues/24). _Avoid_: Draft, Staged, Uncommitted Change

### Anchoring and drift

**Anchor**: The durable, persisted pointer that fixes a Comment or Callout to a spot in the change — one of several kinds: a diff line, a file, a whole Change, a Walkthrough Section, a region of a screenshot, a timestamp in a recording, or a span of text. Carries Drift: its standing against the newest Change. Pinned by [#7](https://github.com/angusfretwell/docent/issues/7). _Avoid_: target, pin, chip, marker (those are how an Anchor is rendered, not the Anchor itself)

**Drift**: An Anchor's standing against the newest Change, given it was born on an earlier one — live, shifted, or outdated. Per-Anchor; the whole-Walkthrough analogue is Staleness.

**Staleness**: How many Changes a whole Walkthrough sits behind the newest one — a per-Walkthrough count, distinct from the per-Anchor standing that is Drift. _Avoid_: Drift (that is per-Anchor, not per-Walkthrough)

### Walkthroughs

**Walkthrough**: A curated, ordered tour of a Change authored for a reader — prose woven through selected diff ranges or Captures. Comes in two kinds, a Code walkthrough or a Product walkthrough. Durable and bound to the Change it was born on; falls behind (see Staleness) as later Changes are minted, and is superseded (not mutated) by regeneration. Held by a Review; the code walkthrough model is pinned by [#14](https://github.com/angusfretwell/docent/issues/14). _Avoid_: Tour, Guide, Narrative

**Code walkthrough** / **Product walkthrough**: The two kinds of Walkthrough. A Code walkthrough weaves its prose through selected diff ranges; a Product walkthrough weaves it through Captures. The kind is the only axis along which Walkthroughs — and the Comments grouped beside them — divide. _Avoid_: pillar (the code's informal word for this axis)

**Section**: One step of a Walkthrough: a titled unit of prose interleaved with its targets — diff ranges for a Code walkthrough, Callouts on Captures for a Product one. The unit a Comment anchors to, via the `walkthrough-section` Anchor. _Avoid_: Step, Slide

**Capture**: A content-addressed media artifact anchored in a Product walkthrough — a screenshot or a recording of the running app at a route and viewport. Carries Callouts pinned to its regions or timestamps. _Avoid_: Screenshot (only one of its two kinds), Snapshot, Media

**Callout**: A walkthrough author's prose pinned to a target — a region or timestamp of a Capture, or a diff range — inside a Section. Fixed narration, not a conversation: no Status and no replies, unlike a Comment. Held on the Section. _Avoid_: Annotation, Note, Pin (its rendered marker)

### Conversations

**Comment**: A single review conversation: an anchored, append-only thread — an opening message and its Replies — held by a Review. Authored by any Author, human or agent; reviewing, fixing, and resolving are roles, not permissions, so attribution is metadata. Carries a Status, read off its latest record — author-blind. Fixed to the change by an Anchor; anchors and records are pinned by [#7](https://github.com/angusfretwell/docent/issues/7). Renamed from Finding. _Avoid_: Finding (the pre-rename name), Issue, Ticket, Note. Thread is fine as plain English for a Comment and its Replies, but is not itself an entity.

**Reply**: A follow-up message on a Comment — an Author and a body, same shape as the Comment's opening message, but never the anchored root: it inherits the Comment's Anchor and Status. _Avoid_: Response, Note

**Status**: Where a Comment stands — `open` (someone owes it work), `actioned` (whoever held the turn handed it back), or `resolved` (closed). Derived, never stored: it is the type of the Comment's latest non-`edit` record, so records divide into the ones that carry prose (`open`, `reply`, `edit`) and the ones that only move Status (`action`, `resolve`, `reopen`). `actioned` is deliberately broad — fixed, declined, and asked-a-question are one state, because they pose the same question (whose turn now?) and differ only in a reason the prose carries better than an enum. _Avoid_: Disposition, What's-next, Resolution

**Author**: Who wrote a Comment or Reply — a human or an agent (agents also record their model). Attribution only: since roles are not permissions (see Comment), an Author records who did something, never what someone may do. _Avoid_: Actor, User, Reviewer (a role, not the identity)

### Review progress

**Viewed**: A reviewer's per-file "I've seen this" mark, recorded against a file's head blob so it clears when that file changes in a later Change. A private progress signal, not a Comment. _Avoid_: Read, Seen, Reviewed, Acknowledged
