# AGENTS.md

## Alpha

This project is released and may have external users, but it's alpha and breaking changes are still acceptable. Don't version schemas, write migrations, keep backwards-compatible shims, or deprecate gradually — change things in place. Stale local state (e.g. old `.docent/` records) can simply be deleted and re-minted. Call out user-visible breakage in the commit or PR description so it can reach the release notes.

## Libraries and tools

Don't trust your training data for any library, framework, SDK, API, or CLI tool; versions move and signatures change. Use `/find-docs` to fetch current documentation before writing code that uses one. This applies even to well-known libraries like React.

## Commands

```
bun run dev             # start dev server
bun run dev:website     # start the marketing website dev server (src/website)
bun run build           # create production build
bun run build:website   # build the marketing website to dist/website
bun run fix             # format and auto-fix linter errors
bun run typecheck       # run type checks
bun run test            # run tests
bun run preflight       # check, typecheck, test, and compile
```

## Local Effect Source

The Effect v4 repository is cloned to `.repos/effect` for reference by the `prepare:effect` script. Use this to explore APIs, find usage examples, and understand implementation details when the documentation isn't enough.

## Worktrees

Use worktrees when working on a branch. Worktrees are managed by /worktrunk which handles installing dependencies.

Run `/wt-switch-create <branch>` to create a branch and worktree and switch to it.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
