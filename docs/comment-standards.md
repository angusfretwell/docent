# Comment Standards

Default to zero comments. Names, types, and structure carry the meaning; when something is unclear, rename or extract before reaching for a comment. A comment earns its place only by stating something the code _cannot_ say.

**The deletion test:** imagine the comment gone. If the code loses nothing, don't write it. If something is lost, first try moving it into a name or type; comment only what's left over.

## Never write these

The common failure mode is narrating your work instead of documenting the code. Delete on sight:

- **Narration** — restating what the next line does: `// fetch the user`, `// return early if empty`.
- **Section headers** — `// --- helpers ---`, `// Step 2: validate`. Extract a named function instead.
- **Process commentary** — talking to the reviewer, not the next reader: `// changed to use the new API`, `// this is safe because we validated above`, `// as requested`. That belongs in the commit message or PR description, never in the code.
- **Signature echoes** — JSDoc that restates the types: `@param userId - the user's id`.
- **Obvious summaries** — a doc comment saying what the name already says: `/** Formats a date. */` on `formatDate`.

```typescript
// BAD: every comment restates the code or narrates the session
/**
 * Gets the review for a branch.
 * @param branch - the branch name
 */
export function reviewForBranch(branch: string) {
  // look up the record
  const record = store.get(branch);
  // return null when missing (changed from throwing)
  if (!record) return null;
  return record.review;
}

// GOOD: the code already says all of this
export function reviewForBranch(branch: string) {
  const record = store.get(branch);
  if (!record) return null;
  return record.review;
}
```

Many inline comments in one function is a decomposition smell — split it into named pieces rather than annotating the steps.

## When a comment earns its place

- A workaround for an external quirk (library bug, API oddity) — say what breaks without it.
- A domain rule or invariant the types can't express.
- A non-obvious constraint: ordering, concurrency, performance, security.
- A deliberate choice that looks wrong without context — say why the obvious alternative fails.

```typescript
// GOOD: states a constraint the code can't show
/** bun:sqlite returns BLOBs as Buffer but node returns Uint8Array — normalize before hashing. */

// GOOD: the obvious alternative was tried and fails
/** Polling, not fs.watch: watchers drop events on network volumes. */
```

## Format

- JSDoc, at the function/export level. Inline comments are a last resort.
- Use `@param`/`@returns`/`@throws`/`@example`/`@deprecated` only when they add information beyond the signature.
- Don't re-explain what an ADR or doc records — reference it with `@see <path|url>`.
- No references that go stale: PR numbers, issue IDs, "new", "temporary", "recently".
