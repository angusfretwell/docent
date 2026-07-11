---
name: to-docent
description: Record a session's review outcomes into the Review — write fresh Findings, Disposition-carrying replies, and resolves via the finding CLI, for outcomes the session already produced. Use after running your own review process (/code-review, an ad-hoc conversation, another tool) or after addressing findings pulled via /from-docent, to write what happened back to the Review.
---

# to-docent

The **write half** of the BYO-process review loop (agent-integration.md §3.1). docent is out of the reviewing business: the outcomes themselves come from whatever process you already ran this session — `/code-review`, an ad-hoc conversation, another tool, or a fix pass over findings pulled via `/from-docent`. This skill **records what that session produced** into the Review, driving the finding CLI's full write vocabulary (agent-integration.md §2.2): **fresh Findings**, **Disposition-carrying replies**, and **resolves**. It reviews nothing and fixes nothing of its own — it transcribes outcomes already in the session.

Because you carry the loop's **full write vocabulary**, the loop's **fixer ≠ resolver** guidance holds by prose here, not by construction (agent-integration.md §2.6): **don't resolve a Finding you claimed to fix in the same turn.** A fix and the verification that closes it are different passes even when one skill can write both — record the `actioned` reply now and leave the resolve for a later pass that genuinely re-checked the fix against head.

Load **`/docent-cli`** for the exact `docent finding` command surface — flags, filters, output shape. Everything below drives that CLI, the canonical, non-gating path to `.docent/`; a running `docent serve` fs-watches every write and re-renders live over SSE, so each record you write is visible in the UI as it lands (agent-integration.md §1).

## 1. Take stock of the session — record only what happened

Before writing anything, sort what the session actually produced into the three write kinds. **Record only outcomes the session reached** — never invent a Finding it didn't raise, a Disposition it didn't reach, or a resolution it didn't verify. That is the one invariant of a recorder: the Review gets exactly what the work produced, nothing extrapolated.

| The session… | Record it as | CLI |
| --- | --- | --- |
| Raised a new review concern (your own review pass, ad-hoc or via another tool) | a **fresh Finding**, born needs-action | `docent finding add` |
| Addressed a Finding it pulled in via `/from-docent` | a **reply carrying a Disposition** | `docent finding reply --disposition …` |
| Verified a fix that now holds | a **resolve** | `docent finding resolve` |

Then fetch the open queue, so a reply or resolve lands on the Finding it belongs to and you don't re-raise something already open:

```bash
docent finding list --open
```

This is also how you tell **"reply to an existing Finding"** from **"new Finding"**: work the session did against a Finding already in the queue (one it pulled via `/from-docent`) is a **reply**; a genuinely new concern with no open Finding is a fresh **add**. When in doubt, match the concern's anchor against the open queue before choosing.

## 2. Fresh Findings — born needs-action

For each new concern the session raised, write a Finding. Each is born **needs-action**. Anchor it as tightly as the concern allows — a line range beats a file, a file beats the whole change — so `/from-docent` can pull it with the exact code it is about:

```bash
# a line-anchored finding on the head side
docent finding add --file src/app.ts --line 42:47 --agent <your-slug> \
  --body "This early-return leaves the lock held; release it before returning."

# a whole-file or whole-change concern
docent finding add --file src/config.ts --agent <your-slug> --body "No validation on the parsed port."
docent finding add --change --agent <your-slug> --body "The new error path has no test."
```

- **Don't re-raise** something already open (step 1) — reply on the existing Finding instead if the session added to it.
- **One Finding per concern.** A Finding is an anchored conversation; keep each to a single issue so `/from-docent` can pull and act on it cleanly.
- **Attribution** — pass `--agent <your-slug>` so the UI shows the Finding came from you (attribution is metadata, never permission, agent-integration.md §2.1).
- Referencing the head mints a Change lazily on the first write (agent-integration.md §2.5) — no separate step.

## 3. Replies with a Disposition — how a fixer's turn ended

When the session addressed a Finding it pulled via `/from-docent`, close it with a **reply carrying the Disposition** that matches how the work ended. The Disposition is what routes the Finding next, actor-blind (agent-integration.md §2.3):

```bash
# fixed it → needs-verify (a later pass verifies and resolves)
docent finding reply --finding fnd_… --disposition actioned --agent <your-slug> \
  --body "Released the lock before the early return; added a regression test at app.test.ts."

# won't fix → needs-decision (a human decides)
docent finding reply --finding fnd_… --disposition declined --agent <your-slug> \
  --body "Intentional — the lock is re-entrant here; see the locking ADR. Leaving as-is."

# blocked → needs-answer (input needed before the work can proceed)
docent finding reply --finding fnd_… --disposition question --agent <your-slug> \
  --body "Do you want the read lock or the write lock guarded? The fix differs."
```

| The session…          | `--disposition` | Finding becomes    |
| --------------------- | --------------- | ------------------ |
| Made the fix          | `actioned`      | **needs-verify**   |
| Declined to fix       | `declined`      | **needs-decision** |
| Needs an answer first | `question`      | **needs-answer**   |

A reply with **no** Disposition is a plain comment / "do it again" — it routes the Finding back to **needs-action**. Use it to record a re-comment: the session looked at a claimed fix and found it wrong or incomplete, so it goes back for another pass.

```bash
docent finding reply --finding fnd_… --agent <your-slug> \
  --body "Not quite — the guard covers the read path but the write path at line 61 still leaks."
```

## 4. Resolves — fixes that hold

When the session **verified** a fix against head and it holds, record a **resolve** → the Finding closes:

```bash
docent finding resolve --finding fnd_… --agent <your-slug> \
  --body "Verified against head — the guard is present at src/app.ts:44."
```

Resolution is unconstrained and reopenable (agent-integration.md §2.6), so you may also resolve for **housekeeping** — a duplicate of another open Finding, or one gone stale — with a reason.

- **Fixer ≠ resolver, by prose.** Don't resolve a Finding whose fix this same turn claimed with an `actioned` reply. Record the `actioned` reply (§3) and leave the Finding at **needs-verify**; a later pass that genuinely re-checked the fix records the resolve. Collapsing the two into one turn is exactly what the guidance warns against (agent-integration.md §2.6).
- Leave **needs-answer** / **needs-decision** Findings for a human unless the session genuinely answered or decided them; recording an answer is a plain reply (no Disposition), which returns the Finding to needs-action.

## 5. Confirm

Re-list the queue to confirm the session's outcomes landed as intended — fresh Findings present, replies routed, verified fixes closed:

```bash
docent finding list --open
```

With `docent serve` running, the human sees each record appear live in the UI as you write it (agent-integration.md §1).

## Boundaries

- **Record, don't originate.** You transcribe outcomes the session already produced — you never review code, edit code, or decide a fix on your own. Reviewing is your own process (`/code-review`, ad-hoc); pulling findings to work on is `/from-docent`; this skill only writes the results back.
- **Never invent.** No fresh Finding for a concern the session didn't raise, no Disposition for work it didn't do, no resolve for a fix it didn't verify.
- **Fixer ≠ resolver is prose, not construction** — one skill now carries the full write vocabulary, so the discipline is yours to keep (§2.6). Don't resolve what you just claimed to fix.
- **Commit / push is the human's git workflow** — out of scope (agent-integration.md §3.4).
- **Walkthroughs and captures are other skills** (`/docent`, `/author-*`, `/capture-product-walkthrough`); this skill writes Findings only.
