---
name: author-code-walkthrough
description: Author the Code walkthrough for a Change — an ordered tour of selected diff ranges with literate narration. Use when producing a code walkthrough, or when /docent needs the code pillar (re)generated for the Change under review.
---

# author-code-walkthrough

Drops the **Code walkthrough** — `walkthroughs/code/wlk_*/`, a manifest plus ordered section files whose targets are diff **ranges** narrated in prose (walkthroughs.md §4, §5, §10). Code has no capture phase, so this is the **single** skill of the code pillar (agent-integration.md §3.2). You **author**, not review — you produce the tour only; Findings belong to the review loop (`/review`).

The output is plain files the running tool re-renders live (`docent serve` watches `.docent/`). Prefer the `docent walkthrough` CLI below — the single home for `wlk_`/`sec_` minting, lazy `bornChangeId`, and git-resolved `blobSha` — but it is **non-gating**: you could hand-author the identical files and a running server would re-render them just the same (agent-integration.md §3.3).

## 1. Read the Change — plain git, your own session

Read the Change under review with **plain `git`** in your own session, straight from the local clone — you have repo access; you do not go through the tool's HTTP blob API (walkthroughs.md §10). Default to the **live head** of the branch; referencing it mints a Change lazily when the head has none (the CLI does this on the first `create`).

```bash
git fetch
git log --oneline origin/HEAD..HEAD    # what this branch adds
git diff origin/HEAD...HEAD            # the Change — three-dot, head against the merge-base
```

Read **intent** from three sources (walkthroughs.md §10): the **branch name**, the `base..head` **commit messages** (`git log`), and your own **session context**. There is no GitHub in v1 — no PR body to read.

- **Optional focus.** If the human scoped the tour (a path, a concern like "security"), let it steer target selection and ordering. Default is a general reviewer's tour.

## 2. Select and order the targets — the editorial call

This is the skill's judgment (walkthroughs.md §10) — deliberately unspecified ranking, but the shape is fixed:

- **Select high-signal ranges.** A range is a contiguous line span of one file on one side (`head` for new code, `base` for what a hunk replaced). Pick the spans a reader must see to understand the Change; skip mechanical churn.
- **Group into sections.** Each section is one step of the tour — a titled idea carrying the ranges that make it (an entry point, a dispatch path). A section may span files.
- **Order high-signal first.** Section order **is** the tour order — array position is the only rank (walkthroughs.md §4). "High-signal first" is your call made here, not a data field.

## 3. Mint the walkthrough shell

Create the code walkthrough — mints a `wlk_` id and binds `bornChangeId` to the live head (minting the Change if the head has none):

```bash
docent walkthrough create --kind code --title "<the tour's title>"
```

Prints `{ "changeId": "chg_…", "walkthroughId": "wlk_…" }`. Hold the `walkthroughId` for the sections.

## 4. Drop each section — ranges + literate narration

Append sections **in tour order** (the manifest array is the order). Each `--range` is `file:start[-end][@side]` — the CLI resolves its content-addressed `blobSha` from git at write time, so the range lands in the **same coordinate as the `line` anchor arm** (walkthroughs.md §5), frozen to the exact bytes:

```bash
docent walkthrough add-section --walkthrough wlk_… \
  --title "Entry point & dispatch" \
  --range src/index.ts:10-24@head \
  --range src/parser.ts:40-88@head <<'EOF'
The request enters here {{range:0}} and is handed to the parser {{range:1}}.
EOF
```

- **Body on stdin** (heredoc / pipe) for multi-line prose, or `--body "…"` for a one-liner.
- **Literate interleave** — place `{{range:i}}` markers in the body to narrate _between_ targets (prose → range → prose → range); `i` is the range's position in the `--range` list, in the order you passed them. **No markers ⇒ the ranges render in order after the prose** (the flat fallback) — a fine default when the section is one continuous point (walkthroughs.md §5).
- One `add-section` call per section; repeat for each, in order. `sNN-<slug>.md` filename prefixes are cosmetic.

## 5. Confirm it renders

The tour is done when every section is dropped and the manifest lists them in order. If `docent serve` is running, the Code walkthrough tab shows each section appear live as you write it, each range rendered through `CodeView` and deep-linking into the Diff tab (walkthroughs.md §1). The schemas are validated on write, so a tour that lands renders with no hand-editing.

## Boundaries

- **Walkthroughs only, never Findings** — single-purpose (walkthroughs.md §10). The review → Findings loop is `/review`, a separate flow.
- **Regeneration mints a fresh `wlk_`** — never edit a prior walkthrough in place (walkthroughs.md §2). A code walkthrough is durable and immutable; a new tour for a later Change is a new `create`. When and whether to regenerate is `/docent`'s call (agent-integration.md §3.1), not this skill's.
- **Commit / push is the human's git workflow** — out of scope (agent-integration.md §3.4).
