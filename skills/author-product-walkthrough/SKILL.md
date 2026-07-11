---
name: author-product-walkthrough
description: Author the Product walkthrough for a Change from already-produced captures — the editorial, no-browser half of the product pillar. Use when narrating a product tour over existing captures, or when /docent needs the product pillar's editorial half.
---

# author-product-walkthrough

The **editorial half** of the product pillar (agent-integration.md §3.2, walkthroughs.md §10). Reads a Change and the **already-produced captures**, and drops the product walkthrough's sections — prose with `{{capture:i}}` interleave and pinned `annotations[]`. It **touches no browser**: capture is expensive and separable, so this half re-runs cheaply against the same captures — structure and narration iterate without re-driving anything. Driving the browser is the sibling `/capture-product-walkthrough`; Findings belong to `/to-docent`.

The output is plain files the running tool re-renders live. Load **`/docent-cli`** for the exact `docent walkthrough` command surface — the `add-section` flags, the `{{capture:i}}` interleave rule, the annotation JSON arms, output shape. It is non-gating (hand-authoring the identical files works too, agent-integration.md §3.3); the steps below drive it, and your work is the editorial judgment.

## 1. Find the captured shell — the captures you narrate over

Capture runs **first** and mints the product walkthrough shell: `walkthroughs/product/wlk_*/` with its `captures[]` registry populated and `sections` still empty (`/capture-product-walkthrough` §6). You author **into that shell** — read its manifest to get the captures you have to work with:

```bash
cat .docent/reviews/<branch-slug>/walkthroughs/product/wlk_*/manifest.json
```

Take the latest product `wlk_` that has `captures[]` and empty `sections` (or the `--walkthrough` id an orchestrator handed you). Each registry entry is `{ id: cap_…, kind, media, route, viewport, … }`; the `media` sha addresses the blob at `captures/<sha>.{png,rrweb.json}`. Inspect a screenshot blob if you need to see what it shows before narrating it. If no such shell exists, capture has not run — see Stop conditions.

## 2. Read the Change and intent

Read the Change with **plain `git`** in your own session (walkthroughs.md §10), and intent from the **branch name**, the `base..head` **commit messages**, and your **session context**:

```bash
git fetch
git log --oneline origin/HEAD..HEAD
git diff origin/HEAD...HEAD
```

- **Optional focus.** A human-scoped concern steers which captures to foreground and how to order them. Default is a general reviewer's tour.

## 3. Group, order, and narrate — the editorial call

The prose-primary spine: an ordered list of authored sections, each narration plus embedded captures plus annotations (walkthroughs.md §2). The judgment is yours (walkthroughs.md §10):

- **Group captures into sections.** A capture is atomic — one screenshot or one recording; a section composes several deliberately (uploading a file, then the validation that fires). Reference each by its `cap_` id.
- **Order high-signal first.** Section order **is** the tour order — array position is the only rank (walkthroughs.md §4).
- **Annotate, don't Find.** An **annotation** is your authored callout pinned to a region of a capture — durable, not a thread, not resolvable — distinct from a reviewer's Finding (walkthroughs.md §7). Author annotations, never Findings.

## 4. Drop each section — captures + interleave + annotations

Append sections **in tour order**. `--capture` takes the `cap_` ids from the registry; `--annotation` takes one JSON callout each (repeat the flag), pinned to a region of a capture or a recording timestamp. Place `{{capture:i}}` markers to narrate _between_ captures. See `/docent-cli` for the flags, the annotation anchor arms, and the no-markers fallback.

```bash
docent walkthrough add-section --walkthrough wlk_… \
  --title "Uploading a file" \
  --capture cap_a --capture cap_b \
  --annotation '{"anchor":{"kind":"screenshot-region","capture":"cap_a","rect":[0.1,0.2,0.3,0.1]},"body":"The new upload control."}' \
  --annotation '{"anchor":{"kind":"recording-timestamp","capture":"cap_b","fromMs":3200,"toMs":5000},"body":"Validation fires on blur."}' <<'EOF'
Drag a file onto the dropzone {{capture:0}} and the upload begins {{capture:1}}.
EOF
```

Each annotation's `capture` must be a `cap_` id this section embeds — the CLI checks the annotation's schema, not that membership, so it is yours to keep true (`/docent-cli`). One `add-section` call per section, in order.

## 5. Set the title and confirm

Give the shell its `title` — capture leaves it empty because a title is editorial. No subcommand renames the shell after `create`, so set its title directly in `manifest.json` (a plain field; the write is non-gating and `docent serve` re-renders it):

```jsonc
// manifest.json → "title": "…"
```

The tour is done when the title is set and every section is dropped in order. If `docent serve` is running, the Product walkthrough tab shows each section, capture, and annotation pin appear live (walkthroughs.md §1). Schemas are validated on write, so a tour that lands renders with no hand-editing.

## Stop conditions

- **No product shell with captures exists** → **stop**: capture has not run. This skill authors nothing without captures — run `/capture-product-walkthrough` first (or `/docent`, which composes capture → author).

## Boundaries

- **No browser.** This half only narrates; it re-runs cheaply against the same captures. Re-driving capture is the sibling skill's job.
- **Walkthroughs only, never Findings** — single-purpose (walkthroughs.md §10). Author annotations; leave Findings to `/to-docent`.
- **Regeneration mints a fresh `wlk_`** — never re-narrate a prior, already-authored walkthrough in place (walkthroughs.md §2); a product walkthrough is durable and immutable. A fresh tour for a later Change re-drives capture into a new shell — `/docent`'s call (agent-integration.md §3.1). Because `add-section` appends, author into a captures-only shell with empty `sections`; don't append onto a tour already narrated.
- **Commit / push is the human's git workflow** — out of scope (agent-integration.md §3.4).
