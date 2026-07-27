# Authoring the code walkthrough

Writes the **Code walkthrough** for one change — `walkthroughs/code/wlk_*/`, a manifest plus ordered section files whose targets are diff **ranges** narrated in prose. Code has no capture phase, so this brief is the whole code walkthrough.

You read the change yourself, write the tour, and hand back a receipt. You run **unattended** — there is no human to ask, so judge what this brief leaves open and move.

**You are not reviewing this change** — you are describing it for the person who is about to. Review is a separate flow the human drives, and an opinion smuggled into a tour surfaces where nobody can answer it. The only thing that travels back beside the tour is an **obstacle**: something that made the tour _less truthful_ — bytes you could not resolve, an intent you could not recover from the branch. A criticism in an obstacle's clothes is still a criticism.

**Load [voice.md](voice.md) before you write a section body.** It owns the prose, and the product walkthrough loads the same file — that shared guide is why the two tours read as one.

## What you are given

- **The skill's absolute base directory** — this brief is `<base>/reference/code-walkthrough.md` and every file it links to, [voice.md](voice.md) first among them, is a sibling; resolve every path against `<base>`, never your cwd, which is the repository under review, where a relative path comes back empty.
- **The repository's absolute root** — run git and the CLI there. It is checked out on the branch under review, and its head is the change you are writing about.
- **A focus, sometimes** — a path or a concern ("security") the human scoped the run to. It steers what you select and how you order it; it never decides whether you write.

Everything else you read for yourself, starting at §1. The `docent` CLI is reached from the repository root through `npx -y @angusfretwell/docent@latest`, which self-bootstraps its per-platform binary — no global install needed. The CLI is the single home for issuing `wlk_`/`sec_` ids, lazy `bornChangeId`, and git-resolved `blobSha`; every write goes through it, validated against the same schemas the server renders. Your work is the editorial judgment.

## What you return

A receipt, not prose. Whoever dispatched you reads it back to the human as the tour's table of contents, so the titles are the payload — no summary of the change, no account of what you selected or how you worked:

```text
walkthrough: wlk_01J…
sections:
  1. Drift is resolved against the blob, not line numbers
  2. Reanchoring runs only once the bytes have moved
  3. The badge the reviewer actually sees
obstacles: none
```

Every section you dropped, in tour order, titled exactly as it is titled in the tour. `obstacles: none` is the ordinary answer and the one you should expect to write. When there is one, it takes the same shape as `sections` — one line each, said the way it will be read aloud to the human, because it is passed on verbatim:

```text
obstacles:
  - src/gen/schema.ts is generated, so its section points at the generator instead
```

## 1. Read the change — plain git, your own context

Read the change under review with plain `git`, straight from the local clone.

```bash
git log --oneline origin/HEAD..HEAD    # what this branch adds (fall back to origin/<default-branch> if origin/HEAD is unset)
git diff origin/HEAD...HEAD            # the change — three-dot, head against the merge-base
```

**Don't fetch.** The run fetched before it dispatched you, and it dispatched you alongside another agent reading the same clone — a second fetch buys nothing and can contend on the clone's ref locks.

You are the only agent in the run that reads the hunks, which is why you exist as your own context. Read **intent** from three sources: the **branch name**, the base..head **commit messages**, and the diff itself.

## 2. Select and order the targets — the editorial call

The ranking is your judgment, but the shape is fixed:

- **Select high-signal ranges.** A range is a contiguous line span of one file on one side (`head` for new code, `base` for what a hunk replaced). Pick the spans a reader must see to understand the change; skip mechanical churn.
- **Group into sections.** Each section is one step of the tour — a titled idea carrying the ranges that make it (an entry point, a dispatch path). A section may span files.
- **Order high-signal first.** Section order **is** the tour order — array position is the only rank.

## 3. Create the walkthrough shell

```bash
npx -y @angusfretwell/docent@latest walkthrough create --kind code --title "<the tour's title>"
#   → { "changeId": "chg_…", "walkthroughId": "wlk_…" }
```

Issues a `wlk_` id and binds `bornChangeId` to the live head, recording the Change if the head has none. Hold the returned `walkthroughId` — the sections need it, and it opens your receipt.

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

- `--range` is `file:start[-end][@side]` — e.g. `src/a.ts:40` (single line; side defaults `head`). Repeatable.
- `--title` names the **section** (required). It is also what the human sees in the closing report, so title for a reader who has not opened the tour yet.
- **Body** — `--body <text>`, or omit it and pipe stdin (heredoc) for multi-line prose. The prose follows [voice.md](voice.md).
- **Literate interleave** — place `{{range:i}}` markers to narrate _between_ ranges; `i` is the range's position in the `--range` list, in the order passed. No markers ⇒ ranges render in order after the prose.
- `--capture` / `--callout` are the product arms; on a code walkthrough they are refused.

## 5. Confirm it renders

The tour is done when every section is dropped and the manifest lists them in order. Schemas are validated on write, so a tour that lands renders with no hand-editing. Then return the receipt.

## Non-goals

- **Nothing product-side.** Captures, the browser, and the app under review belong to the product half. You never spawn a server, and serving docent itself is the run's job, not yours.
- **Write the tour you were dispatched for; never skip it, and never edit an earlier walkthrough in place.** A walkthrough is durable and immutable, so every write lands a fresh `wlk_` and the earlier tour stays exactly as it was.
- **No git writes.** No commits, no pushes, no branch or working-tree edits — the change you describe must still be the change when you finish. Committing is the human's workflow.
