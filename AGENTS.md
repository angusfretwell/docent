# AGENTS.md

## Libraries and tools

Don't trust your training data for any library, framework, SDK, API, or CLI tool; versions move and signatures change. Use `/find-docs` to fetch current documentation before writing code that uses one. This applies even to well-known libraries like React.

## Local Effect Source

The Effect v4 repository is cloned to `.repos/effect` for reference by `mise prepare-effect`. Use this to explore APIs, find usage examples, and understand implementation details when the documentation isn't enough.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
