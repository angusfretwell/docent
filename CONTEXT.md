# docent

An interactive, local-first tool for reviewing code changes — especially
agent-authored ones — on GitHub pull requests. This glossary is the ubiquitous
language; the Change / PR model is pinned by
[#3](https://github.com/angusfretwell/docent/issues/3), which holds its schemas.

## Language

**Change**:
An immutable snapshot of a diff, identified by its resolved `(baseSha, headSha)`
with `base` at the merge-base. A new Change is minted when the branch is revised,
never edited in place.
_Avoid_: Diff, Snapshot, Revision

**Review**:
The durable entity a human conducts against one pull request, holding its
comments, walkthroughs, and append-only history of Changes.
_Avoid_: Session

**Target**:
The pull request a Review is bound to (`owner/repo#N`) — its stable identity,
unmoved by force-push or rebase.
_Avoid_: Subject

**Round**:
One iteration of a Review: the Change minted when the target's head moves.
_Avoid_: Iteration, Revision

**Drift**:
A comment's standing against the current Change, given it was born on an earlier
one — live, shifted, or outdated.
_Avoid_: Staleness

**Source**:
Where a Change came from. A pull request is a Change's source, carrying its
metadata — not a first-class entity of its own.
_Avoid_: PullRequest, Provider
