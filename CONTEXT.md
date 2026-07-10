# docent

An interactive, local-first tool for reviewing code changes — especially agent-authored ones — on GitHub pull requests. This glossary is the ubiquitous language; the Change / PR model is pinned by [#3](https://github.com/angusfretwell/docent/issues/3), which holds its schemas.

## Language

**Change**:
An immutable snapshot of a diff, identified by its resolved `(baseSha, headSha)` with `base` at the merge-base. A new Change is minted when the branch is revised, never edited in place.
_Avoid_: Diff, Snapshot, Revision

**Review**:
The durable entity a human conducts against one pull request, holding its comments, walkthroughs, and append-only history of Changes.
_Avoid_: Session

**Target**:
The pull request a Review is bound to (`owner/repo#N`) — its stable identity, unmoved by force-push or rebase.
_Avoid_: Subject

**Round**:
One iteration of a Review: the Change minted when the target's head moves.
_Avoid_: Iteration, Revision

**Drift**:
A comment's standing against the current Change, given it was born on an earlier one — live, shifted, or outdated.
_Avoid_: Staleness

**Source**:
Where a Change came from. A pull request is a Change's source, carrying its metadata — not a first-class entity of its own.
_Avoid_: PullRequest, Provider

**Walkthrough**:
A curated, ordered tour of a Change authored for a reader — prose woven through selected diff ranges (code) or captures (product). Durable and bound to the Change it was born on; drifts as later Changes are minted, and is superseded (not mutated) by regeneration. Held by a Review; the code walkthrough model is pinned by [#14](https://github.com/angusfretwell/docent/issues/14).
_Avoid_: Tour, Guide, Narrative

**Section**:
One step of a Walkthrough: a titled unit of prose interleaved with its targets — diff ranges for a code walkthrough, capture annotations for a product one. The unit a narrative comment anchors to (the `walkthrough-section` arm of the comment anchor union).
_Avoid_: Step, Slide
