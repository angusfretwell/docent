---
name: docent-cli
description: Reference for the `docent` binary's non-`serve` subcommands — the `docent finding list / add / reply / resolve` review-loop primitives. Use when a skill (`/review`, `/address`) or a power user needs to read or write Findings in `.docent/` from the command line.
---

# docent-cli

The `docent` binary has **two faces** (agent-integration.md §3.3):

- **`docent serve`** — the server + UI. Watches `.docent/`, renders the Dossier, streams updates over SSE. Not covered here.
- **Non-`serve` subcommands** — `docent finding list / add / reply / resolve`. This skill documents them.

The finding subcommands are the CLI half of the review loop's **two I/O primitives** (agent-integration.md §2.2):

| Primitive          | Subcommand                             | Does                                            |
| ------------------ | -------------------------------------- | ----------------------------------------------- |
| **fetch-findings** | `docent finding list --filter …`       | Read the queue (any author), filtered           |
| **write-findings** | `docent finding add / reply / resolve` | Append a finding / a reply / a resolve record   |

## Non-gating — the CLI is convenience, never a lock

The files under `.docent/` stay **plain and directly writable**. The CLI is the *canonical, convenient* path — it is the single home for ULID minting, anchor construction (resolving a code arm's content-addressed `blobSha` from git), append semantics, and what's-next / Disposition derivation — but it never gates. An agent could hand-author the identical `docent/finding@3` record file, and a running `docent serve` fs-watches every write, CLI-made or direct, and re-renders over SSE (agent-integration.md §1, §3.3). Both the UI's write path and the CLI share **one** `writeFindingRecord` implementation — no divergence.

Prefer the CLI: it validates the record against the same schema the server uses and resolves anchors for you. Hand-authoring is the fallback when the CLI isn't available.

## Where it runs

Run it from **inside the repo under review** (any subdirectory). It resolves the repo, the current branch's Dossier, and the Change refs — base at the merge-base, head at the branch tip — from git. It reads and writes under `.docent/dossiers/<branch-slug>/`. The Dossier auto-creates on first use; a Change mints lazily on first reference. No server needs to be running.

Every subcommand prints **machine-readable JSON** on stdout, so a skill can consume the result directly.

## `docent finding list` — fetch-findings

Walks the active Dossier, folds every Finding, applies the filter, and prints `{ "findings": [ … ] }` in reading order (code findings first, by file then line; then whole-change, walkthrough, capture, text, detached).

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

| Flag             | Keeps                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| `--open`         | Unresolved findings. `--open` and `--resolved` together (or neither) keep all.    |
| `--resolved`     | Resolved findings.                                                                 |
| `--whats-next`   | Only these what's-next states — any-of; repeat the flag or comma-join the values. |
| `--anchor-file`  | Only findings whose `line`/`file` code anchor is this path.                        |
| `--author`       | Only findings this author id participated in.                                      |

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

| Form                                | Anchor                                                              |
| ----------------------------------- | ------------------------------------------------------------------ |
| `--change`                          | The whole Change.                                                  |
| `--file <path>`                     | The whole file. `--side base\|head` (default `head`).             |
| `--file <path> --line <N[:M\|-M]>`  | A line range (1-based, inclusive). `N`, `N:M`, or `N-M`. `--side`. |
| `--anchor '<json>'`                 | Escape hatch — a raw anchor arm, validated against the schema. Use for the capture / walkthrough / text-span arms the convenience flags don't cover. |

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

| `--disposition` | what's-next        | Means                                        |
| --------------- | ------------------ | -------------------------------------------- |
| `actioned`      | **needs-verify**   | Fixed — a resolver should verify.            |
| `declined`      | **needs-decision** | Won't fix — a human should decide.           |
| `question`      | **needs-answer**   | Blocked on an answer.                        |
| *(omitted)*     | **needs-action**   | Plain comment / "do it again".               |

`--finding <id>` is required (a missing or empty id is a usage error — never a stray write). Body required.

## `docent finding resolve` — close a Finding

Appends a resolve record → **closed**. The body (an optional reason) may be omitted.

```bash
docent finding resolve --finding fnd_…                          # close, no reason
docent finding resolve --finding fnd_… --body "Verified against head — the guard holds."
```

Resolution is **unconstrained**: any actor may resolve any Finding, including an agent resolving another agent's. It is safe because a resolve is an append-only, attributed, **reopenable** event — a later reply reopens the Finding (agent-integration.md §2.6). Whether a given skill *should* resolve is a role question, not a mechanism one: `/review` resolves, `/address` never does (§3.1).

## Attribution — metadata, never permission

Every write records **who** did it; it never gates **who may** (agent-integration.md §2.1). By default the write is attributed to the git-config human (matching the UI's write path). Override to attribute to an agent:

```bash
docent finding add --change --body "…" --agent claude-code --model claude-fable-5
docent finding reply --finding fnd_… --disposition actioned --body "…" --agent claude-code
```

| Flag        | Effect                                                        |
| ----------- | ------------------------------------------------------------ |
| `--agent`   | Attribute to an agent with this slug (else the git human).   |
| `--display` | Override the display name.                                    |
| `--model`   | Optional agent model metadata.                               |

When you run one of these subcommands **as an agent inside a skill**, pass `--agent <your-slug>` so the Finding's attribution reads true in the UI.

## Output shape

- `list` → `{ "findings": [ { "id", "anchor", "body", "participants", "replies", "resolved", "whatsNext" }, … ] }`
- `add` / `reply` / `resolve` → `{ "changeId": "chg_…", "findingId": "fnd_…", "record": "NNN-<type>.md" }`

Errors go to stderr and exit non-zero, with a human-readable message (a bad flag, a missing anchor, an unknown subcommand).
