---
name: review
description: Review the head Change of a local branch against the open findings queue — write fresh Findings and verify/resolve the fixes that now hold. Use when the human asks to review a change, do a review pass, or verify addressed findings in a docent Dossier.
---

# review

The **reviewer + verifier/resolver** half of the docent review loop (agent-integration.md §3.1). One act of "assess the head against the queue," because resolving a fix that now holds is the same write, against the same head, as authoring a fresh Finding. You read the code and the queue; you write **fresh Findings** and **resolve / re-comment** records.

You are **not** the fixer. You never edit product code and you never write a reply carrying a Disposition — that is `/address`. Keeping review and fix in separate skills is what realizes the loop's **fixer ≠ resolver** guidance _by construction_ (agent-integration.md §2.6): the resolver here is a different pass from the fixer there.

Load **`/docent-cli`** for the exact `docent finding` command surface — flags, filters, output shape. Everything below drives that CLI, which is the canonical, non-gating path to `.docent/`; a running `docent serve` re-renders every write live over SSE, so each step below is visible in the UI as it lands.

## 1. Read the head — plain git, your own session

Read the Change under review with **plain `git`** in your own session — docent never runs you, and the diff renders live from git (agent-integration.md §1). Default to the **live head** of the branch; referencing it mints a Change lazily (the CLI does this on first write).

```bash
git fetch
git log --oneline origin/HEAD..HEAD     # what this branch adds
git diff $(git merge-base HEAD origin/HEAD)...HEAD    # the Change, head vs merge-base
```

- **Optional focus.** If the human scoped the pass (a path, a concern), review only that — but still read enough context to anchor accurately.
- **Targeting a prior Change is fine.** You may review any prior Change in the Dossier's history, not only head. A Finding born on an older Change is simply born **drifted** against head — that is what Drift is for (agent-integration.md §2.5); write it anyway.

## 2. Read the open queue — what already exists

Before writing anything, fetch the open findings so you neither duplicate a live Finding nor miss a fix waiting to be verified:

```bash
docent finding list --open                       # the whole open queue
docent finding list --whats-next needs-verify    # fixes claiming to be done — your verify worklist
docent finding list --whats-next needs-action    # already-raised, not yet addressed — don't re-raise
```

## 3. Verify the fixes that claim to be done — resolve or re-comment

For each **needs-verify** Finding (a fixer replied `actioned`): read its anchor and body, look at the code **at head**, and decide.

- **The fix holds** → **resolve** it. This is the verify-and-resolve case the loop is built for; nothing leaves the queue otherwise (agent-integration.md §2.6).

  ```bash
  docent finding resolve --finding fnd_… --agent <your-slug> \
    --body "Verified against head — the guard is present at src/app.ts:44."
  ```

- **The fix is wrong or incomplete** → **re-comment** (a plain reply, no Disposition) → the Finding returns to **needs-action** for another fix pass. Do **not** resolve it.

  ```bash
  docent finding reply --finding fnd_… --agent <your-slug> \
    --body "Not quite — the guard covers the read path but the write path at line 61 still leaks."
  ```

You may also resolve as **housekeeping** — a duplicate of another open Finding, or one gone stale — with a reason. Resolution is unconstrained and reopenable, so this is safe (§2.6).

Leave **needs-answer** / **needs-decision** Findings for the human unless you can genuinely answer or decide; if you answer a `question`, reply plainly (no Disposition) so it returns to needs-action.

## 4. Write fresh Findings — born needs-action

Review the head (within any focus) and raise what you find. Each fresh Finding is born **needs-action**. Anchor it as tightly as the issue allows — a line range beats a file, a file beats the whole change:

```bash
# a line-anchored finding on the head side
docent finding add --file src/app.ts --line 42:47 --agent <your-slug> \
  --body "This early-return leaves the lock held; release it before returning."

# a whole-file or whole-change concern
docent finding add --file src/config.ts --agent <your-slug> --body "No validation on the parsed port."
docent finding add --change --agent <your-slug> --body "The new error path has no test."
```

- **Don't re-raise** something already in the open queue (step 2) — reply on the existing Finding instead if you have more to add.
- **Attribution** — pass `--agent <your-slug>` so the UI shows the Finding came from you (attribution is metadata, never permission, §2.1).
- **One Finding per issue.** A Finding is a conversation; keep each to a single, anchored concern so `/address` can act on it cleanly.

## 5. Confirm

Re-list the queue to confirm the pass landed as intended — fresh Findings present, verified fixes closed:

```bash
docent finding list --open
```

If `docent serve` is running, the human sees each write appear live in the UI as you go (agent-integration.md §1).

## Boundaries

- **Never edit product code**, and **never write a reply with a Disposition** (`actioned` / `declined` / `question`) — those are the fixer's writes (`/address`). Your writes are: `add` (fresh Finding), `resolve` (verified / housekeeping), and plain `reply` (re-comment → needs-action).
- **Commit / push is the human's git workflow** — out of scope (agent-integration.md §3.4).
- **Serving the app and capturing product walkthroughs** are other skills (`/docent`, `/capture-product-walkthrough`); this skill is the code-and-queue review loop only.
