---
name: from-docent
description: Pull Findings from the Review into the session — fetch the open queue (or any filtered slice) and render each Finding's thread, anchor, and status, so your own fixing process can act on them. Use when the human asks to pull, fetch, load, or bring the docent review findings into the session to work on.
---

# from-docent

The **read half** of the BYO-process review loop — the **fetch-findings** primitive as a skill. It pulls Findings out of the Review and into your session so **your own fixing process** can act on them; the write half that records what you did is `/to-docent`. The two are the loop's two I/O primitives: `/from-docent` fetches, `/to-docent` writes.

This skill **prescribes no fix.** It fetches and renders the queue; how you act on each Finding is your session's own process (read the anchored code, edit it, decide, ask). It **writes nothing to `.docent/`** — it closes by routing outcome-recording back through `/to-docent` (a reply plus a hand-back), which is what moves each Finding out of the queue.

Load **`/docent-cli`** for the exact `docent finding list` surface — flags, filters, output shape. Everything below drives that CLI, the canonical, non-gating read path to `.docent/`; with `docent serve` running, the records you fetch here are the same ones the human sees live in the UI.

## 1. Fetch the work — default to the open queue

With no filter, pull the **open** queue — the fixer's inbox, where fresh Findings, plain comments, and "do it again" re-comments all fold. That is the default because it is the slice a fixing process almost always wants: the Findings that actually need a turn.

```bash
docent finding list --status open        # the default: your worklist
```

Each folded Finding arrives with its `id`, `anchor` (the file/line the concern is about), `body`, `participants[]`, `replies[]`, and `status` — the whole thread, enough to act without a second read.

## 2. Narrow with filters — the queue's filter vocabulary

Every fetch-findings filter is available; they AND together, so combine them to scope the pull:

```bash
docent finding list --status open,actioned                # everything unresolved
docent finding list --status actioned                     # handed back — awaiting verification
docent finding list --status resolved                     # resolved only (e.g. to review what was closed)
docent finding list --anchor-file src/app.ts              # only Findings anchored on this file
docent finding list --author claude-code                  # only Findings this author participated in
docent finding list --status open --anchor-file src/app.ts   # combined: one file's worklist
```

| Filter | Pulls |
| --- | --- |
| _(none)_ | The whole queue — every Finding. The open worklist is the _skill's_ default, supplied by passing `--status open` (§1), not what a bare list returns. |
| `--status <state…>` | Only these statuses — `open`, `actioned`, `resolved`; any-of (comma-join or repeat). |
| `--anchor-file <path>` | Only Findings whose code anchor is this file. |
| `--author <id>` | Only Findings this author id participated in. |

## 3. Render each Finding faithfully

Bring each Finding into context whole — never summarize away the parts a fixing process needs:

- **Thread** — the `body` and every `reply`, in order, so the conversation's history (what was raised, answered, declined) is present.
- **Anchor** — the `anchor`'s file/line (and `side`), so the exact code the concern is about is in view. Read the anchored code before acting.
- **Status** — an **open** Finding wants a turn; an **actioned** one was already handed back and is waiting on verification, an answer, or a decision.

Because `actioned` is broad, the _reason_ a Finding was handed back lives in its **last reply**, not in its status. Read that reply before deciding whether an actioned Finding needs you — it is the difference between "fixed, please verify" and "I declined this, your call."

Findings arrive in reading order — code findings first (by file, then line), then whole-change, walkthrough, capture, text, detached. Walk them in that order.

## 4. Act — your process, not this skill's

How you act on each Finding is **your session's own process** — this skill hands you the queue and steps back. Read the anchored code, make the edit, decide against it, or raise a question, exactly as you would in any coding session. There is nothing docent-specific about the fixing itself, so this skill does not prescribe it.

## 5. Close — record outcomes through `/to-docent`

End your turn by recording what you did back into the Review with **`/to-docent`**. That skill carries the write half of the loop — for every outcome it writes a reply explaining what happened, then an `action` handing the Finding back:

| You…                      | `/to-docent` records   | Finding becomes |
| ------------------------- | ---------------------- | --------------- |
| Made the fix              | a reply, then `action` | **actioned**    |
| Decided against it        | a reply, then `action` | **actioned**    |
| Need an answer first      | a reply, then `action` | **actioned**    |
| Found a claimed fix wrong | a reply alone          | **open**        |

The hand-back is what drains the queue — **without the `action`, the Finding stays open and the next fetch hands you the same work again.** Fetch here, act, then record there.

## Boundaries

- **Read-only.** `/from-docent` writes nothing to `.docent/` — no Findings, no replies, no resolves. Fetching is this skill; recording outcomes is `/to-docent`.
- **Prescribes no fix.** It pulls and renders the queue; how to act is your own process. It never tells you what the fix is.
- **The default is open, not the whole queue.** Reach past it with `--status` when you deliberately want another slice (e.g. verifying actioned Findings, or reviewing resolved ones).
