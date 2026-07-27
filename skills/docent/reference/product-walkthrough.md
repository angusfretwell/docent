# Authoring the product walkthrough

The **editorial half** of the product walkthrough. Reads the **already-produced captures** ([capture.md](capture.md) drove them) and drops the tour's sections — prose with `{{capture:i}}` interleave and pinned `callouts[]`. It **touches no browser**: capture is expensive and separable, so this half re-runs cheaply against the same captures — structure and narration iterate without re-driving anything.

You run **unattended** — there is no human to ask, so judge what this brief leaves open and move.

**You are not reviewing this change** — you are showing the person who is about to what the app now does. Nothing you think about the implementation is reported, through any channel; review is a separate flow the human drives.

**Load [voice.md](voice.md) before you write a section body or a callout.** It owns the prose, and the code walkthrough loads the same file — that shared guide is why the two tours read as one.

## What you are given

- **The skill's absolute base directory** — this brief is `<base>/reference/product-walkthrough.md` and every file it links to, [voice.md](voice.md) first among them, is a sibling; resolve every path against `<base>`, never your cwd, which is the repository under review, where a relative path comes back empty.
- **The repository's absolute root** — run the CLI there, and find the walkthrough's manifest under it.
- **The product walkthrough's id** — the captures-only shell the executor filled, which you author into.
- **A short intent brief** — two or three sentences on what this change lets a person do, and what it replaced. It is your only account of the branch and it was written for you; the captures are everything else you need.
- **A focus, sometimes** — a concern the human scoped the run to. It steers which captures you foreground and how you order them. Default is a general reviewer's tour.

**You read no diff at all** — not the hunks, not `git log`, not `--stat`, not the source. This is load-bearing and it will look like an omission: a product tour written with the change open comes out a code tour with pictures, narrating what the branch did to the source rather than what a person can now do, and the source is the thing this reader can already see one tab over. The captures carry the product. Reaching for git here restores the material that turns an author into a reviewer.

## What you return

A receipt, not prose. Whoever dispatched you reads it back to the human as the tour's table of contents, so the titles are the payload — no summary of the change, no account of how you worked:

```text
walkthrough: wlk_01J…
title: Naming an export before it downloads
sections:
  1. The export that could not be named
  2. Typing the filename in the dialog
  3. What happens when the name is refused
obstacles: none
```

Every section you dropped, in tour order, titled exactly as it is titled in the tour. `obstacles: none` is the ordinary answer. When there is one it takes the same shape — one line each, said the way it will be read aloud to the human, because it is passed on verbatim:

```text
obstacles:
  - the validation capture is of an error page, so section 3 narrates what it shows rather than the state it meant to show
```

An obstacle is something that made the tour **less truthful** — a capture that does not show what its title claims, a shot the executor could not reach so the tour skips a beat. A criticism in an obstacle's clothes is still a criticism.

## 1. Read the captures — your whole subject

Capture runs **first** and leaves the product walkthrough shell: `walkthroughs/product/wlk_*/` with its `captures[]` registry populated and `sections` still empty. You author **into that shell** — read its manifest to get the captures you have to work with:

```bash
cat .docent/reviews/<branch-slug>/walkthroughs/product/<the id you were given>/manifest.json
```

`<branch-slug>` is the checked-out branch name with slashes turned to dashes. The id is the one you were handed, and only that one — the branch may hold earlier product walkthroughs, already narrated, that are none of your business. Each registry entry is `{ id: cap_…, kind, media, route, viewport, title, … }`; the `media` sha addresses the blob at `captures/<sha>.rrweb.json` — a screenshot holds the `[Meta, FullSnapshot]` pair, a recording the whole stream. **Look at what you are narrating**: replay a screenshot blob or read its serialized DOM. A title tells you what the executor meant to capture; the blob is what it got, and the gap between those two is where a section goes wrong. If no such shell exists, capture has not run — see Stop conditions.

## 2. Group, order, and narrate — the editorial call

The spine is prose-primary: an ordered list of authored sections, each narration plus embedded captures plus callouts. The judgment is yours:

- **Group captures into sections.** A capture is atomic — one screenshot or one recording; a section composes several deliberately (uploading a file, then the validation that fires). Reference each by its `cap_` id.
- **Order high-signal first.** Section order **is** the tour order — array position is the only rank.
- **Author Callouts, not Comments.** A **Callout** is your authored prose pinned to a region of a capture — durable, not a thread, not resolvable — distinct from a reviewer's Comment. Author Callouts, never Comments.

## 3. Drop each section — captures + interleave + callouts

One `add-section` call per section, **in tour order** (the manifest array is the order):

```bash
npx -y @angusfretwell/docent@latest walkthrough add-section --walkthrough wlk_… \
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

- **Body** — `--body <text>`, or omit it and pipe stdin for multi-line prose. The body and every callout body follow [voice.md](voice.md). Place `{{capture:i}}` markers to narrate _between_ captures; `i` is the capture's position in the `--capture` list, in the order passed. No markers ⇒ captures render in order after the prose.
- `--range` is the code arm; on a product walkthrough it is refused.

## 4. Set the title and confirm

Give the shell its `title` — capture leaves it empty because a title is editorial:

```bash
npx -y @angusfretwell/docent@latest walkthrough rename --walkthrough wlk_… --title "<the tour's title>"
#   → { "title": "…", "walkthroughId": "wlk_…" }
```

The tour is done when the title is set and every section is dropped in order. Schemas are validated on write, so a tour that lands renders with no hand-editing. Then return the receipt.

## Stop conditions

- **No product shell with captures exists** → **stop**: capture has not run. This half authors nothing without captures — there is nothing here to narrate and no browser of yours to fix it with.

## Non-goals

- **No browser.** This half only narrates; driving is [capture.md](capture.md)'s job, and re-driving is the run's call, not yours.
- **No file writes.** Every write you make goes through the `docent` CLI — `add-section` and `rename` — so a walkthrough file is never hand-authored.
- **Only ever author into the captures-only shell you were handed** — never re-narrate a tour that already has sections. `add-section` appends, so authoring onto a narrated walkthrough grows it rather than replacing it; a fresh one is the run's to create, never yours.
- **No git writes.** Committing is the human's workflow, and out of scope.
