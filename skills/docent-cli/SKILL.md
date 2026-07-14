---
name: docent-cli
description: Reference for the `docent` binary's non-`serve` subcommands — the `docent finding` review-loop primitives and the `docent walkthrough` / `docent capture` write path. Use when a skill (`/to-docent`, `/from-docent`, `/author-code-walkthrough`, `/author-product-walkthrough`, `/capture-product-walkthrough`) or a power user needs to read or write Findings, walkthroughs, or captures in `.docent/` from the command line.
---

# docent-cli

The `docent` binary has **two faces**:

- **`docent serve`** — the server + UI. Watches `.docent/`, renders the Review, streams updates over SSE. Not covered here.
- **Non-`serve` subcommands** — `docent finding list / add / reply / action / resolve / reopen / edit`, plus the `docent walkthrough` / `docent capture` write path and `docent review set`. This skill documents them.

The finding subcommands are the CLI half of the review loop's **two I/O primitives**:

| Primitive | Subcommand | Does |
| --- | --- | --- |
| **fetch-findings** | `docent finding list --status …` | Read the queue (any author), filtered |
| **write-findings** | `docent finding add / reply / action / resolve / reopen / edit` | Append one append-only record |

## Non-gating — the CLI is convenience, never a lock

The files under `.docent/` stay **plain and directly writable**. The CLI is the _canonical, convenient_ path — it is the single home for ULID minting, anchor construction (resolving a code arm's content-addressed `blobSha` from git), append semantics, and Status derivation — but it never gates. An agent could hand-author the identical `docent/finding` record file, and a running `docent serve` fs-watches every write, CLI-made or direct, and re-renders over SSE. Both the UI's write path and the CLI share **one** `writeFindingRecord` implementation — no divergence.

Prefer the CLI: it validates the record against the same schema the server uses and resolves anchors for you. Hand-authoring is the fallback when the CLI isn't available.

## Where it runs

Run it from **inside the repo under review** (any subdirectory). It resolves the repo, the current branch's Review, and the Change refs — base at the merge-base, head at the branch tip — from git. It reads and writes under `.docent/reviews/<branch-slug>/`. The Review auto-creates on first use; a Change mints lazily on first reference. No server needs to be running.

Every subcommand prints **machine-readable JSON** on stdout, so a skill can consume the result directly.

## `docent finding list` — fetch-findings

Walks the active Review, folds every Finding, applies the filter, and prints `{ "findings": [ … ] }` in reading order (code findings first, by file then line; then whole-change, walkthrough, capture, text, detached).

```bash
docent finding list                              # the whole queue
docent finding list --status open                # only findings someone owes work on
docent finding list --status open,actioned       # everything unresolved (any-of: comma or repeat)
docent finding list --status actioned            # handed back — awaiting verification
docent finding list --status resolved            # closed only
docent finding list --anchor-file src/app.ts     # anchored on this file
docent finding list --author claude-code         # this author participated
```

Filters (all optional, all AND-combined):

| Flag | Keeps |
| --- | --- |
| `--status` | Only these statuses — any-of; repeat the flag or comma-join the values. Omitted keeps all. |
| `--anchor-file` | Only findings whose `line`/`file` code anchor is this path. |
| `--author` | Only findings this author id participated in. |

**Status values** — `open`, `actioned`, `resolved`. Derived actor-blind from the type of each Finding's latest non-`edit` record:

| Latest record | Status | Means |
| --- | --- | --- |
| `open` · `reply` · `reopen` | **open** | Someone owes this work. |
| `action` | **actioned** | The turn was handed back — verify it. |
| `resolve` | **resolved** | Closed. |

`edit` records are skipped, so editing a body never moves Status.

Each folded finding carries `id`, `anchor`, `body`, `participants[]`, `replies[]`, and `status` — enough to route it without a second read.

## `docent finding add` — write a fresh Finding

Mints an anchored Finding (record `001-open.md`), born **open**. Requires an anchor and a body.

```bash
# whole-change note
docent finding add --change --body "The error path is never tested."

# anchored on a line range of the head side
docent finding add --file src/app.ts --line 42:47 --body "This early-return leaks the lock."

# anchored on a whole file (default side is head)
docent finding add --file src/app.ts --body "This module has no exports."

# on the base side of the diff
docent finding add --file src/app.ts --line 10 --side base --body "This was the safe version."

# body via stdin (heredoc or pipe) when it is long / multi-line — omit --body
docent finding add --change <<'EOF'
Multi-paragraph finding body…
EOF
```

**Anchor** (exactly one required):

| Form | Anchor |
| --- | --- |
| `--change` | The whole Change. |
| `--file <path>` | The whole file. `--side base\|head` (default `head`). |
| `--file <path> --line <N[:M\|-M]>` | A line range (1-based, inclusive). `N`, `N:M`, or `N-M`. `--side`. |
| `--anchor '<json>'` | Escape hatch — a raw anchor arm, validated against the schema. Use for the capture / walkthrough / text-span arms the convenience flags don't cover. |

The CLI resolves the code arm's content-addressed `blobSha` from git at write time, freezing the exact bytes the anchor points at.

**Body** — `--body <text>`, or **omit `--body` and pipe it on stdin** (heredoc / pipe). A body is required for `add`; if neither a flag nor piped stdin gives one, it is a usage error.

## `docent finding reply` — write prose on a Finding

Appends a reply record. **Prose only** — a reply is the one place an outcome gets explained, and being the latest record it leaves the Finding **open**. That is deliberate: any comment reclaims the turn, so a reply on an `actioned` or `resolved` Finding returns it to the queue.

```bash
docent finding reply --finding fnd_… --body "Fixed: added the missing guard."
docent finding reply --finding fnd_… --body "Intentional — see the ADR on locking."
docent finding reply --finding fnd_… --body "Bumping this — still reproduces."
```

`--finding <id>` is required (a missing or empty id is a usage error — never a stray write). Body required.

## `docent finding action` — hand the turn back

Appends an action record → **actioned**. It carries **no body**: write the `reply` that explains the outcome first, then `action` to move the Finding.

```bash
docent finding reply  --finding fnd_… --body "Fixed: added the missing guard."
docent finding action --finding fnd_…
```

`actioned` is deliberately **broad** — it means _"I took my turn, over to you"_, whether you fixed it, declined it, or asked a question. The distinction lives in the reply prose, not in an enum. Use it for all three:

| You…                 | Write                                     |
| -------------------- | ----------------------------------------- |
| Fixed it             | `reply` explaining the fix, then `action` |
| Won't fix it         | `reply` explaining why, then `action`     |
| Need an answer first | `reply` asking, then `action`             |

Handing back matters: without the `action`, the Finding stays `open` and the next fetch picks it up again, so a decline you never handed back gets re-attempted forever.

`--finding <id>` is required. No body.

## `docent finding resolve` — close a Finding

Appends a resolve record → **resolved**. It carries **no body**; if the close needs a reason, `reply` it first.

```bash
docent finding reply   --finding fnd_… --body "Verified against head — the guard holds."
docent finding resolve --finding fnd_…
```

Resolution is **unconstrained**: any actor may resolve any Finding, including an agent resolving another agent's. It is safe because a resolve is an append-only, attributed, **reopenable** event — a later reply reopens the Finding. Whether a given actor _should_ resolve is a role question, not a mechanism one: a verify pass resolves; a fixer never resolves what it just fixed.

## `docent finding reopen` — return a resolved Finding to open

Appends a reopen record → back to **open**. A later reply reopens a Finding implicitly; `reopen` is the explicit gesture when you want to reopen without adding a comment.

```bash
docent finding reopen --finding fnd_…
```

`--finding <id>` is required (a missing or empty id is a usage error). No body.

## `docent finding edit` — supersede a record's body

Appends an edit record that supersedes an earlier record's body at fold time — the append-only equivalent of an in-place body edit. `--record` names the target record's filename (as returned by `add` / `reply`, e.g. `002-reply.md`); the new body replaces the target's when the Finding is folded. The original file is never rewritten.

```bash
docent finding edit --finding fnd_… --record 001-open.md --body "Revised: the flush races the drain, not the mark."
docent finding edit --finding fnd_… --record 002-reply.md <<'EOF'
Multi-line revised body…
EOF
```

`--finding <id>` and `--record <name>` are both required (a missing or empty flag is a usage error). Body required — `--body <text>` or piped stdin. Editing only supersedes the target's **body**; it never changes its anchor, and `edit` records are skipped when Status is derived, so Status is unaffected.

## `docent walkthrough` — the walkthrough write path

Mints and grows a walkthrough (walkthroughs.md §4, §5). A manifest is assembled incrementally: `create` writes the shell, then `add-section` appends. Two subcommands:

```bash
# create — mint a wlk_ shell, bind bornChangeId to the live head (minting the Change if the head has none)
docent walkthrough create --kind code --title "…"        # or --kind product
docent walkthrough create --kind product                 # no --title → an empty-title shell (the capture flow)
#   → { "changeId": "chg_…", "walkthroughId": "wlk_…" }

# add-section — validate + append one section, in tour order (the manifest array IS the order)
docent walkthrough add-section --walkthrough wlk_… --title "…" [targets] [--body <text> | stdin]
#   → { "section": "sNN-<slug>.md", "sectionId": "sec_…", "walkthroughId": "wlk_…" }
```

**`create`** requires `--kind code|product`; `--title` (the walkthrough's title) is **optional** — omit it to mint an empty-title shell, which is how `/capture-product-walkthrough` mints the product shell (a title is editorial, so the author skill fills it later). `add-section` **does** require a `--title`, but that one names the **section**. There is **no subcommand to rename the walkthrough shell** after `create` — to set a shell's title later, edit `manifest.json`'s `title` field directly. That is safe and non-gating: the file is plain and `docent serve` re-renders the edit.

**`add-section`** carries the arm for the walkthrough's `kind` — the **code** arm is `--range`, the **product** arm is `--capture` / `--annotation`. The crossed arm (a `--range` on a product tour, or `--capture`/`--annotation` on a code tour) is refused.

| Flag | Arm | Value |
| --- | --- | --- |
| `--range` | code | `file:start[-end][@side]` — e.g. `src/index.ts:10-24@head`, `src/a.ts:40` (single line, side defaults `head`). Repeatable. |
| `--capture` | product | A `cap_` id from the manifest's `captures[]`. Repeatable (or comma-joined). |
| `--annotation` | product | One JSON callout (see below). Repeat the flag per annotation — never comma-join (the JSON embeds commas). |

- Each `--range` resolves its content-addressed **`blobSha` from git** at write time, landing the range in the same `line`-anchor coordinate a Finding uses (walkthroughs.md §5), frozen to the exact bytes on its `side`.
- **Body** — `--body <text>`, or omit it and pipe the body on **stdin** (heredoc / pipe) for multi-line prose.
- **Literate interleave** — the body may place `{{range:i}}` (code) / `{{capture:i}}` (product) markers to narrate _between_ targets; `i` is the target's position in the `--range` / `--capture` list, in the order passed. **No markers ⇒ targets render in order after the prose** (the flat fallback, walkthroughs.md §5).
- **Annotation JSON** — `{ "anchor": <arm>, "body": "…" }`, validated against the same `Anchor` schema Findings use. The product arms:

  ```jsonc
  { "kind": "screenshot-region", "capture": "cap_a", "rect": [0.1, 0.2, 0.3, 0.1] } // rect [x,y,w,h], normalized 0–1
  { "kind": "recording-timestamp", "capture": "cap_b", "fromMs": 3200, "toMs": 5000 } // ms from recording start
  ```

  The CLI validates the annotation's **schema shape only** — it does **not** check that `anchor.capture` is one of the section's `--capture` ids; keeping that true is the author's job.

## `docent capture` — content-address a capture blob

Registers one media file on a **product** walkthrough (walkthroughs.md §6) — content-addresses the bytes into `captures/<sha>.rrweb.json` (byte-identical media dedups to one blob) and appends the `captures[]` registry entry. A code walkthrough has no capture arm, so it is refused.

```bash
docent capture add --walkthrough wlk_… --kind screenshot --media shot.rrweb.json \
  --route /signup --viewport 1280x800 --dims 1280x2400 --title "Empty signup form"   # screenshot: --dims WxH
docent capture add --walkthrough wlk_… --kind recording --media rec.rrweb.json \
  --route /signup --viewport 1280x800 --duration-ms 8200 --title "Submitting the signup"   # recording: --duration-ms
#   → { "captureId": "cap_…", "media": "<sha>", "registry": { … }, "walkthroughId": "wlk_…" }
```

`--dims` is for screenshots and `--duration-ms` for recordings; the mismatch is refused. `--media` is a file path read relative to the cwd. `--title` is **optional** — a short descriptive name for the captured state that the Review shows in place of the generic "Screenshot 1" / "Recording 1"; an untitled capture falls back to its ordinal. This is the CLI half of `/capture-product-walkthrough`, which drives the browser to produce the media.

## `docent review set` — name the change under review

The Review auto-creates with everything git can resolve (its branch, its base). Its **title** — a short human name for the change, which the UI renders as the header's headline — is the one field git cannot infer, so an authoring run captures it:

```bash
docent review set --title "Palette panel"
#   → { "base": "main", "branch": "feat/panel", "id": "rev_…", "schema": "docent/review", "title": "Palette panel" }
```

`--title <text>` is required (a missing or empty value is a usage error). Titles are **short** — a few words naming the change, the way a PR title does, not a summary of it. Re-running `set` renames in place, keeping the Review's `id`: unlike every other record under `.docent/`, `review.json` is a singleton identity record, not an append-only log.

## Attribution — metadata, never permission

Every write records **who** did it; it never gates **who may**. By default the write is attributed to the git-config human (matching the UI's write path). Override to attribute to an agent:

```bash
docent finding add --change --body "…" --agent claude-code --model claude-fable-5
docent finding action --finding fnd_… --agent claude-code
```

| Flag        | Effect                                                     |
| ----------- | ---------------------------------------------------------- |
| `--agent`   | Attribute to an agent with this slug (else the git human). |
| `--display` | Override the display name.                                 |
| `--model`   | Optional agent model metadata.                             |

When you run one of these subcommands **as an agent inside a skill**, pass `--agent <your-slug>` so the Finding's attribution reads true in the UI.

## Output shape

- `finding list` → `{ "findings": [ { "id", "anchor", "body", "participants", "replies", "status" }, … ] }`
- `finding add` / `reply` / `action` / `resolve` / `reopen` / `edit` → `{ "changeId": "chg_…", "findingId": "fnd_…", "record": "NNN-<type>.md" }`
- `walkthrough create` → `{ "changeId", "walkthroughId" }`; `walkthrough add-section` → `{ "section", "sectionId", "walkthroughId" }`
- `capture add` → `{ "captureId", "media", "registry", "walkthroughId" }`

Errors go to stderr and exit non-zero, with a human-readable message (a bad flag, a missing anchor, an unknown subcommand).
