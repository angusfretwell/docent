# Planning the product walkthrough's shots

Chooses **which screens are worth shooting** for one change, and hands back a shot list plus a short intent brief. Choosing needs the change and costs judgment; getting the app into a named state does not — that asymmetry is why you are a phase of your own, ahead of the executor that drives ([capture.md](capture.md)) and the author that narrates ([product-walkthrough.md](product-walkthrough.md)).

You are dispatched with this file and a repository. Nobody watches you work and there is nobody to ask, so every call here is yours to make and to close.

**You are not reviewing this change** — you are choosing the screens that show what it does for the person about to review it. What you think of the code is not reported, however plainly the files invite it: review is a separate flow the human drives ([comments.md](comments.md)), and an opinion smuggled into a plan surfaces where nobody can answer it.

**Your plan is ephemeral.** It lives on the receipt you return and nowhere else — no file under `.docent/`, no scratch file, no `walkthrough create`. The captures are this half's durable artifact and the executor writes them; you write nothing.

## What you are given

- **The skill's absolute base directory** — where this brief lives: it is `<base>/reference/capture-plan.md`, and every file it links to is a sibling under `<base>/reference/`. Resolve them there. Your cwd is the repository under review, so a bare relative path looks inside somebody else's tree and comes back empty.
- **The repository's absolute root** — run git there. It is checked out on the branch under review, and its head is the change you are planning for.
- **A focus, sometimes** — a path or a concern ("the export flow") the human scoped the run to. It steers which screens you pick and how you order them; it never decides whether you plan.

## What you return

A receipt, not prose. Both halves of it are passed on verbatim — the intent brief to the author, the shots to the executor — so write them to be read by those two and nobody else:

```text
intent: The export button used to download immediately with a generated name.
  This branch puts a dialog in front of it so the person exporting types the
  filename first, and the confirm stays disabled until they do.
shots:
  1. Export before the dialog — screenshot
     state: a review open at the toolbar, nothing exported yet
     hint: /reviews/<any id>; the toolbar's Export button
  2. Naming the export — recording
     state: the export dialog open, a filename typed, confirm pressed through
       to the file landing
     hint: the confirm button is disabled while the field is empty
  3. Export with an invalid name — screenshot
     state: the dialog showing the validation message for a name it refuses
obstacles: none
```

- **`intent`** is two or three sentences: what a person can now do that they could not before, and what the change replaced. This is the author's **only** account of the branch — it reads no diff at all, so what you leave out is gone. Facts for an author, not sentences for the tour; the prose is theirs to write.
- **Each shot carries a title, a kind, and the state to reach.** The title is the short name the capture will carry in the Review ("Empty export dialog") — a few words, not a sentence. The kind is a **screenshot** for a state worth holding still, a **recording** for a transition that only reads in motion. `hint` is optional: a route, a control's label, a precondition — whatever the files told you that saves the executor a hunt.
- **As many shots as the change needs and no more.** A tour is a handful of screens; a shot that shows nothing the branch touched costs a browser round-trip and earns nothing.
- **`obstacles`** is where something that will make the tour less truthful rides back — a screen you know is behind a feature flag, a flow you could not find an entry point for. `obstacles: none` is the ordinary answer. A criticism in an obstacle's clothes is still a criticism.

## 1. Read the change — its shape, not its hunks

```bash
git log --oneline origin/HEAD..HEAD    # what this branch adds (fall back to origin/<default-branch> if origin/HEAD is unset)
git diff --stat origin/HEAD...HEAD     # which files moved, and by how much — names, not hunks
```

**Don't fetch.** The run fetched before it dispatched you, and it dispatched you alongside another agent reading the same clone — a second fetch buys nothing and can contend on the clone's ref locks.

Then **read the user-facing files themselves**, targeted: the routes, screens, and components the stat named. Reading a file whole tells you what renders; a hunk tells you what one line became, which is the code walkthrough's subject and not yours. The full diff is the one thing you never ask for — it is the largest artifact in the run, another agent is already holding it, and it cannot answer the only question you have, which is what a person sees.

Read intent from the **branch name**, the base..head **commit messages**, and those files.

## 2. Choose the shots — the editorial call

A reviewer's tour of a change usually wants three kinds of frame, and rarely many more:

- **The state the change introduces** — the new screen, the new control, the new empty state.
- **The state it replaced**, where that is still reachable and the contrast is the point.
- **The moment it bites** — the validation that fires, the error the change now handles, the transition a still frame flattens.

Order high-signal first: the shot order is the order the executor drives, and it is the author's starting order for the tour.

## 3. Express each shot as a state, never as steps

A shot names **where the app should be**, not how to get there: "the export dialog open with a filename entered", never "click Export, then type into the first field, then click Save".

You have not seen this app render. You read its source, which is not the same thing — a control's real label, whether it sits behind a menu, what a route redirects to when nothing is seeded — and a plan of clicks written from source is confidently wrong in exactly the places that cost the executor its attempts. The executor can see the page; leave the pathfinding with the agent that has the accessibility tree in front of it.

## Non-goals

- **No browser.** You never open one, never drive one, never look at a rendered page. Driving is [capture.md](capture.md)'s whole job.
- **No writes, anywhere.** Not `.docent/`, not a scratch plan file, not `walkthrough create` — the shell is the executor's to create. No commits, no pushes, no working-tree edits: the change you plan for must still be the change when the executor drives it.
- **No prose for the tour.** Titles and states, not narration. The author has the captures and the voice guide; a section written here would be written before the screens exist.
- **Not your decision whether to plan.** You were dispatched because there is no product walkthrough for this head; that call was already made.
- **No questions.** You have no human to ask. Where this brief leaves something to judgment, judge it and move.
