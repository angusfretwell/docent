# docent — domain model

Ubiquitous language for the agent-first review tool. This file is the canonical
glossary; code, schemas, and prose should use these terms as defined here.

Status: the **Change / PR domain model** is pinned (wayfinder ticket
[#3](https://github.com/angusfretwell/docent/issues/3)). It reconciles with and
upgrades the on-disk layout drafted in
[#2](https://github.com/angusfretwell/docent/issues/2) (the filesystem *is* the
interface). Comment-anchor internals are owned by
[#7](https://github.com/angusfretwell/docent/issues/7) and are out of scope here.

## Core terms

### Change

An **immutable snapshot of a diff**, identified by its resolved
`(baseSha, headSha)` pair.

- `base` is the **merge-base** of the two branches — three-dot semantics,
  matching GitHub's "Files changed" tab. It shows only what the branch did, not
  commits that landed on the base branch meanwhile.
- Both SHAs are stored **resolved** (concrete commit ids), so the Change records
  the exact commits it was computed against. `baseRef` / `headRef` are
  human-readable labels; the SHAs are identity.
- A Change is **frozen once captured** — never mutated. Revising the branch
  produces a *new* Change (see Round), never an edit to an existing one.

A Change is a pure function of two commit objects, mirroring git's own grain.

### Review

The **durable entity a human conducts over time** against a single pull request.

- Identified by its **target**: the PR, `owner/repo#N`. This handle is stable
  across force-push, rebase, title edits, and branch renames — the PR number
  never moves. (Change identity — the SHAs — moves every round; Review identity
  does not.)
- One PR ↔ one Review.
- Holds the comments and walkthroughs, plus an **append-only history of
  Changes** (`changeIds`) and a pointer to the current one (`currentChangeId`).

### Round (iteration)

Each time the PR head moves (new commit, amend, squash, force-push, rebase), a
**new Change is minted and appended** to the Review's history and the pointer
advances. "Reviewed across three rounds" = three Changes in the history.

- Amends, squashes, and rebases are **not special cases** — they change the head
  (and, for a rebase, the merge-base) SHA, so they flow through the exact same
  new-Change path. Immutability is a feature here: the superseded Change stays
  frozen, so "show me the exact diff I commented on" always answers.
- A **pure rebase with no content change** mints a content-identical Change
  (different SHAs, same diff) — a cosmetic "empty round", harmless (drift shows
  every comment clean). De-duping by diff-hash is a possible later refinement,
  not part of the model.

### Drift

A comment is **born anchored** to the Change it was written on (that anchor is
immutable). Whether the comment is **live / shifted / outdated** relative to the
*current* Change is **computed lazily at render time** — never rewritten on disk,
keeping comment files append-only.

- **Live** — anchored lines unchanged in the current Change.
- **Shifted** — content changed above the anchor; line numbers slide, comment
  stays live.
- **Outdated** — the anchored lines themselves changed (often: the comment was
  addressed). Kept and shown, flagged outdated, still linking to the frozen
  Change it was born on.

This ticket only guarantees that the frozen Changes a comment anchors into
**continue to exist**; the anchor schema and re-anchoring algorithm belong to
[#7](https://github.com/angusfretwell/docent/issues/7).

### Source

Where a Change was obtained — a **discriminated union** on `kind`. Today only
`github` is built; `git` is reserved (see Scope).

A `github` source carries the resolved `base`/`head` SHAs, the `baseRef` /
`headRef` labels, and the PR-native metadata (`number`, `url`, `title`, `body`,
`author`, `state`). Metadata rides on the source, not on the core Change; a PR is
*how a Change was obtained*, never *what a Change is*.

There is **no separate `PullRequest` entity** — a PR is a Change source. The
"a PR has many changes over time" relationship is exactly what the Review
already provides.

## On-disk shape

Reconciles with [#2](https://github.com/angusfretwell/docent/issues/2):
`change.json` becomes a per-round `changes/chg_*.json` log, and `review.json`
becomes PR-keyed with a Change history. Reviews are keyed by target under
`.review/reviews/`.

```
.review/
  reviews/
    pr-128/
      review.json                 # target PR + currentChangeId + ordered changeIds
      changes/
        chg_1.json                # one frozen snapshot per round
        chg_2.json
        chg_3.json                # = current
      comments/                   # anchor internals owned by #7
      walkthroughs/
```

```jsonc
// review.json
{ "schema": "docent/review@2", "id": "rev_…",
  "target": { "kind": "github", "pr": "owner/repo#128" },
  "currentChangeId": "chg_3",
  "changeIds": ["chg_1", "chg_2", "chg_3"] }

// changes/chg_3.json — frozen
{ "schema": "docent/change@2", "id": "chg_3",
  "source": { "kind": "github",
              "base": "<merge-base sha>", "head": "<head sha>",
              "baseRef": "main", "headRef": "contributor:feat/stream",
              "pr": { "number": 128, "url": "…", "title": "…",
                      "body": "…", "author": "…", "state": "open" } },
  "capturedAt": "…" }
```

## Object availability (known hardening seam)

A frozen Change stores **SHAs**, not diff content — it relies on the objects
still being reachable. A force-push can make a reviewed commit dangling and
eventually GC-able.

- **Initial build: lean SHAs.** GitHub retains commits that were ever a PR head
  (fetchable via the PR after force-push), and the local reflog keeps rewritten
  commits for the life of an active review. `.review/` is gitignored and does not
  travel across clones (per #2), so objects are present whenever they're needed.
- **Documented hardening (not built):** if Changes ever need to survive
  aggressive GC or travel across machines, `changes/chg_N/` can cache the raw
  diff/blobs as an asset (the layout already holds blobs for captures). Additive
  seam, not a remodel.

## Scope

**Initial build targets pull requests only.** The PR is the sole input; the tool
runs locally and reads the PR (GitHub stays read-only input, consistent with the
map's givens).

Local git-ref review (`base..head` without a PR) is **deferred** — a redraw of
the map's original "two first-class inputs" given. The seam is preserved so it is
a future *resolver*, not a rewrite:

- `source.kind` stays a union (`github` built, `git` reserved).
- Change identity is always the **resolved SHAs**, never PR-derived — so PR-ness
  never leaks into what a Change *is*.

Adding local-refs later is "write a second resolver" over the same core model.
