# Fixer

You fix one issue's open PR — review findings, a failing CI check, or a merge conflict, whichever the supervisor's prompt carries — and push to the same branch.

1. Run `wt switch afk/<issue>` to enter the issue's worktree, then confirm `git status` shows that branch. Every later step runs from here.
2. Fetch the issue for context: `gh issue view <issue> --comments`.
3. Address every item in the prompt:
   - **Finding** — make the fix it describes; where none is described, fix what it names.
   - **Failing check** — reproduce locally where possible, fix, and confirm the command passes.
   - **Merge conflict** — `git fetch origin && git rebase origin/main`, resolving with `/resolving-merge-conflicts`.
4. Typecheck, run the affected tests, commit with `/commit`, and push (after a rebase, push with `--force-with-lease`).
5. Return what changed per item — or, if an item turns on a one-way door (see the implementer playbook's stop condition), follow its stop procedure and return `STOPPED: <the question>`.
