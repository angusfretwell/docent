---
name: open-pr
description: Open pull requests in a consistent format. Use when opening or updating a PR, or when follow-up commits leave an open PR's title or body stale.
---

## Process

### 1. Establish the state

Check the working tree, the current branch, and whether the branch already has an open PR, to land in one of three states:

- **On the default branch** — create a branch for the work first.
- **On a branch, no PR** — you'll open one.
- **On a branch, PR exists** — you'll update it in place. If you're here because follow-up work landed rather than because the user asked, refresh only when the new commits make the title or body stale — scope, approach, or context they no longer explain.

Uncommitted changes are part of the work: commit them, in every state, before composing. Done when the work sits committed on a non-default branch and you know the base branch and whether a PR exists.

### 2. Read the branch

Study the branch as a whole — `git diff <base>...HEAD` and `git log <base>..HEAD` — to understand what changed, why, and the user-facing impact. Done when every commit on the branch is accounted for in your understanding.

### 3. Compose

Compose the title and description fresh from the branch you just read — whether the PR is new or already open — per the formats below. If the repo ships a PR template (e.g. `.github/pull_request_template.md`), its structure wins — apply the section guidance here within the template's sections.

When updating an existing PR, human-supplied material survives: carry over Evidence content and To-do items (including checkbox state), merging in new ones. Done when a title and every non-optional section are drafted.

### 4. Create or update

Push the branch, then create the PR or edit the existing one. On a new PR, edit the diff links in afterwards — they need the PR number, which only exists once the PR does. Mark the PR draft when work you know about still blocks review — otherwise ready; ask only if genuinely unsure. Done when the PR reflects the composed title and description and you've reported its URL.

## Title format

`<type>(<scope>): <subject>`, scope optional — Conventional Commits style.

- Name the **dominant change** of the whole branch, not the latest commit.
- Use the narrowest type and scope that stay accurate.
- Plain subject, no trailing period — free of bracketed labels and agent/tool attributions.
- The subject states a specific change; titles like "update", "cleanup", "misc", or "address feedback" name a process, not a change.

## Description template

<description-template>

1–2 sentence summary: what the PR does and why.

A reference to the issue(s) this PR closes (`Closes <id>`); omit this line when none applies.

### Overview

Strictly user-facing: what someone using the app sees or experiences differently. Refactors, component restructuring, and other implementation details belong in Changes. For purely internal PRs, keep it brief ("No user-facing changes."). If there's more than one user-facing theme, add a `####` subheading per theme with short prose under each.

### Changes

Grouped by unit of work — a `####` subheading per group with a short paragraph under each; a one-theme PR can be a single paragraph. Include the _why_ behind each change when the Overview doesn't make it obvious. Link files, symbols, and commits into the PR's diff so reviewers can jump straight to them — see link forms below.

### Evidence

Only material the session already produced — screenshots, recordings, test output. Omit the section when there's none.

### To-do

Non-obvious tasks needed to ship: other PRs, infra/config, migrations, env vars. Short checkbox bullets (`- [ ]`). Omit the section when there's nothing to call out — generic local-testing steps don't count.

</description-template>

## Diff links

Each link hangs off the PR's changes view, relative to the PR page (`./<pr-number>/changes`). When composing before the PR exists, write `PR` as a placeholder for the number; step 4 substitutes the real one.

- **A file** — `[expired.tsx](./123/changes#diff-<hash>)`. Label is the bare filename, no path. `<hash>` is the SHA-256 of the file's repo-relative path with no trailing newline: `printf '%s' "src/example-file.ts" | shasum -a 256`.
- **A symbol** (function, component, hook) — `[exampleFunction](./123/changes#diff-<hash>R24)`. The same file `<hash>`, then `R` and the symbol's line number in the new file (`L<line>` for a line that exists only in the old version). Label is the symbol name — JSX for components, e.g. `[<ExampleComponent />](./123/changes#diff-<hash>R12)`.
- **A commit** — `[1cf036f](./123/changes/<full-sha>)`. Label is the short SHA; the path takes the full 40-character SHA.
