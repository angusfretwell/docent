# docent — domain model

Ubiquitous language for the agent-first review tool. Use these terms as defined
here in code, schemas, issues, and prose.

Decisions, rationale, and data schemas live in their originating tickets, not in
this glossary. The Change / PR model below is pinned by
[#3](https://github.com/angusfretwell/docent/issues/3) (which holds the on-disk
schemas and the reconciliation with [#2](https://github.com/angusfretwell/docent/issues/2)).

## Glossary

**Change** — an immutable snapshot of a diff, identified by its resolved
`(baseSha, headSha)`. `base` is the **merge-base** (three-dot, matching GitHub's
"Files changed"). Frozen once captured; revising the branch produces a new
Change, never an edit. Refs are labels; SHAs are identity.

**Review** — the durable entity a human conducts over time against a single pull
request. Identified by its **target**, the PR (`owner/repo#N`). Holds the
comments and walkthroughs plus an append-only history of Changes. One PR ↔ one
Review.

**Round** — one iteration of a Review: each time the PR head moves, a new Change
is minted and appended to the Review's history.

**Drift** — a comment's status relative to the *current* Change, given that it
was born anchored to an earlier one: **live** (anchor unchanged), **shifted**
(lines moved, still valid), or **outdated** (anchored lines changed). Computed at
render time, not stored.

**Source** — where a Change came from. A pull request is a Change source (not its
own entity); its metadata rides on the source. Only PRs are supported in the
initial build (`git` refs reserved).
