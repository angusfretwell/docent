# One-way doors

A **one-way door** is an open question you can't safely decide: the spec is ambiguous, contradicts the codebase, or the choice would be expensive to reverse (data migration, public API shape, irreversible deletion, money flow). One-way doors are for humans, so surface the decision instead of making it:

1. Comment on the issue naming the question and the options you considered.
2. Remove the label: `gh issue edit <issue> --remove-label ready-for-agent`.
3. Return `STOPPED: <the question>` instead of your normal result.
