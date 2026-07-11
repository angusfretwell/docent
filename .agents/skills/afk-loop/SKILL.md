---
name: afk-loop
description: Autonomous issue-clearing loop — supervise implementation and review sub-agents across the frontier of unblocked issues, then merge clean PRs. Run as `/loop /afk-loop`.
disable-model-invocation: true
---

You are the **supervisor**. You plan, dispatch sub-agents, and merge — sub-agents write the code and review it. Each invocation is one **pass**: PLAN → IMPLEMENT+REVIEW → MERGE. Run under `/loop` (`/loop /afk-loop`); the loop ends when the frontier is empty.

An issue's life: PLAN → IMPLEMENT ⇄ REVIEW → MERGE.

## 1. Plan

List open `ready-for-agent` issues (`gh issue list --label ready-for-agent --state open`). Build a dependency graph: issue B is blocked by issue A when the issue text says so, and also when

- B needs code or infrastructure that A introduces,
- B and A modify overlapping files or modules, so concurrent work would likely merge-conflict, or
- B's requirements depend on a decision or API shape A will establish.

A PRD issue with linked implementation issues is never workable — work the implementation issues instead.

The **frontier** is the set of issues with zero blockers among open issues. An issue that already has an open PR resumes at step 3 (review) instead of being re-implemented.

Done when: every open `ready-for-agent` issue is classified as frontier, blocked (by which issue), or PRD.

## 2. Dispatch implementation

Launch one implementation sub-agent per frontier issue — all Agent calls in a single message so they run in parallel. Prompt each with:

> Read `.agents/skills/afk-loop/implementation.md` and follow it for issue #\<n\>.

Done when: every frontier issue has exactly one implementation agent, and you have recorded each agent's ID (you will message it during review rounds).

## 3. Review rounds

When an implementation agent returns a PR, launch a review sub-agent:

> Read `.agents/skills/afk-loop/review.md` and follow it for issue #\<m\>.

- **Findings** → SendMessage them to the _same_ implementation agent (its context is intact), then re-review the pushed fixes. Each findings→fix→re-review cycle is one **round**.
- **Clean** → the issue is ready to merge.
- **Still failing after round 3** → stop the issue (below).

Done when: every dispatched issue is ready to merge, or stopped.

## 4. Merge

For each issue whose review came back clean, wait for CI: `gh pr checks <n> --watch`.

- **Green** → merge: `gh pr merge <n> --squash --delete-branch`. The PR body's `Closes #<n>` closes the issue.
- **Red** → SendMessage the failing check's output to the issue's implementation agent to fix and push, then re-check.

Done when: every clean PR is green and merged.

## Stopping an issue

A stopped issue gets a comment explaining exactly what blocked it, loses its `ready-for-agent` label so no pass picks it up again, and the other issues keep going.

- **One-way door** — reported by an implementation agent, which writes the comment itself (see its playbook). Record it as stopped and move on.
- **Review still failing when the round cap is hit** — you write the comment: list the remaining blocking findings so a human can take over. `gh issue edit <n> --remove-label ready-for-agent`.

## End of pass

Merges can unblock issues, so a completed wave is not the end of the work. End every pass with a status line — issues merged, stopped (and why), still blocked — then:

- Any open `ready-for-agent` issue remains → schedule the next wakeup with the same `/afk-loop` prompt; the next pass replans from step 1.
- Frontier empty and every remaining issue is blocked or stopped → stop the loop, with the final status as your summary.
