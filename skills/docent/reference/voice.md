# The walkthrough voice

Shared by both authoring flows — [code-walkthrough.md](code-walkthrough.md) and [product-walkthrough.md](product-walkthrough.md) — so the two tours read as one tour ([ADR 0004](../../../docs/adr/0004-docent-skill-runs-as-an-orchestrator-with-phase-subagents.md)). It owns prose only: what to select and how to drop it stays with each authoring file.

The reader already has the diff — or the capture — open in the panel beside your sentence. **The deletion test:** imagine the prose gone and only that panel left. If the reader loses nothing, do not write it. It is [comment-standards.md](../../../docs/comment-standards.md)'s test one level up: a comment narrates a line, a walkthrough narrates a change.

You are describing, never assessing. Opinions about the code belong to the review loop ([comments.md](comments.md)); a tour that grades the change has stopped being a tour.

## What earns its place

- **Intent** — what the change is for, which the diff shows only as its consequences.
- **The constraint** — an ordering, an invariant, a boundary a reader would otherwise trip over.
- **The alternative that fails** — where the obvious approach was tried and doesn't hold, say why. This is the sentence a reader cannot reconstruct.
- **What the user is trying to do** — the product walkthrough's spine. A product section is a person pursuing a goal, not an inventory of screens; the screenshots are evidence for the task, not the subject.

## Failure modes

Each of these is prose the diff or the screenshot already carries. Write the sentence underneath it instead:

- **Restating the diff** — "adds a `reanchorRange` helper that returns one of three states". The reader is looking at it. Say what it is for.
- **Throat-clearing** — "This section walks through…", "Let's take a look at…", "First, some context." Open on the sentence that carries information.
- **Selling** — "elegant", "cleanly separates", "robust", "nicely handles". Praise is assessment, and assessment is the review loop's. State the mechanism and let it stand.
- **List-shaped prose** — three bullets are three facts with the relation between them deleted, and the relation is the part worth writing. Connected sentences force you to state it.
- **Echoing the section title** — the title said it; the first sentence should start further in.
- **Flat altitude** — every section pitched at the same zoom, all mechanism or all summary. A tour moves: the opening section is about the change, a middle one about a decision, a later one about the line where it bites.

## Shape

- **A section is connected prose** — a short paragraph, two at most. No bullets, no headings inside a section.
- **A callout is a phrase or one sentence.** It renders as one small labeled line under the paragraph that placed it, paired with a marked region or moment on the capture — a label for that mark, not a paragraph; anything longer is a section that landed in the wrong place.
- **Interleave markers sit inside sentences.** `{{range:i}}` and `{{capture:i}}` are grammar, not appendices — a body that ends with a run of markers has made the prose a preamble and the targets a dump.

## Worked pairs

**A code section** — titled "Drift is resolved against the blob, not line numbers":

```text
BAD
This section walks through how drift is resolved against blob shas rather
than line numbers. A `planDrift` helper is added in
`src/shared/lib/drift.ts`, taking an anchor and its file context and
returning either a resolved state or a reanchor request. `reanchorRange`
is added alongside it, returning `live`, `shifted`, or `outdated`. This
cleanly separates drift calculation from rendering.
```

Throat-clears, restates the diff, echoes the title, and closes on a compliment.

```text
GOOD
An anchor born on an earlier change may still point at the right lines, at
lines that merely moved, or at bytes that no longer exist — and a reviewer
has to be able to tell those apart before trusting the comment hanging off
it. Comparing line numbers reports every anchor below an inserted hunk as
moved, so the blob sha decides first {{range:0}} and the search for the
born block runs only once the bytes have actually changed {{range:1}} —
which is what keeps `shifted` meaning the block moved, not the file.
```

**A product section** — titled "Landing on a review":

```text
BAD
Here we can see the Code tab {{capture:0}}. The walkthrough is on the left
and the diff on the right. Scrolling past a section brings its ranges up.
The comment composer is also shown {{capture:1}}.
```

An inventory of what is on screen, in list order, with the captures parked at the ends of their sentences.

```text
GOOD
A reviewer arriving on a branch gets the diff first, which answers what
changed and never why — so the tour sits one tab over {{capture:0}}, and
the first section's ranges are already framed when they get there, with
nothing further to click. The moment they disagree, the composer opens
against the line under the cursor {{capture:1}}: the comment is anchored
before it is written, so a half-formed objection never has to find
somewhere to attach.
```

**A callout**, pinned to the `Outdated` badge on a comment whose anchor no longer resolves:

```text
BAD
This is the new drift badge, rendered by `CommentsItem`, which appears once
an anchor stops resolving against the current blob — an elegant way to
surface an out-of-date anchor at a glance.
```

Names a component the reader cannot see, spends its one line on the mechanism the section already carries, and sells.

```text
GOOD
Outdated — the lines this was written against are gone.
```
