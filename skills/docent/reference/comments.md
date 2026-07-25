# Comments — the review loop's I/O

The BYO-process review loop has **two I/O primitives**: **fetch-comments** (`/docent --read`) pulls the Review's Comments into the session for your own fixing process to act on; **write-comments** (`/docent --write`) records what the session produced back into the Review. Neither prescribes a review or a fix — the process in between is your session's own.

Both drive the `docent comment` CLI, documented first below, then each flow.

## The `docent comment` CLI

Run it from inside the repo under review (any subdirectory). It resolves the repo, the current branch's Review, and the Change refs — base at the merge-base, head at the branch tip — from git. It reads and writes under `.docent/reviews/<branch-slug>/`. The Review auto-creates on first use; a Change mints lazily on first reference. No server needs to be running.

Every subcommand prints machine-readable JSON on stdout. Errors go to stderr and exit non-zero.

**Non-gating** — the files under `.docent/` stay plain and directly writable; the CLI is the canonical, convenient path (ULID minting, anchor construction with git-resolved content `blobSha`, append semantics, Status derivation), never a lock. A running `docent serve` fs-watches every write, CLI-made or direct, and re-renders live over SSE, so each record is visible in the UI as it lands. Prefer the CLI: it validates against the same schema the server uses. Hand-authoring is the fallback when it isn't available.

### `docent comment list` — fetch

Folds every Comment, applies the filter, and prints `{ "comments": [ … ] }` in reading order (code comments first, by file then line; then whole-change, walkthrough, capture, text, detached). Each folded comment carries `id`, `anchor`, `body`, `participants[]`, `replies[]`, and `status` — the whole thread, enough to act without a second read.

```bash
npx -y @angusfretwell/docent comment list                              # the whole queue
npx -y @angusfretwell/docent comment list --status open                # only comments someone owes work on
npx -y @angusfretwell/docent comment list --status open,actioned       # everything unresolved (any-of: comma or repeat)
npx -y @angusfretwell/docent comment list --status actioned            # handed back — awaiting verification
npx -y @angusfretwell/docent comment list --anchor-file src/app.ts     # anchored on this file
npx -y @angusfretwell/docent comment list --author claude-code         # this author participated
```

Filters (all optional, AND-combined): `--status` (any-of), `--anchor-file` (the `line`/`file` code anchor is this path), `--author` (this author id participated).

**Status values** — `open`, `actioned`, `resolved`. Derived actor-blind from the type of each Comment's latest non-`edit` record:

| Latest record | Status | Means |
| --- | --- | --- |
| `open` · `reply` · `reopen` | **open** | Someone owes this work. |
| `action` | **actioned** | The turn was handed back — verify it. |
| `resolve` | **resolved** | Closed. |

`edit` records are skipped, so editing a body never moves Status.

### `docent comment add` — write a fresh Comment

Mints an anchored Comment, born **open**. Requires an anchor and a body.

```bash
npx -y @angusfretwell/docent comment add --change --body "The error path is never tested."                 # whole-change note
npx -y @angusfretwell/docent comment add --file src/app.ts --line 42:47 --body "This early-return leaks the lock."
npx -y @angusfretwell/docent comment add --file src/app.ts --body "This module has no exports."            # whole file, default side head
npx -y @angusfretwell/docent comment add --file src/app.ts --line 10 --side base --body "This was the safe version."
npx -y @angusfretwell/docent comment add --change <<'EOF'                                                  # long body via stdin — omit --body
Multi-paragraph comment body…
EOF
```

**Anchor** (exactly one required): `--change` (the whole Change); `--file <path>` (whole file, `--side base|head`, default `head`); `--file <path> --line <N[:M|-M]>` (1-based inclusive range); or `--anchor '<json>'` — the escape hatch for the capture / walkthrough / text-span arms the convenience flags don't cover, validated against the schema. The CLI resolves the code arm's content-addressed `blobSha` from git at write time, freezing the exact bytes the anchor points at.

**Body** — `--body <text>`, or omit it and pipe stdin (heredoc / pipe). Required.

### `docent comment reply` — write prose on a Comment

Appends a reply record. **Prose only** — a reply is the one place an outcome gets explained, and being the latest record it leaves the Comment **open**. That is deliberate: any comment reclaims the turn, so a reply on an `actioned` or `resolved` Comment returns it to the queue. `--comment <id>` and a body are required.

### `docent comment action` — hand the turn back

Appends an action record → **actioned**. No body: write the `reply` that explains the outcome first, then `action` to move the Comment. `actioned` is deliberately **broad** — it means _"I took my turn, over to you"_, whether you fixed it, declined it, or asked a question; the distinction lives in the reply prose, not an enum. Without the `action`, the Comment stays `open` and the next fetch picks it up again — a decline you never handed back gets re-attempted forever.

### `docent comment resolve` — close a Comment

Appends a resolve record → **resolved**. No body; if the close needs a reason, `reply` it first. Resolution is **unconstrained**: any actor may resolve any Comment — safe because a resolve is append-only, attributed, and **reopenable** (a later reply reopens the Comment). Whether a given actor _should_ resolve is a role question: a verify pass resolves; a fixer never resolves what it just fixed.

### `docent comment reopen` — return a resolved Comment to open

A later reply reopens implicitly; `reopen` is the explicit gesture without a comment. `--comment <id>` required, no body.

### Attribution — metadata, never permission

Every write records **who** did it; it never gates who may. By default the write is attributed to the git-config human. When you run these subcommands as an agent, pass `--agent <your-slug>` (optionally `--display`, `--model`) so the attribution reads true in the UI:

```bash
npx -y @angusfretwell/docent comment add --change --body "…" --agent claude-code --model claude-fable-5
npx -y @angusfretwell/docent comment action --comment cmt_… --agent claude-code
```

### Output shape

- `comment list` → `{ "comments": [ { "id", "anchor", "body", "participants", "replies", "status" }, … ] }`
- `add` / `reply` / `action` / `resolve` / `reopen` → `{ "changeId": "chg_…", "commentId": "cmt_…", "record": "NNN-<type>.md" }`

## Reading the queue — `/docent --read`

Pull Comments out of the Review and into your session so your own fixing process can act on them. This flow **writes nothing to `.docent/`**.

1. **Fetch the work — default to the open queue.** With no filter from the human, pull `--status open` — the fixer's inbox, where fresh Comments, plain comments, and "do it again" re-comments all fold. Reach past it with the filters above when the human deliberately wants another slice (verifying actioned Comments, reviewing resolved ones, one file's worklist).

   ```bash
   npx -y @angusfretwell/docent comment list --status open
   ```

2. **Render each Comment faithfully.** Bring each into context whole — never summarize away the parts a fixing process needs:
   - **Thread** — the `body` and every `reply`, in order, so what was raised, answered, or declined is present.
   - **Anchor** — the file/line (and `side`) the concern is about. Read the anchored code before acting.
   - **Status** — an **open** Comment wants a turn; an **actioned** one was handed back and waits on verification, an answer, or a decision. Because `actioned` is broad, the _reason_ lives in the **last reply** — read it before deciding whether an actioned Comment needs you; it is the difference between "fixed, please verify" and "I declined this, your call."

   Walk them in the reading order they arrive in.

3. **Act — your process, not this skill's.** Read the anchored code, make the edit, decide against it, or raise a question, exactly as in any coding session.

4. **Close — record outcomes through the write flow below.** The hand-back is what drains the queue: without the `action`, the Comment stays open and the next fetch hands you the same work again.

## Writing outcomes — `/docent --write`

Record what the session produced into the Review. The outcomes come from whatever process you already ran — your own review pass, an ad-hoc conversation, another tool, or a fix pass over Comments pulled via `--read`. This flow **transcribes**; it reviews nothing and fixes nothing of its own.

1. **Take stock of the session — record only what happened.** Never invent a Comment the session didn't raise, a hand-back for work it didn't do, or a resolution it didn't verify. Sort what actually happened:

   | The session… | Record it as | CLI |
   | --- | --- | --- |
   | Raised a new review concern | a **fresh Comment**, born open | `npx -y @angusfretwell/docent comment add` |
   | Addressed a Comment pulled via `--read` | a **reply**, then a **hand-back** | `npx -y @angusfretwell/docent comment reply` + `npx -y @angusfretwell/docent comment action` |
   | Looked at a claimed fix and found it wrong | a **reply** alone (leaves it open) | `npx -y @angusfretwell/docent comment reply` |
   | Verified a fix that now holds | a **resolve** | `npx -y @angusfretwell/docent comment resolve` |

   Then fetch the queue (`npx -y @angusfretwell/docent comment list --status open,actioned`) so a reply or resolve lands on the Comment it belongs to and you don't re-raise something already open. Work done against a Comment already in the queue is a **reply**; a genuinely new concern with no open Comment is a fresh **add**. When in doubt, match the concern's anchor against the queue.

2. **Fresh Comments — born open.** Anchor each as tightly as the concern allows — a line range beats a file, a file beats the whole change. One Comment per concern: a Comment is an anchored conversation; keep each to a single issue. Pass `--agent <your-slug>`.

3. **Replies and hand-backs — how a fixer's turn ended.** When the session addressed a Comment, end the turn with two records: a `reply` explaining what happened, then an `action` handing it back. All three outcomes — fixed, declined, blocked-on-a-question — record the same way; the difference belongs in the reply prose. **Always write the `action`.** The one case where a bare reply _is_ right: a **re-comment** — the session looked at a claimed fix and found it wrong or incomplete; leaving it open is the point.

4. **Resolves — fixes that hold.** When the session **verified** a fix against head and it holds, `reply` the evidence, then `resolve`. Housekeeping resolves (a duplicate, a stale Comment) are fine too, with a reply giving the reason.

   **Fixer ≠ resolver, by prose.** One flow carries the full write vocabulary, so the discipline is yours: don't resolve a Comment this same turn handed back with `action`. A fix and the verification that closes it are different passes — leave it **actioned** for a later pass that genuinely re-checked the fix against head. Leave other actioned Comments alone unless the session genuinely verified, answered, or decided them.

5. **Confirm.** Re-list the queue (`npx -y @angusfretwell/docent comment list --status open,actioned`) to confirm the outcomes landed: fresh Comments present, turns handed back, verified fixes closed.
