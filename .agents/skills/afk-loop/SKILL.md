---
name: afk-loop
description: Autonomous issue-clearing loop — supervise implementer, reviewer, and fixer sub-agents across the frontier of unblocked issues, then merge clean PRs. Run as `/loop /afk-loop`.
disable-model-invocation: true
---

You are the **supervisor**. You plan, dispatch sub-agents, and merge — implementers, reviewers, and fixers (each with a playbook in this folder) do the code work. Every dispatch is a fresh sub-agent; the prompt carries everything it needs. Each invocation is one **pass**; within it each issue flows PLAN → IMPLEMENT ⇄ REVIEW → MERGE. Run under `/loop` (`/loop /afk-loop`); the loop ends when the frontier is empty.

## 1. Plan

List open `ready-for-agent` issues (`gh issue list --label ready-for-agent --state open`). Build a dependency graph: issue B is blocked by issue A when the issue text says so, and also when

- B needs code or infrastructure that A introduces,
- B and A modify overlapping files or modules, so concurrent work would likely merge-conflict, or
- B's requirements depend on a decision or API shape A will establish.

A PRD issue with linked implementation issues is never workable — work the implementation issues instead.

The **frontier** is the set of issues with zero blockers among open issues. An issue that already has an open PR resumes at step 3 (review) instead of being re-implemented.

Done when: every open `ready-for-agent` issue is classified as frontier, blocked (by which issue), or PRD.

## 2. Dispatch implementers

Launch one implementer per frontier issue — at most 5 per pass; the rest stay on the next pass's frontier — all Agent calls in a single message so they run in parallel. Prompt each with:

> Read `.agents/skills/afk-loop/implementer.md` and follow it for issue #\<issue\>.

Done when: every frontier issue has exactly one implementer or is held for the next pass.

## 3. Review rounds

When an implementer returns a PR, launch a reviewer:

> Read `.agents/skills/afk-loop/reviewer.md` and follow it for issue #\<issue\>.

- **Findings** → launch a fixer:

  > Read `.agents/skills/afk-loop/fixer.md` and follow it for issue #\<issue\>. Address: \<the findings, verbatim\>

  then re-review with a fresh reviewer, appending `Prior findings to verify: <findings>` to its prompt. Each findings→fix→re-review cycle is one **round**.
- **Clean** → the issue is ready to merge.
- **Still failing after round 3** → stop the issue (below).

Done when: every dispatched issue is ready to merge, or stopped.

## 4. Merge

For each issue whose review came back clean, wait for CI: `gh pr checks <pr> --watch`.

- **Green** → merge: `gh pr merge <pr> --squash --delete-branch`. The PR body's `Closes #<issue>` closes the issue.
- **Red** → launch a fixer with the failing check's output, then re-check. Still red after two red→fix cycles → stop the issue.
- **Merge conflict** (the merge command fails after a sibling PR lands) → launch a fixer to rebase onto main, wait for green again, then retry the merge.

Done when: every clean PR is green and merged.

## Stopping an issue

A stopped issue gets a comment explaining exactly what blocked it, loses its `ready-for-agent` label so no pass picks it up again, and the other issues keep going.

- **One-way door** — reported by an implementer or fixer, which writes the comment itself (see the implementer playbook). Record it as stopped and move on.
- **Cap hit** — review still failing at round 3, or CI still red after two fix cycles: you write the comment — list the remaining blocking findings or failing check output so a human can take over. `gh issue edit <issue> --remove-label ready-for-agent`.

## End of pass

Merges can unblock issues, so a completed pass is not the end of the work. End every pass with a status line — issues merged, stopped (and why), still blocked — then:

- Any open `ready-for-agent` issue remains → schedule the next wakeup at the minimum delay (merges and the dispatch cap mean work is already unblocked) with the same `/afk-loop` prompt; the next pass replans from step 1.
- Frontier empty and every remaining issue is blocked or stopped → stop the loop, with the final status as your summary.
