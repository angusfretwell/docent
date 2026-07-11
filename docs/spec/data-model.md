# Data model

The schema appendix of record for docent's core model: the storage philosophy, the canonical `.docent/` tree, and the **Review**, **Change**, and **Finding** entities with their drift, what's-next, and viewed-state semantics. Terms are used exactly as defined in [`CONTEXT.md`](../../CONTEXT.md); the model is pinned by [#3](https://github.com/angusfretwell/docent/issues/3) as amended by the model-simplification pass [#24](https://github.com/angusfretwell/docent/issues/24), which overrides earlier ticket wording wherever they differ.

Sibling documents own what this one references: product overview ([README.md](README.md)), app shell and HTTP API ([architecture.md](architecture.md)), diff-review UX and viewed semantics ([diff-review.md](diff-review.md)), walkthrough and capture schema detail ([walkthroughs.md](walkthroughs.md)), skills and the serving runbook ([agent-integration.md](agent-integration.md)).

---

## 1. Storage philosophy — the filesystem is the interface

**The filesystem is the interface** ([#2](https://github.com/angusfretwell/docent/issues/2), human-ratified). Everything docent knows persists as plain files with a documented, self-describing schema under `.docent/`. Agents read and write those files directly; docent is a _renderer plus optional validating sugar_ over the very same files — it renders and signals, **never gates**.

Chosen over a tool-owned store because the product is agent-first (agents author files natively; a mandated CLI is pure friction), local-first and solo (nothing needs a server-mediated store), and it mirrors how Claude Code skills already work. The store's real wins — validation, integrity, single-writer concurrency — are recovered inside this model: append-only files sidestep concurrency, and optional CLI sugar validates without gatekeeping ([#2](https://github.com/angusfretwell/docent/issues/2)).

Store conventions, all from [#2](https://github.com/angusfretwell/docent/issues/2):

| Convention  | Decision                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Location    | In-repo but **gitignored** — agents find it in the tree, it stays greppable and diff-inspectable, and it never pollutes git history. Cost accepted: it does not travel across clones (fine for a solo local tool). |
| Granularity | **Directory-of-files, append-only.** A mutation is a new file, never a rewrite.                                                                                                                                    |
| Format      | **Frontmatter-markdown** for prose bodies; **JSON** for pure manifests.                                                                                                                                            |
| Versioning  | Every record self-describes with `schema: <name>@<version>`. No central version file.                                                                                                                              |
| Write path  | Agents drop files in the documented shape — no lock, no read-modify-write. docent watches `.docent/` and re-renders live. Optional CLI sugar writes the _same_ file, validated and atomic.                         |

The state root is **`.docent/`** ([#14](https://github.com/angusfretwell/docent/issues/14) renamed the provisional `.review/`; [#24](https://github.com/angusfretwell/docent/issues/24) confirms). v1 input is a **local git branch checked out in the repo** — there is no GitHub integration in v1; everything resolves from local git alone ([#24](https://github.com/angusfretwell/docent/issues/24)).

## 2. The canonical `.docent/` tree

Layout pinned by [#24](https://github.com/angusfretwell/docent/issues/24) (superseding [#3](https://github.com/angusfretwell/docent/issues/3)'s PR-keyed layout), with Finding record dirs under `findings/` per the consolidation naming alignment (see [§9](#9-schema-lineage)).

```
.docent/                            # in-repo, gitignored (#2); the state root (#24)
  capture.md                        # optional serving runbook — markdown brief the capture
                                    #   skill reads/authors; detail in agent-integration.md (#19)
  reviews/
    feat-stream/                    # one Review per branch; dir = branch-name slug,
                                    #   slashes → dashes (#24)
      review.json                  # docent/review@4 — { schema, id, branch, base }
      changes/                      # the append-only Change log; the dir IS the history —
                                    #   no index or pointer file (#24)
        chg_001.json                # docent/change@3 — one immutable snapshot per mint;
        chg_002.json                #   sequential ids self-order
      findings/
        fnd_01J9GQ4W7X…/            # one Finding = one event-sourced record dir (#7)
          001-open.md               # root record: anchor + attribution + body
          002-reply.md              # attribution + body + optional disposition (#18)
          003-resolve.md            # attribution + optional reason
          004-reopen.md             # attribution
      viewed/                       # append-only mark-as-viewed events,
                                    #   { path, blobSha, ts } keyed on head blob (#9)
      walkthroughs/                 # schema detail owned by walkthroughs.md
        code/
          wlk_01J9H0KQ2M…/          # one immutable walkthrough per generation (#14)
            manifest.json           # docent/walkthrough@2 — ordered section list
            s01-entry.md            # docent/walkthrough-section@2 — prose + diff ranges
            s02-dispatch.md
        product/
          wlk_01J9H2R8ZC…/          # kind: product arm of the same envelope (#15)
            manifest.json           # + captures[] registry (product only)
            s01-upload.md           # prose + capture embeds + annotations
            captures/
              9c2a1f0….png          # content-addressed screenshot blob
              a1b2c3d….rrweb.json   # content-addressed recording blob
```

## 3. Review

The **Review** is the durable per-branch file of record — everything docent holds about one branch under review: its append-only history of Changes, its Findings, and its Walkthroughs. Review names the artifact; the act is a "review pass" ([#61](https://github.com/angusfretwell/docent/issues/61), accepting the act/artifact overlap that [#24](https://github.com/angusfretwell/docent/issues/24) had renamed away).

- **Identity = branch name.** One Review per branch. The directory name is the branch-name slug (slashes → dashes); the `branch` field holds the real name.
- **Base ref recorded at creation** — default: the repo's default branch.
- **Auto-created on first use.** There is no explicit "start a review" step.
- **Branch rename = new Review** — an accepted edge ([#24](https://github.com/angusfretwell/docent/issues/24)).
- **No stored pointers.** `review.json` carries no `currentChangeId` (the current head is whatever git says — never a stored pointer under lazy minting) and no `changeIds` (the `changes/` directory _is_ the append-only log; sequential ids self-order) ([#24](https://github.com/angusfretwell/docent/issues/24)).
- **Intent has no field.** What the change is for is read from the branch name, the `base..head` commit messages, and the agent's own session context ([#24](https://github.com/angusfretwell/docent/issues/24)).

### `docent/review@4`

| Field    | Type   | Meaning                                                      |
| -------- | ------ | ------------------------------------------------------------ |
| `schema` | string | `"docent/review@4"`                                         |
| `id`     | string | Stable opaque id (ULID-based)                                |
| `branch` | string | The branch name — the Review's identity                     |
| `base`   | string | Base ref recorded at creation (default: repo default branch) |

```json
{
  "schema": "docent/review@4",
  "id": "rev_01J9GPXQ4H2M",
  "branch": "feat/stream",
  "base": "main"
}
```

**Deferred:** an optional human-readable description is an additive future field ([#24](https://github.com/angusfretwell/docent/issues/24)).

## 4. Change

A **Change** is an immutable snapshot of a diff, identified by its resolved `(baseSha, headSha)` ([#3](https://github.com/angusfretwell/docent/issues/3)). Refs are labels; SHAs are identity. Flattened per [#24](https://github.com/angusfretwell/docent/issues/24): the fields sit directly on the record — the former `source` union is dropped, and there is no Round, Target, or Source entity.

- **`baseSha` = the merge-base — three-dot semantics** (`git merge-base`), matching GitHub's "Files changed" framing. The resolved merge-base SHA is frozen into the Change ([#3](https://github.com/angusfretwell/docent/issues/3)).
- **Minted lazily on first reference** ([#24](https://github.com/angusfretwell/docent/issues/24)). The diff itself always renders the live head straight from git; a Change crystallizes only when a durable artifact must reference the head — a Finding record (which stamps `changeId`, [#20](https://github.com/angusfretwell/docent/issues/20)), a Walkthrough (`bornChangeId`), or a `/review` pass. Minting is **idempotent by identity**: the same `(baseSha, headSha)` never mints twice.
- **History = the heads actually engaged with.** Ten WIP commits plus one review pass = one new Change. Amend, squash, and rebase are not special cases — same new-Change path ([#3](https://github.com/angusfretwell/docent/issues/3), [#24](https://github.com/angusfretwell/docent/issues/24)).
- **Never edited in place.** Each mint appends a sequential `chg_NNN.json` to `changes/`.
- **Lean SHAs, not diff content** ([#3](https://github.com/angusfretwell/docent/issues/3), strengthened by [#24](https://github.com/angusfretwell/docent/issues/24)): a Change stores only SHAs; blobs resolve from local git (`git cat-file`, served over `GET /api/blob/:sha` — see [architecture.md](architecture.md)). Diff-materialization (caching raw diff/blobs under `changes/`) is documented as an additive hardening seam if durability across GC or machines is ever needed — not built in v1.

### `docent/change@3`

| Field        | Type   | Meaning                                            |
| ------------ | ------ | -------------------------------------------------- |
| `schema`     | string | `"docent/change@3"`                                |
| `id`         | string | Sequential per-Review id: `chg_001`, `chg_002`, … |
| `baseSha`    | string | Resolved merge-base SHA — frozen identity          |
| `headSha`    | string | Head commit SHA — frozen identity                  |
| `baseRef`    | string | Base ref label at capture (e.g. `main`)            |
| `headRef`    | string | Head ref label at capture (e.g. `feat/stream`)     |
| `capturedAt` | string | ISO-8601 timestamp of the mint                     |

```json
{
  "schema": "docent/change@3",
  "id": "chg_002",
  "baseSha": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  "headSha": "e4f5a6b7c8d90123456789abcdef012345678901",
  "baseRef": "main",
  "headRef": "feat/stream",
  "capturedAt": "2026-07-10T02:14:00Z"
}
```

**Deferred:** PR metadata (number, url, title, body, author, state) returns someday as an **additive provenance field** on Change — never identity ([#24](https://github.com/angusfretwell/docent/issues/24)). The `source.pr.state` seam that [#20](https://github.com/angusfretwell/docent/issues/20) preserved for future terminal-state badges relocates to that future provenance field; v1 ships neither the signal nor any treatment ([#20](https://github.com/angusfretwell/docent/issues/20), [#24](https://github.com/angusfretwell/docent/issues/24)).

## 5. Finding

A **Finding** is the entity: a single anchored, append-only review conversation, held by a Review, authored by any actor ([#24](https://github.com/angusfretwell/docent/issues/24), promoting [#7](https://github.com/angusfretwell/docent/issues/7)'s "comment thread" to the entity itself). _Comment_, _reply_, _thread_, and _record_ are plain English within a Finding, never entity names.

### 5.1 Event-sourced record directory

A Finding is an **append-only directory of records** ([#7](https://github.com/angusfretwell/docent/issues/7)). Every mutation — reply, resolve, reopen, edit — is a **new file**; no record is ever edited in place. State is **folded at read time**.

This mutation model was chosen over in-place frontmatter edits and over a companion state file because it (1) honors the append-only, lock-free guarantee literally, (2) is the most agent-native shape — an agent replies or resolves by dropping a file, never parse-then-rewrite, and (3) unifies threading and resolution into one mechanism. Cost accepted: reading a Finding is "fold a directory," not "read a file"; history and audit come for free ([#7](https://github.com/angusfretwell/docent/issues/7)).

```
findings/
  fnd_01J9GQ4W7X…/
    001-open.md      # root: anchor + attribution + body — the only record carrying the anchor
    002-reply.md     # attribution + body (+ optional disposition)
    003-resolve.md   # attribution (+ optional reason as the body)
    004-reopen.md    # attribution
```

Record types: **open** (root), **reply**, **resolve**, **reopen**, **edit** ([#7](https://github.com/angusfretwell/docent/issues/7), [#20](https://github.com/angusfretwell/docent/issues/20)). Filenames are `NNN-<type>.md`; the numeric prefix orders the log. An edit record supersedes an earlier record's body at fold time (it names the record it edits).

Folds to: `{ anchor, body, replies[], resolved, participants[] }` ([#7](https://github.com/angusfretwell/docent/issues/7)) — plus the derived, never-persisted reads: drift ([§6](#6-drift)) and what's-next ([§7](#7-whats-next)).

### 5.2 Record schema — `docent/finding@3`

Every record in the directory carries this frontmatter envelope over a plain-markdown body:

| Field         | On                 | Type   | Meaning                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`      | every record       | string | `"docent/finding@3"`                                                                                                                                                                                                                                                                                                                        |
| `author`      | every record       | object | Attribution `{ kind, id, display, model? }` — see [§5.4](#54-attribution)                                                                                                                                                                                                                                                                   |
| `changeId`    | every record       | string | The Change current when the record was authored ([#20](https://github.com/angusfretwell/docent/issues/20)). The root record's `changeId` **is** the Finding's `bornChangeId` — the born anchor's provenance and drift fast path. Writing any record is a minting reference: it mints (or idempotently reuses) the Change for the live head. |
| `createdAt`   | every record       | string | ISO-8601 timestamp                                                                                                                                                                                                                                                                                                                          |
| `anchor`      | root (`open`) only | object | One arm of the anchor union — see [§5.3](#53-the-anchor-union)                                                                                                                                                                                                                                                                              |
| `disposition` | replies, optional  | string | `actioned` \| `declined` \| `question` ([#18](https://github.com/angusfretwell/docent/issues/18)) — see [§7](#7-whats-next)                                                                                                                                                                                                                 |

`changeId` on every record is **capture-now-or-lose-forever** ([#20](https://github.com/angusfretwell/docent/issues/20)): drift and resolved-state are derived at read time and always recoverable, but which Change a past reply or resolve was written against is knowable only at write time. It powers the Findings panel's cross-Change timeline labels ("opened on chg_001 · resolved on chg_004"). No new files, no read-path cost.

Example root record — `findings/fnd_01J9GQ4W7X…/001-open.md`:

```markdown
---
schema: docent/finding@3
author: { kind: agent, id: claude-code, display: "Claude Code", model: claude-fable-5 }
changeId: chg_001
createdAt: 2026-07-10T02:14:00Z
anchor: { kind: line, file: src/parser/stream.ts, side: head, blobSha: 9c2a1f0…, lines: [42, 47] }
---

This backpressure handling drops chunks when the consumer stalls — the
`highWaterMark` check on line 44 races the flush.
```

Example reply with disposition — `002-reply.md`:

```markdown
---
schema: docent/finding@3
author: { kind: human, id: angusfretwell@me.com, display: "Angus" }
changeId: chg_002
createdAt: 2026-07-10T03:02:11Z
disposition: actioned
---

Fixed — the flush now awaits drain before re-checking the mark.
```

Example resolve — `003-resolve.md` (the body, if present, is the optional reason):

```markdown
---
schema: docent/finding@3
author: { kind: agent, id: verify-agent, display: "Verifier" }
changeId: chg_002
createdAt: 2026-07-10T03:20:47Z
---

Verified under load: no dropped chunks across 10k stalled-consumer iterations.
```

### 5.3 The anchor union

The anchor is a **granularity union**, carried on the root record only ([#7](https://github.com/angusfretwell/docent/issues/7)). Seven arms across the three pillars:

```
# Code arms — content-addressed (#7)
{ kind: change }                                            # the whole Change — never drifts
{ kind: file,  file, side, blobSha }                        # one file version
{ kind: line,  file, side, blobSha, lines: [start, end] }   # a range in a blob

# Walkthrough arm — identity-addressed (#14)
{ kind: walkthrough-section, walkthroughId, sectionId }     # a section as an authored unit

# Capture arms — content-addressed captures (#15)
{ kind: screenshot-region,   capture, rect: [x, y, w, h] }  # rect normalized 0..1;
                                                            #   omit rect ⇒ whole screenshot
{ kind: recording-timestamp, capture, fromMs, toMs? }       # point (fromMs) or span (+toMs);
                                                            #   offsets from recording start;
                                                            #   omit fromMs ⇒ whole recording
{ kind: text-span,           section, quote, prefix?, suffix? }  # quote-based, into a
                                                                 #   section's prose
```

Code arms ([#7](https://github.com/angusfretwell/docent/issues/7)):

- **Content-addressed, not diff-row-addressed.** `blobSha` freezes the exact file bytes at birth (git-resolvable); `lines` indexes into _that_ blob. This is the immutable **born anchor** drift is computed against.
- `side ∈ { base, head }` — **both allowed**; commenting on a removed base-side line is a legitimate gesture. Drift tracks the anchor's own side across Changes.
- **Change- and file-level Findings are first-class**, not just line Findings.

Walkthrough arm ([#14](https://github.com/angusfretwell/docent/issues/14)):

- **Identity-based, no `blobSha`** — it targets an authored section, not code bytes. **Narrative-only**: it anchors comments on the section as an authored unit; comments on _code inside_ a section fall through to the `line`/`file` arms unchanged, so they surface in both the Diff tab and the walkthrough (one source of truth).
- **Pillar-agnostic**: the same arm carries narrative comments on product-walkthrough sections ([#15](https://github.com/angusfretwell/docent/issues/15)).

Capture arms ([#15](https://github.com/angusfretwell/docent/issues/15)):

- `capture` names a `cap_` id in a product walkthrough's manifest; its media is an immutable, content-addressed blob. `rect` is normalized 0..1 so overlays render dims-independently (the capture's `dims` recovers exact pixels). `fromMs`/`toMs` are offsets from recording start (rrweb absolute timestamps normalized to zero). `text-span` is quote-based — robust to prose edits and agent-native.
- **No `side`** — captures are not two-sided like diffs. **No separate whole-capture arm** — a whole-capture Finding is the fine-grained arm with its coordinate omitted.

Note the distinction pinned by [#15](https://github.com/angusfretwell/docent/issues/15): a walkthrough **annotation** (the generator's authored callout, living inside a section file, not resolvable) and a reviewer's **Finding** are two mechanisms sharing this one pointer vocabulary — see [walkthroughs.md](walkthroughs.md).

**Deferred:** factoring `text-span` out of the product pillar for code-walkthrough prose is flagged but not built — it is shape-identical if the code side ever wants it ([#15](https://github.com/angusfretwell/docent/issues/15)).

### 5.4 Attribution

```
author: { kind: human | agent, id, display, model? }
```

- `kind` is a **closed two-value discriminant** — the load-bearing axis (drives UI treatment, filtering, future trust rules) ([#7](https://github.com/angusfretwell/docent/issues/7)).
- `id` is the stable machine handle (git email / agent slug); `display` renders; `model` is optional agent metadata.
- Each record carries its own author, so a Finding's `participants[]` folds out naturally.
- **Attribution is metadata, never permission** ([#18](https://github.com/angusfretwell/docent/issues/18)): reviewing, fixing, and resolving are roles, not actors — a human or an agent can occupy any, and an agent can resolve another agent's Finding.

**Deferred:** provenance (which prompt/session produced an agent record) is deliberately not modeled here — it belongs to agent-integration mechanics ([#7](https://github.com/angusfretwell/docent/issues/7); see [agent-integration.md](agent-integration.md)).

### 5.5 Body

Plain **markdown** ([#7](https://github.com/angusfretwell/docent/issues/7)).

**Deferred:** structured code-suggestion blocks ("suggested change") are a real but separable feature ([#7](https://github.com/angusfretwell/docent/issues/7)).

## 6. Drift

**Drift** is a Finding anchor's standing against the newest Change, given it was born on an earlier one — computed **lazily at render time** from the immutable born anchor, never persisted, never auto-toggling anything ([#3](https://github.com/angusfretwell/docent/issues/3), [#7](https://github.com/angusfretwell/docent/issues/7)).

### 6.1 Content-addressed arms (`file`, `line`) — blob-to-blob re-anchor

Re-anchor by a **blob-to-blob diff on the anchor's own side**: diff the born blob (via `blobSha`) against the newest Change's blob for that file, and map the anchored range through the edit script ([#7](https://github.com/angusfretwell/docent/issues/7)):

| State        | Meaning                                                   | Render                                                                                                |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **live**     | present, byte-identical, same line numbers                | pinned in place; no badge                                                                             |
| **shifted**  | present, byte-identical, moved                            | re-anchored to new lines; **informational** badge, not a warning                                      |
| **outdated** | anchored bytes edited or deleted — no confident re-anchor | **detaches**, renders against its **born text** (recoverable via `blobSha`); never pins to wrong code |

The live/shifted boundary is forced by the three-state vocabulary: `outdated` already owns "content changed," so a pure line-move must be `shifted` or the middle state has no referent ([#7](https://github.com/angusfretwell/docent/issues/7)).

Fast paths ([#7](https://github.com/angusfretwell/docent/issues/7), restated for lazy minting per [#24](https://github.com/angusfretwell/docent/issues/24)): a Finding whose root `changeId` is the newest minted Change of a still-current head is live without computing; `change`-kind never drifts; `file`-kind drifts only on delete/rename.

### 6.2 Identity-addressed arms — no `shifted`

`walkthrough-section` and the three capture arms target immutable authored artifacts, so the blob-to-blob edit-script re-anchor has no analog (there is no meaningful edit script between two screenshots, and re-mapping a timestamp across a re-record is unreliable — deliberately not attempted). Drift is **identity-based** ([#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15)):

- **live** while the anchored section/capture exists in its (immutable) walkthrough; **outdated** once the walkthrough is superseded or the target removed — then the Finding **detaches and renders against its born target** (the born section prose, or the born capture recoverable via its content sha).
- **No `shifted`** — nothing moves within an immutable image or an authored section.

Walkthrough-level staleness (`bornChangeId` vs the newest Change) and per-range/section drift rollup are owned by [walkthroughs.md](walkthroughs.md); they reuse this same vocabulary and algorithm verbatim.

### 6.3 Resolution is orthogonal to drift

`resolve`/`reopen` are records; resolution **persists across Changes** (minting appends nothing to any Finding) and drift **never auto-toggles** resolution. The UI surfaces the **(drift × resolved) matrix** instead of automating ([#7](https://github.com/angusfretwell/docent/issues/7)):

|                | **live**           | **outdated**                                                           |
| -------------- | ------------------ | ---------------------------------------------------------------------- |
| **unresolved** | the live work item | **re-check signal**: you flagged this, the code changed underneath you |
| **resolved**   | settled; collapsed | the healthy end state (flagged → fixed → resolved); collapsed          |

(`shifted` renders as live-with-badge on the drift axis.) Where detached/outdated Findings surface — the Findings panel — is owned by [diff-review.md](diff-review.md) ([#20](https://github.com/angusfretwell/docent/issues/20) as reworded by [#24](https://github.com/angusfretwell/docent/issues/24)).

**Deferred:** Change time-travel (re-rendering an earlier Change's diff with its Findings as they stood) is out of scope for v1 — born text travels with each Finding, so an outdated Finding's original context is readable without it. Seam preserved: the frozen Change history plus per-record `changeId` ([#20](https://github.com/angusfretwell/docent/issues/20)).

## 7. What's-next

The **actor-blind** queue read pinned by [#18](https://github.com/angusfretwell/docent/issues/18). Two axes fold from a Finding's records:

- **Axis 1 — open / resolved**, folded from `resolve`/`reopen` records.
- **Axis 2 — what's-next** (for open Findings), derived from the **latest record's** disposition, blind to who authored it:

| Latest record                                                  | What's-next        |
| -------------------------------------------------------------- | ------------------ |
| fresh Finding · plain comment · "do it again" (no disposition) | **needs action**   |
| reply with `disposition: actioned`                             | **needs verify**   |
| reply with `disposition: question`                             | **needs answer**   |
| reply with `disposition: declined`                             | **needs decision** |
| resolve                                                        | **closed**         |

- **Disposition** ∈ `{actioned, declined, question}` is MECE for how a fixer ends its turn; a fresh Finding or plain comment carries none — it simply needs action. This is the only schema addition [#18](https://github.com/angusfretwell/docent/issues/18) makes: an optional field on the reply record.
- **Author-kind is not a routing signal.** A first-pass rule that routed by human-vs-agent authorship was replaced by disposition; "the agent reviews me" and "I review the agent" differ only in who authors record `001`.
- The loop: review → write (**needs action**) → fetch → fix → reply (**needs verify / answer / decision**) → verify → resolve (**closed**); re-commenting reopens the cycle at **needs action** ([#18](https://github.com/angusfretwell/docent/issues/18)).
- **Resolution is unconstrained and reopenable**: any actor may write a resolve record, including an agent resolving another agent's Finding — safe because a resolve is an append-only, attributed, reopenable event. `fixer ≠ resolver` is recommended guidance for the verify skill, not a mechanism-level rule ([#18](https://github.com/angusfretwell/docent/issues/18)).
- A reviewer defaults to the **live head** (minting a Change on reference) and may target any prior Change in history — an older-Change Finding is simply born drifted against head, which is what drift is for ([#18](https://github.com/angusfretwell/docent/issues/18) as amended by [#24](https://github.com/angusfretwell/docent/issues/24)).

The `write-findings` / `fetch-findings` I/O primitives and skill contracts over this state machine are owned by [agent-integration.md](agent-integration.md).

## 8. Mark-as-viewed storage

Semantics (manual-only checkbox, collapse-on-view, progress read-model, edge cases) are owned by [diff-review.md](diff-review.md); this section pins the storage shape ([#9](https://github.com/angusfretwell/docent/issues/9)):

- **Append-only viewed events** under the Review (`viewed/`, directory-of-files per [#2](https://github.com/angusfretwell/docent/issues/2)'s granularity convention), each event `{ path, blobSha, ts }`.
- **Keyed on the file's head blob SHA** — "viewed" asserts _I've seen this file's resulting content_. On a new Change: head blob byte-identical → viewed persists; head blob changed → viewed clears and the file flags "changed since viewed". A pure rebase that leaves head content identical keeps the marks — consistent with the content-addressed drift philosophy.
- **Viewed is orthogonal to Finding resolution** — its own axis, exactly as resolution is orthogonal to drift. Solo tool → single reviewer, no multi-user viewed state.
- **Progress** (viewed files / total files in the Change) is a pure read-model over the viewed events — nothing else is persisted; it recomputes per Change automatically.

```json
{ "path": "src/parser/stream.ts", "blobSha": "9c2a1f0…", "ts": "2026-07-10T02:31:07Z" }
```

## 9. Schema lineage

| Schema                         | Current version                                     | Pinned by                                                                                                                                                          | Supersedes / lineage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docent/review@4`             | `@4`                                                | [#61](https://github.com/angusfretwell/docent/issues/61)                                                                                                           | `docent/review@1` ([#2](https://github.com/angusfretwell/docent/issues/2), provisional) → `docent/review@2` ([#3](https://github.com/angusfretwell/docent/issues/3), PR-keyed, `currentChangeId`/`changeIds`) → renamed to `docent/dossier@3`, pointers dropped ([#24](https://github.com/angusfretwell/docent/issues/24)) → renamed back to `docent/review@4` ([#61](https://github.com/angusfretwell/docent/issues/61))                                                                                                                                                             |
| `docent/change@3`              | `@3`                                                | [#24](https://github.com/angusfretwell/docent/issues/24)                                                                                                           | `docent/change@1` ([#2](https://github.com/angusfretwell/docent/issues/2), provisional) → `docent/change@2` ([#3](https://github.com/angusfretwell/docent/issues/3), `source` union + PR metadata) → flattened, GitHub source deferred ([#24](https://github.com/angusfretwell/docent/issues/24))                                                                                                                                                                                                                                                                                     |
| `docent/finding@3`             | `@3`                                                | consolidation (this spec), folding the amendments below                                                                                                            | `docent/comment@1` ([#2](https://github.com/angusfretwell/docent/issues/2), single file, `resolved:` frontmatter) → `docent/comment@2` ([#7](https://github.com/angusfretwell/docent/issues/7), event-sourced `comments/thr_*` dirs) → + optional `disposition` on replies ([#18](https://github.com/angusfretwell/docent/issues/18)) → + `changeId` on every record ([#20](https://github.com/angusfretwell/docent/issues/20)) → renamed `findings/fnd_*` + `docent/finding@3`, resolving the naming-alignment item [#24](https://github.com/angusfretwell/docent/issues/24) flagged |
| `docent/walkthrough@2`         | `@2` — detail in [walkthroughs.md](walkthroughs.md) | [#14](https://github.com/angusfretwell/docent/issues/14) (`kind: code`), [#15](https://github.com/angusfretwell/docent/issues/15) (`kind: product` + `captures[]`) | `docent/walkthrough@1` ([#2](https://github.com/angusfretwell/docent/issues/2), draft)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `docent/walkthrough-section@2` | `@2` — detail in [walkthroughs.md](walkthroughs.md) | [#14](https://github.com/angusfretwell/docent/issues/14) / [#15](https://github.com/angusfretwell/docent/issues/15)                                                | `docent/walkthrough-section@1` ([#2](https://github.com/angusfretwell/docent/issues/2), draft)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| viewed event                   | `{path, blobSha, ts}`                               | [#9](https://github.com/angusfretwell/docent/issues/9)                                                                                                             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Superseded shapes exist only in ticket history; nothing on disk ever migrates in place — a repo starts at the current versions, and every record self-describes.
