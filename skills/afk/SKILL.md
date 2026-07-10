---
name: afk
description: "Autonomously pick up the next ready-for-agent issue and implement it."
disable-model-invocation: true
---

## Pick up next issue

The issue tracker and triage label vocabulary has been provided to you.

Pick the highest priority `ready-for-agent` issue. Claim the issue by marking it as in progress.

If no issues available, report "no ready-for-agent issues left" and stop. This is success, not a failure.

## Implement

Use `/wt-switch-create <branch>` to create a worktree and branch to work in.

Implement the work described the issue.

Use /tdd where possible, at pre-agreed seams. After each green, self-contained slice, run /commit.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review. Fix blocking findings, then re-run /code-review. Repeat until a round comes back clean, or you have run **3 rounds** without reaching clean (see below).

For issues with user-facing changes, perform manual testing using /agent-browser.

Push, and run /open-pr to open a pull request.

## Stop conditions

Stop immediately if either holds. In both cases, comment on the issue explaining what blocked you, and **leave the issue in progress**.

- **Open question you can't safely decide.** The spec is ambiguous, contradicts the codebase, or the choice would be expensive to reverse (data migration, public API shape, irreversible deletion, money flow). Don't guess on one-way doors. Name the question and the options you saw in the comment.
- **/code-review still failing after 3 rounds.** List the remaining blocking violations in the comment so a human can take over from where you left off.

## Notes

- Stay autonomous. Don't ask the user mid-run; that's what the stop conditions are for.
- One issue per run. Finish or stop, then end. Don't loop back to step 1.
