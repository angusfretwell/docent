# Narrating the run

The phrasings [SKILL.md](../SKILL.md) reaches for when it speaks to the human, and the one orientation a first run needs. Reached from the top of "Narrate the run" where there is no `.docent/` yet, and from §3 for the decision.

## First run

No `.docent/` directory at the repo root means this human has never seen docent. Open by naming that, and by naming the checking as checking — "Looks like this is docent's first run here, so let me make sure I've got what I need" — which is both what is true and what buys the pause the checks take.

Then, before anything long-running — and ahead of the preflight's one-time setup prompt (§1) where there is one — spend a short paragraph on what they are about to get: two walkthroughs of this branch, a **code** tour through the diff and a **product** tour through the running app, served as a browser tour a reviewer walks. Say that the product tour drives the app the way a user would and leaves it untouched, and that the setup you are about to ask for is recorded to `.docent/capture.md`, so it is asked once and later runs go unattended unless something about serving the app changes. Then ask.

## Saying the decision

One line per kind, in one breath covering both:

| What came back | What you say |
| --- | --- |
| Both `absent` | "Writing the code and product walkthroughs for this branch." |
| `code` is `stale` | "The code walkthrough was written N changes back — writing a fresh one." |
| `product` is `current` | "The product walkthrough is up to date — leaving it." |
| `product` is `empty` | "The product walkthrough has its screens but no narration — writing a fresh one." |
| `code` is `empty` | "The code walkthrough was started but its sections never landed — writing a fresh one." |
| The app is not reachable, so the product walkthrough leaves scope (§1) | "Your dev server isn't answering at `<url>`, so this run writes the code walkthrough only." |
| No browser and none installable, so the product walkthrough leaves scope (§1) | "I couldn't get a browser for the product tour to drive — `<the gate's detail>` — so this run writes the code walkthrough only." |
