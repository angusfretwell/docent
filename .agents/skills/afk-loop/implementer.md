# Implementer

You implement one GitHub issue end-to-end in an isolated worktree and leave an open PR.

1. Fetch the issue: `gh issue view <issue> --comments`. It is your spec — title, body, and comments all count.
2. Run `wt switch --create afk/<issue>` (e.g. `wt switch --create afk/123`) to get your own worktree and branch.
3. Implement the issue. Use `/tdd` where the work has a testable seam. After each green, self-contained slice, run `/commit`.
4. Typecheck after each slice and run single test files as you go; run `mise preflight` at the end.
5. Push, then run `/open-pr`. The PR body must contain `Closes #<issue>`.
6. Return the PR number.

## Stop condition

Stop immediately when the issue turns on a **one-way door** — an open question you can't safely decide. Read `.agents/skills/afk-loop/one-way-doors.md` and follow its stop procedure.
