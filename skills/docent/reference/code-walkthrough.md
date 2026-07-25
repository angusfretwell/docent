# Authoring the code walkthrough

Drops the **Code walkthrough** — `walkthroughs/code/wlk_*/`, a manifest plus ordered section files whose targets are diff **ranges** narrated in prose. Code has no capture phase, so this file is the whole code pillar. You **author**, not review — you produce the tour only; Comments belong to the review loop ([comments.md](comments.md)).

The output is plain files a running `docent serve` re-renders live. The CLI below is the single home for `wlk_`/`sec_` minting, lazy `bornChangeId`, and git-resolved `blobSha`, and non-gating — hand-authoring identical files re-renders just the same — but prefer it: it validates against the same schemas the server renders. Your work is the editorial judgment.

## 1. Read the Change — plain git, your own session

Read the Change under review with plain `git`, straight from the local clone. Default to the **live head** of the branch; referencing it mints a Change lazily when the head has none (the CLI does this on the first `create`).

```bash
git fetch
git log --oneline origin/HEAD..HEAD    # what this branch adds (fall back to origin/<default-branch> if origin/HEAD is unset)
git diff origin/HEAD...HEAD            # the Change — three-dot, head against the merge-base
```

Read **intent** from three sources: the **branch name**, the base..head **commit messages**, and your own **session context**.

- **Optional focus.** If the human scoped the tour (a path, a concern like "security"), let it steer target selection and ordering. Default is a general reviewer's tour.

## 2. Select and order the targets — the editorial call

The ranking is your judgment, but the shape is fixed:

- **Select high-signal ranges.** A range is a contiguous line span of one file on one side (`head` for new code, `base` for what a hunk replaced). Pick the spans a reader must see to understand the Change; skip mechanical churn.
- **Group into sections.** Each section is one step of the tour — a titled idea carrying the ranges that make it (an entry point, a dispatch path). A section may span files.
- **Order high-signal first.** Section order **is** the tour order — array position is the only rank.

## 3. Mint the walkthrough shell

```bash
npx -y @angusfretwell/docent@latest walkthrough create --kind code --title "<the tour's title>"
#   → { "changeId": "chg_…", "walkthroughId": "wlk_…" }
```

Mints a `wlk_` id and binds `bornChangeId` to the live head, minting the Change if the head has none. Hold the returned `walkthroughId` for the sections.

## 4. Drop each section — ranges + literate narration

One `add-section` call per section, **in tour order** (the manifest array is the order):

```bash
npx -y @angusfretwell/docent@latest walkthrough add-section --walkthrough wlk_… \
  --title "Entry point & dispatch" \
  --range src/index.ts:10-24@head \
  --range src/parser.ts:40-88@head <<'EOF'
The request enters here {{range:0}} and is handed to the parser {{range:1}}.
EOF
#   → { "section": "sNN-<slug>.md", "sectionId": "sec_…", "walkthroughId": "wlk_…" }
```

- `--range` is `file:start[-end][@side]` — e.g. `src/a.ts:40` (single line; side defaults `head`). Repeatable. Each range resolves its content-addressed **`blobSha` from git** at write time, landing in the same `line`-anchor coordinate a Comment uses, frozen to the exact bytes on its `side` — so it renders as code and deep-links into the diff.
- `--title` names the **section** (required).
- **Body** — `--body <text>`, or omit it and pipe stdin (heredoc) for multi-line prose.
- **Literate interleave** — place `{{range:i}}` markers to narrate _between_ ranges; `i` is the range's position in the `--range` list, in the order passed. No markers ⇒ ranges render in order after the prose.
- `--capture` / `--callout` are the product arms; on a code walkthrough they are refused.

## 5. Confirm it renders

The tour is done when every section is dropped and the manifest lists them in order. If `docent serve` is running, the Code walkthrough tab shows each section appear live as you write it. Schemas are validated on write, so a tour that lands renders with no hand-editing.

## Boundaries

- **Walkthroughs only, never Comments** — the review → Comments loop is a separate flow ([comments.md](comments.md)).
- **Regeneration mints a fresh `wlk_`** — never edit a prior walkthrough in place. A walkthrough is durable and immutable; a new tour for a later Change is a new `create`. When and whether to regenerate is the reconcile decision in SKILL.md, not this file's.
- **Commit / push is the human's git workflow** — out of scope.
