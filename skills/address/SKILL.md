---
name: address
description: Address the open findings on a local branch — fetch the needs-action queue, make the code edits, and reply on each with a Disposition. Use when the human asks to address, fix, or work through the review findings in a docent Review.
---

# address

The **fixer** half of the docent review loop (agent-integration.md §3.1). You fetch **needs-action** Findings, make ordinary code edits, and reply on each with a **Disposition** recording how you ended your turn. You are reviewed _by_ the queue; you act on it and hand back.

**You never write a resolve.** That single rule is what keeps you the fixer, not the resolver — it realizes the loop's **fixer ≠ resolver** guidance by construction (agent-integration.md §2.6, §3.1). Verifying and closing a fix is `/review`'s job, a separate pass. Your writes are code edits plus **reply** records — nothing else.

Load **`/docent-cli`** for the exact `docent finding` command surface. Everything below drives that CLI, the canonical non-gating path to `.docent/`; with `docent serve` running, each reply you write appears live in the UI over SSE.

## 1. Fetch the work — the needs-action queue

Read the Findings that actually need a fixer. **needs-action** is the fixer's inbox — fresh Findings, plain comments, and "do it again" re-comments all fold to it (agent-integration.md §2.3):

```bash
docent finding list --whats-next needs-action        # your worklist
docent finding list --whats-next needs-action --anchor-file src/app.ts   # scope to one file
```

That is your whole inbox. **needs-action** is the only state you clear — you never pick up the others, because none is yours to clear. A `question` you raised (**needs-answer**) is answered, and a `declined` you returned (**needs-decision**) is decided, by a human or a reviewer, whose plain reply routes the Finding back to **needs-action** for you to pick up next; **needs-verify** is `/review`'s to verify and resolve. Disposition is "how a **fixer** ends its turn" (agent-integration.md §2.3), so those three states are ones you _produce_, not consume.

Each folded Finding gives you its `id`, `anchor` (the file/line the concern is about), and `body` (what to fix) — enough to act without a second read.

## 2. Fix the code — ordinary edits

For each Finding, read the anchored code and make the fix the same way you edit any code. There is nothing docent-specific here: plain file edits in your own session. Keep each fix scoped to its Finding so the reply reads true.

Work through the queue Finding by Finding; don't batch unrelated fixes into one reply.

## 3. Reply — carry a Disposition

Close each turn with a **reply** on that Finding, carrying the Disposition that matches how you ended it. The Disposition is what routes the Finding next, actor-blind (agent-integration.md §2.3):

```bash
# fixed it → needs-verify (a reviewer will verify and resolve)
docent finding reply --finding fnd_… --disposition actioned --agent <your-slug> \
  --body "Released the lock before the early return; added a regression test at app.test.ts."

# won't fix → needs-decision (a human decides)
docent finding reply --finding fnd_… --disposition declined --agent <your-slug> \
  --body "Intentional — the lock is re-entrant here; see the locking ADR. Leaving as-is."

# blocked → needs-answer (you need input to proceed)
docent finding reply --finding fnd_… --disposition question --agent <your-slug> \
  --body "Do you want the read lock or the write lock guarded? The fix differs."
```

| You did                       | `--disposition` | Finding becomes    |
| ----------------------------- | --------------- | ------------------ |
| Made the fix                  | `actioned`      | **needs-verify**   |
| Decided not to fix            | `declined`      | **needs-decision** |
| Need an answer before you can | `question`      | **needs-answer**   |

Every reply you write carries one of these three — a fixer always ends its turn with a Disposition. A plain reply (no Disposition) is a reviewer's re-comment, not a fixer's move.

- **Reply, never resolve.** Even a fix you are certain of ends with `--disposition actioned`, not a resolve — a distinct `/review` pass verifies and closes it. If you resolve, you have collapsed fixer and resolver.
- **`actioned` means the edit is made**, even if uncommitted — a reviewer verifies against head after commit; the Pending surface covers the uncommitted interim (agent-integration.md §5, deferred).
- **Attribution** — pass `--agent <your-slug>` so the reply reads as yours (metadata, never permission, §2.1).

## 4. Confirm

Re-list to confirm every Finding you touched moved off needs-action:

```bash
docent finding list --whats-next needs-action     # should no longer list the ones you addressed
```

With `docent serve` running, the human watches each reply land live and can verify your `actioned` fixes via `/review`.

## Boundaries

- **Never write a resolve** — not for any Finding, not even your own. That is the one invariant that keeps you the fixer (agent-integration.md §3.1).
- **Never author fresh Findings** — raising new concerns is `/review`'s job; you act on the ones already in the queue.
- **Commit / push is the human's git workflow** — out of scope (agent-integration.md §3.4). Make the edits; the human commits.
