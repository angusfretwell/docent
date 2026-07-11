---
name: docent-cli
description: Reference for the `docent` binary's non-`serve` subcommands — the `docent finding` review-loop primitives and the `docent walkthrough` / `docent capture` write path. Use when a skill (`/to-docent`, `/address`, `/author-code-walkthrough`, `/author-product-walkthrough`, `/capture-product-walkthrough`) or a power user needs to read or write Findings, walkthroughs, or captures in `.docent/` from the command line.
---

# docent-cli

The `docent` binary has **two faces** (agent-integration.md §3.3):

- **`docent serve`** — the server + UI. Watches `.docent/`, renders the Review, streams updates over SSE. Not covered here.
- **Non-`serve` subcommands** — `docent finding list / add / reply / resolve / reopen / edit`, plus the `docent walkthrough` / `docent capture` write path. This skill documents them.

The finding subcommands are the CLI half of the review loop's **two I/O primitives** (agent-integration.md §2.2):

| Primitive | Subcommand | Does |
| --- | --- | --- |
| **fetch-findings** | `docent finding list --filter …` | Read the queue (any author), filtered |
| **write-findings** | `docent finding add / reply / resolve / reopen / edit` | Append a finding / reply / resolve / reopen / edit record |

## Non-gating — the CLI is convenience, never a lock

The files under `.docent/` stay **plain and directly writable**. The CLI is the _canonical, convenient_ path — it is the single home for ULID minting, anchor construction (resolving a code arm's content-addressed `blobSha` from git), append semantics, and what's-next / Disposition derivation — but it never gates. An agent could hand-author the identical `docent/finding@3` record file, and a running `docent serve` fs-watches every write, CLI-made or direct, and re-renders over SSE (agent-integration.md §1, §3.3). Both the UI's write path and the CLI share **one** `writeFindingRecord` implementation — no divergence.

Prefer the CLI: it validates the record against the same schema the server uses and resolves anchors for you. Hand-authoring is the fallback when the CLI isn't available.

## Where it runs

Run it from **inside the repo under review** (any subdirectory). It resolves the repo, the current branch's Review, and the Change refs — base at the merge-base, head at the branch tip — from git. It reads and writes under `.docent/reviews/<branch-slug>/`. The Review auto-creates on first use; a Change mints lazily on first reference. No server needs to be running.

Every subcommand prints **machine-readable JSON** on stdout, so a skill can consume the result directly.

## `docent finding list` — fetch-findings

Walks the active Review, folds every Finding, applies the filter, and prints `{ "findings": [ … ] }` in reading order (code findings first, by file then line; then whole-change, walkthrough, capture, text, detached).

```bash
docent finding list                              # the whole queue
docent finding list --open                       # unresolved only
docent finding list --resolved                   # resolved only
docent finding list --whats-next needs-action    # only findings needing action
docent finding list --whats-next needs-verify,needs-answer   # any-of (comma or repeat)
docent finding list --anchor-file src/app.ts     # anchored on this file
docent finding list --author claude-code         # this author participated
```

Filters (all optional, all AND-combined):

| Flag | Keeps |
| --- | --- |
| `--open` | Unresolved findings. `--open` and `--resolved` together (or neither) keep all. |
| `--resolved` | Resolved findings. |
| `--whats-next` | Only these what's-next states — any-of; repeat the flag or comma-join the values. |
| `--anchor-file` | Only findings whose `line`/`file` code anchor is this path. |
| `--author` | Only findings this author id participated in. |

**what's-next values** — `needs-action`, `needs-verify`, `needs-answer`, `needs-decision`, `closed`. Derived actor-blind from each Finding's latest record (agent-integration.md §2.3):

| Latest record                                 | what's-next        |
| --------------------------------------------- | ------------------ |
| fresh Finding · plain comment · "do it again" | **needs-action**   |
| reply with Disposition `actioned`             | **needs-verify**   |
| reply with Disposition `question`             | **needs-answer**   |
| reply with Disposition `declined`             | **needs-decision** |
| resolve                                       | **closed**         |

Each folded finding carries `id`, `anchor`, `body`, `participants[]`, `replies[]`, `resolved`, and `whatsNext` — enough to route it without a second read.

## `docent finding add` — write a fresh Finding

Mints an anchored Finding (record `001-open.md`), born **needs-action**. Requires an anchor and a body.

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

## `docent finding reply` — write a reply, carrying a Disposition

Appends a reply record to an open Finding. A reply may carry a **Disposition** — the kind of turn-hand-back — from which what's-next derives:

```bash
docent finding reply --finding fnd_… --disposition actioned  --body "Fixed: added the missing guard."
docent finding reply --finding fnd_… --disposition declined  --body "Intentional — see the ADR on locking."
docent finding reply --finding fnd_… --disposition question  --body "Do you mean the read lock or the write lock?"
docent finding reply --finding fnd_… --body "Bumping this — still reproduces."   # no disposition → needs-action again
```

| `--disposition` | what's-next        | Means                              |
| --------------- | ------------------ | ---------------------------------- |
| `actioned`      | **needs-verify**   | Fixed — a resolver should verify.  |
| `declined`      | **needs-decision** | Won't fix — a human should decide. |
| `question`      | **needs-answer**   | Blocked on an answer.              |
| _(omitted)_     | **needs-action**   | Plain comment / "do it again".     |

`--finding <id>` is required (a missing or empty id is a usage error — never a stray write). Body required.

## `docent finding resolve` — close a Finding

Appends a resolve record → **closed**. The body (an optional reason) may be omitted.

```bash
docent finding resolve --finding fnd_…                          # close, no reason
docent finding resolve --finding fnd_… --body "Verified against head — the guard holds."
```

Resolution is **unconstrained**: any actor may resolve any Finding, including an agent resolving another agent's. It is safe because a resolve is an append-only, attributed, **reopenable** event — a later reply reopens the Finding (agent-integration.md §2.6). Whether a given actor _should_ resolve is a role question, not a mechanism one: a verify pass resolves; a fixer never resolves what it just fixed (§3.1, §2.6).

## `docent finding reopen` — return a resolved Finding to open

Appends a reopen record → back to **needs-action**. A later reply reopens a Finding implicitly; `reopen` is the explicit gesture when you want to reopen without adding a comment.

```bash
docent finding reopen --finding fnd_…
```

`--finding <id>` is required (a missing or empty id is a usage error). No body.

## `docent finding edit` — supersede a record's body

Appends an edit record that supersedes an earlier record's body at fold time (data-model.md §5.1) — the append-only equivalent of an in-place body edit. `--record` names the target record's filename (as returned by `add` / `reply` / `resolve`, e.g. `002-reply.md`); the new body replaces the target's when the Finding is folded. The original file is never rewritten.

```bash
docent finding edit --finding fnd_… --record 001-open.md --body "Revised: the flush races the drain, not the mark."
docent finding edit --finding fnd_… --record 002-reply.md <<'EOF'
Multi-line revised body…
EOF
```

`--finding <id>` and `--record <name>` are both required (a missing or empty flag is a usage error). Body required — `--body <text>` or piped stdin. Editing only supersedes the target's **body**; it never changes its anchor, disposition, or resolved-state, so what's-next is unaffected.

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

Registers one media file on a **product** walkthrough (walkthroughs.md §6) — content-addresses the bytes into `captures/<sha>.{png,rrweb.json}` (byte-identical media dedups to one blob) and appends the `captures[]` registry entry. A code walkthrough has no capture arm, so it is refused.

```bash
docent capture add --walkthrough wlk_… --kind screenshot --media shot.png \
  --route /signup --viewport 1280x800 --dims 1280x2400          # screenshot: --dims WxH
docent capture add --walkthrough wlk_… --kind recording --media rec.rrweb.json \
  --route /signup --viewport 1280x800 --duration-ms 8200        # recording: --duration-ms
#   → { "captureId": "cap_…", "media": "<sha>", "registry": { … }, "walkthroughId": "wlk_…" }
```

`--dims` is for screenshots and `--duration-ms` for recordings; the mismatch is refused. `--media` is a file path read relative to the cwd. This is the CLI half of `/capture-product-walkthrough`, which drives the browser to produce the media.

## Attribution — metadata, never permission

Every write records **who** did it; it never gates **who may** (agent-integration.md §2.1). By default the write is attributed to the git-config human (matching the UI's write path). Override to attribute to an agent:

```bash
docent finding add --change --body "…" --agent claude-code --model claude-fable-5
docent finding reply --finding fnd_… --disposition actioned --body "…" --agent claude-code
```

| Flag        | Effect                                                     |
| ----------- | ---------------------------------------------------------- |
| `--agent`   | Attribute to an agent with this slug (else the git human). |
| `--display` | Override the display name.                                 |
| `--model`   | Optional agent model metadata.                             |

When you run one of these subcommands **as an agent inside a skill**, pass `--agent <your-slug>` so the Finding's attribution reads true in the UI.

## Output shape

- `finding list` → `{ "findings": [ { "id", "anchor", "body", "participants", "replies", "resolved", "whatsNext" }, … ] }`
- `finding add` / `reply` / `resolve` / `reopen` / `edit` → `{ "changeId": "chg_…", "findingId": "fnd_…", "record": "NNN-<type>.md" }`
- `walkthrough create` → `{ "changeId", "walkthroughId" }`; `walkthrough add-section` → `{ "section", "sectionId", "walkthroughId" }`
- `capture add` → `{ "captureId", "media", "registry", "walkthroughId" }`

Errors go to stderr and exit non-zero, with a human-readable message (a bad flag, a missing anchor, an unknown subcommand).
