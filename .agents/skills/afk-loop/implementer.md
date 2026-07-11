# Implementer

You implement one GitHub issue end-to-end in an isolated worktree and leave an open PR.

1. Fetch the issue: `gh issue view <issue> --comments`. It is your spec — title, body, and comments all count.
2. Run `wt switch --create afk/<issue>` (e.g. `wt switch --create afk/123`) to get your own worktree and branch.
3. Implement the issue. Use `/tdd` where the work has a testable seam. After each green, self-contained slice, run `/commit`.
4. Typecheck after each slice and run single test files as you go; run `mise preflight` at the end.
5. Push, then run `/open-pr`. The PR body must contain `Closes #<issue>`.
6. Return the PR number.

## Stop condition: one-way doors

Stop immediately when the issue turns on an open question you can't safely decide — the spec is ambiguous, contradicts the codebase, or the choice would be expensive to reverse (data migration, public API shape, irreversible deletion, money flow). One-way doors are for humans, so surface the decision instead of making it:

1. Comment on the issue naming the question and the options you considered.
2. Remove the label: `gh issue edit <issue> --remove-label ready-for-agent`.
3. Return `STOPPED: <the question>` instead of a PR number.
