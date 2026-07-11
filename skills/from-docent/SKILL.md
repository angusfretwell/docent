---
name: from-docent
description: Pull Findings from the Review into the session — fetch the needs-action queue (or any filtered slice) and render each Finding's thread, anchor, and what's-next, so your own fixing process can act on them. Use when the human asks to pull, fetch, load, or bring the docent review findings into the session to work on.
---

# from-docent

The **read half** of the BYO-process review loop (agent-integration.md §3.1) — the **fetch-findings** primitive as a skill (§2.2). It pulls Findings out of the Review and into your session so **your own fixing process** can act on them; the write half that records what you did is `/to-docent`. The two are the loop's two I/O primitives: `/from-docent` fetches, `/to-docent` writes.

This skill **prescribes no fix.** It fetches and renders the queue; how you act on each Finding is your session's own process (read the anchored code, edit it, decide, ask). It **writes nothing to `.docent/`** — it closes by routing outcome-recording back through `/to-docent` (Disposition-carrying replies), which is what keeps the queue's what's-next derivation fed (§2.3).

Load **`/docent-cli`** for the exact `docent finding list` surface — flags, filters, output shape. Everything below drives that CLI, the canonical, non-gating read path to `.docent/`; with `docent serve` running, the records you fetch here are the same ones the human sees live in the UI (agent-integration.md §1).

## 1. Fetch the work — default to the needs-action queue

With no filter, pull the **needs-action** queue — the fixer's inbox, where fresh Findings, plain comments, and "do it again" re-comments all fold (agent-integration.md §2.3). That is the default because it is the slice a fixing process almost always wants: the Findings that actually need a turn.

```bash
docent finding list --whats-next needs-action        # the default: your worklist
```

Each folded Finding arrives with its `id`, `anchor` (the file/line the concern is about), `body`, `participants[]`, `replies[]`, `resolved`, and `whatsNext` — the whole thread, enough to act without a second read.

## 2. Narrow with filters — the queue's filter vocabulary

Every fetch-findings filter is available; they AND together, so combine them to scope the pull (agent-integration.md §2.2, §3.3):

```bash
docent finding list --open                                  # unresolved only
docent finding list --resolved                              # resolved only (e.g. to review what was closed)
docent finding list --whats-next needs-verify,needs-answer  # a specific what's-next slice (any-of)
docent finding list --anchor-file src/app.ts                # only Findings anchored on this file
docent finding list --author claude-code                    # only Findings this author participated in
docent finding list --whats-next needs-action --anchor-file src/app.ts   # combined: one file's worklist
```

| Filter | Pulls |
| --- | --- |
| _(none)_ / `--whats-next needs-action` | The default worklist — Findings needing a turn. |
| `--open` / `--resolved` | Unresolved / resolved only (neither, or both, keeps all). |
| `--whats-next <state…>` | Only these what's-next states — `needs-action`, `needs-verify`, `needs-answer`, `needs-decision`, `closed`; any-of (comma-join or repeat). |
| `--anchor-file <path>` | Only Findings whose code anchor is this file. |
| `--author <id>` | Only Findings this author id participated in. |

## 3. Render each Finding faithfully

Bring each Finding into context whole — never summarize away the parts a fixing process needs (agent-integration.md §2.2):

- **Thread** — the `body` and every `reply`, in order, so the conversation's history (what was raised, answered, declined) is present.
- **Anchor** — the `anchor`'s file/line (and `side`), so the exact code the concern is about is in view. Read the anchored code before acting.
- **What's-next** — the `whatsNext` state, so it is clear what each Finding waits on: a **needs-action** wants a fix, a **needs-answer** wants your reply to a question, a **needs-decision** wants a call.

Findings arrive in reading order — code findings first (by file, then line), then whole-change, walkthrough, capture, text, detached. Walk them in that order.

## 4. Act — your process, not this skill's

How you act on each Finding is **your session's own process** — this skill hands you the queue and steps back. Read the anchored code, make the edit, decide against it, or raise a question, exactly as you would in any coding session. There is nothing docent-specific about the fixing itself, so this skill does not prescribe it.

## 5. Close — record outcomes through `/to-docent`

End your turn by recording what you did back into the Review with **`/to-docent`**. That skill carries the write half of the loop — it turns each outcome into the record that routes the Finding next, actor-blind (agent-integration.md §2.2, §2.3, §3.1):

| You… | `/to-docent` records | Finding becomes |
| --- | --- | --- |
| Made the fix | a reply, `--disposition actioned` | **needs-verify** |
| Decided against it | a reply, `--disposition declined` | **needs-decision** |
| Need an answer first | a reply, `--disposition question` | **needs-answer** |

Routing outcomes through `/to-docent` is what feeds the queue's what's-next derivation — without the reply, the Finding stays **needs-action** and the loop never advances. **Fetch here, act, then record there.**

## Boundaries

- **Read-only.** `/from-docent` writes nothing to `.docent/` — no Findings, no replies, no resolves. Fetching is this skill; recording outcomes is `/to-docent` (agent-integration.md §2.2).
- **Prescribes no fix.** It pulls and renders the queue; how to act is your own process. It never tells you what the fix is.
- **The default is needs-action, not the whole queue.** Reach past it with `--whats-next` / `--open` / `--resolved` when you deliberately want another slice (e.g. reviewing resolved Findings).
