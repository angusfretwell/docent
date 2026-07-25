# The walkthrough voice

Shared by both authoring flows — [code-walkthrough.md](code-walkthrough.md) and [product-walkthrough.md](product-walkthrough.md) — so the two tours read as one tour. It owns prose only: what to select and how to mint stays with each authoring file.

The reader already has the diff open beside your sentence and the screenshot above it. **The deletion test:** imagine the prose gone and only the diff or the screenshot left. If the reader loses nothing, do not write it. This is the same test [comment-standards.md](../../../docs/comment-standards.md) applies to code — a walkthrough is that document's sibling one level up, narrating a change where a comment narrates a line.

You are describing, never assessing. Opinions about the code belong to the review loop ([comments.md](comments.md)); a tour that grades the change has stopped being a tour.

## What earns its place

- **Intent** — what the change is for, which the diff shows only as its consequences.
- **The constraint** — an ordering, an invariant, a boundary a reader would otherwise trip over.
- **The alternative that fails** — where the obvious approach was tried and doesn't hold, say why. This is the sentence a reader cannot reconstruct.
- **What the user is trying to do** — the product walkthrough's spine. A product section is a person pursuing a goal, not an inventory of screens; the screenshots are evidence for the task, not the subject.

## Failure modes

Each of these is prose the diff or the screenshot already carries. Write the sentence underneath it instead:

- **Restating the diff** — "adds a `resolveDrift` function that returns one of three states". The reader is looking at it. Say what it is for.
- **Throat-clearing** — "This section walks through…", "Let's take a look at…", "First, some context." Open on the sentence that carries information.
- **Selling** — "elegant", "cleanly separates", "robust", "nicely handles". Praise is assessment, and assessment is the review loop's. State the mechanism and let it stand.
- **List-shaped prose** — three bullets are three facts with the relation between them deleted, and the relation is the part worth writing. Connected sentences force you to state it.
- **Echoing the section title** — the title said it; the first sentence should start further in.
- **Flat altitude** — every section pitched at the same zoom, all mechanism or all summary. A tour moves: the opening section is about the change, a middle one about a decision, a later one about the line where it bites.

## Shape

- **A section is connected prose** — a short paragraph, two at most. No bullets, no headings inside a section.
- **A callout is a phrase or one sentence.** It sits on the image and competes with it; anything longer is a section that landed in the wrong place.
- **Interleave markers sit inside sentences.** `{{range:i}}` and `{{capture:i}}` are grammar, not appendices — a body that ends with a run of markers has made the prose a preamble and the targets a dump.

## Worked pairs

**A code section** — titled "Drift is resolved against the blob, not line numbers":

```text
BAD
This section walks through how drift is resolved against blob shas rather
than line numbers. A `resolveDrift` helper is added in
`src/shared/lib/drift.ts`, taking an anchor and a change and returning
`live`, `shifted`, or `outdated`. The view is updated to call it. This
cleanly separates drift calculation from rendering.
```

Throat-clears, restates the diff, echoes the title, and closes on a compliment.

```text
GOOD
An anchor born on an earlier change may still point at the right lines, at
lines that merely moved, or at bytes that no longer exist — and a reviewer
has to be able to tell those apart before trusting the comment hanging off
it. Comparing line numbers reports every anchor below an inserted hunk as
shifted, so the resolution runs against the blob sha instead {{range:0}}
and the view {{range:1}} only picks a colour.
```

**A product section** — titled "Landing on a review":

```text
BAD
Here we can see the walkthrough tab {{capture:0}}. It shows the section
list on the left and the diff on the right. Clicking a section scrolls the
diff to its ranges. The comment composer is also shown {{capture:1}}.
```

An inventory of what is on screen, in list order, with the captures parked at the ends of their sentences.

```text
GOOD
A reviewer opens a branch wanting one thing first — what changed and why —
so the tour lands them already inside it, with the first section's ranges
scrolled into view {{capture:0}} and nothing to click to get there. The
moment they disagree, the composer opens against the line under the cursor
{{capture:1}}: the comment is anchored before it is written, so a
half-formed objection never has to find somewhere to attach.
```

**A callout**, pinned to the badge on a drifted comment:

```text
BAD
This is the new drift badge, rendered by `DriftBadge`, which shows whether
an anchor is live, shifted, or outdated — an elegant way to surface
staleness at a glance.
```

Names the component the reader cannot see, restates three states the image shows, and sells.

```text
GOOD
Shifted — the anchor moved, it did not break.
```
