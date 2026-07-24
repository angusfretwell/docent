# Authoring the product walkthrough

The **editorial half** of the product pillar. Reads the Change and the **already-produced captures**, and drops the product walkthrough's sections — prose with `{{capture:i}}` interleave and pinned `callouts[]`. It **touches no browser**: capture is expensive and separable, so this half re-runs cheaply against the same captures — structure and narration iterate without re-driving anything. Driving the browser is [capture.md](capture.md); Comments belong to the review loop ([comments.md](comments.md)).

The output is plain files a running `docent serve` re-renders live. The CLI is non-gating (hand-authoring identical files works too) but validates against the schemas the server renders; your work is the editorial judgment.

## 1. Find the captured shell — the captures you narrate over

Capture runs **first** and mints the product walkthrough shell: `walkthroughs/product/wlk_*/` with its `captures[]` registry populated and `sections` still empty. You author **into that shell** — read its manifest to get the captures you have to work with:

```bash
cat .docent/reviews/<branch-slug>/walkthroughs/product/wlk_*/manifest.json
```

Take the latest product `wlk_` that has `captures[]` and empty `sections` (or the `--walkthrough` id the reconcile flow handed you). Each registry entry is `{ id: cap_…, kind, media, route, viewport, … }`; the `media` sha addresses the blob at `captures/<sha>.rrweb.json` — a screenshot holds the `[Meta, FullSnapshot]` pair, a recording the whole stream. Replay a screenshot blob, or read its serialized DOM, if you need to see what it shows before narrating it. If no such shell exists, capture has not run — see Stop conditions.

## 2. Read the Change and intent

Read the Change with plain `git`, and intent from the **branch name**, the base..head **commit messages**, and your **session context**:

```bash
git fetch
git log --oneline origin/HEAD..HEAD    # fall back to origin/<default-branch> if origin/HEAD is unset
git diff origin/HEAD...HEAD
```

- **Optional focus.** A human-scoped concern steers which captures to foreground and how to order them. Default is a general reviewer's tour.

## 3. Group, order, and narrate — the editorial call

The spine is prose-primary: an ordered list of authored sections, each narration plus embedded captures plus callouts. The judgment is yours:

- **Group captures into sections.** A capture is atomic — one screenshot or one recording; a section composes several deliberately (uploading a file, then the validation that fires). Reference each by its `cap_` id.
- **Order high-signal first.** Section order **is** the tour order — array position is the only rank.
- **Author Callouts, not Comments.** A **Callout** is your authored prose pinned to a region of a capture — durable, not a thread, not resolvable — distinct from a reviewer's Comment. Author Callouts, never Comments.

## 4. Drop each section — captures + interleave + callouts

One `add-section` call per section, **in tour order** (the manifest array is the order):

```bash
npx -y docent walkthrough add-section --walkthrough wlk_… \
  --title "Uploading a file" \
  --capture cap_a --capture cap_b \
  --callout '{"anchor":{"kind":"screenshot-region","capture":"cap_a","rect":[0.1,0.2,0.3,0.1]},"body":"The new upload control."}' \
  --callout '{"anchor":{"kind":"recording-timestamp","capture":"cap_b","fromMs":3200,"toMs":5000},"body":"Validation fires on blur."}' <<'EOF'
Drag a file onto the dropzone {{capture:0}} and the upload begins {{capture:1}}.
EOF
#   → { "section": "sNN-<slug>.md", "sectionId": "sec_…", "walkthroughId": "wlk_…" }
```

- `--capture` takes `cap_` ids from the manifest's `captures[]`. Repeatable (or comma-joined).
- `--callout` takes one JSON callout each — **repeat the flag per callout, never comma-join** (the JSON embeds commas). The shape is `{ "anchor": <arm>, "body": "…" }`, validated against the same `Anchor` schema Comments use. The product arms:

  ```jsonc
  { "kind": "screenshot-region", "capture": "cap_a", "rect": [0.1, 0.2, 0.3, 0.1] } // rect [x,y,w,h], normalized 0–1
  { "kind": "recording-timestamp", "capture": "cap_b", "fromMs": 3200, "toMs": 5000 } // ms from recording start
  ```

  Each callout's `capture` must be a `cap_` id this section embeds — the CLI checks the callout's schema shape only, not that membership, so keeping it true is yours.

- **Body** — `--body <text>`, or omit it and pipe stdin for multi-line prose. Place `{{capture:i}}` markers to narrate _between_ captures; `i` is the capture's position in the `--capture` list, in the order passed. No markers ⇒ captures render in order after the prose.
- `--range` is the code arm; on a product walkthrough it is refused.

## 5. Set the title and confirm

Give the shell its `title` — capture leaves it empty because a title is editorial. No subcommand renames the shell after `create`, so set its title directly in `manifest.json` (a plain field; the write is non-gating and `docent serve` re-renders it):

```jsonc
// manifest.json → "title": "…"
```

The tour is done when the title is set and every section is dropped in order. If `docent serve` is running, the Product walkthrough tab shows each section, capture, and callout pin appear live. Schemas are validated on write, so a tour that lands renders with no hand-editing.

## Stop conditions

- **No product shell with captures exists** → **stop**: capture has not run. This half authors nothing without captures — run [capture.md](capture.md) first.

## Boundaries

- **No browser.** This half only narrates; re-driving capture is [capture.md](capture.md)'s job.
- **Walkthroughs only, never Comments.** Author Callouts; leave Comments to the review loop.
- **Regeneration mints a fresh `wlk_`** — never re-narrate a prior, already-authored walkthrough in place. Because `add-section` appends, author into a captures-only shell with empty `sections`; don't append onto a tour already narrated. When to regenerate is the reconcile decision in SKILL.md.
- **Commit / push is the human's git workflow** — out of scope.
