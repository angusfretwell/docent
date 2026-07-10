# Testing — testable-by-inertness

This document specifies docent's test strategy. It follows from the app being **inert** ([architecture.md](architecture.md), [#2](https://github.com/angusfretwell/docent/issues/2)): docent is a renderer over `.docent/` plus a skills catalogue, so the only genuinely hard-to-test surface is business logic that is partly an LLM following prose. The whole strategy leans on **filesystem-is-the-interface** ([#2](https://github.com/angusfretwell/docent/issues/2), [#1](https://github.com/angusfretwell/docent/issues/1)): the agent's only interface is files, so its _mechanics_ can be simulated by writing the files it would produce, and only its _judgment_ is left to humans.

## The seam — a skill over a tested engine

A skill = **an agentskills.io `SKILL.md` (orchestration + agent judgment) over `docent` CLI subcommands (a tested engine)**. Every mechanical step — capture, assemble a walkthrough manifest, compute drift, fold a comment thread, write a schema-valid file — is a committed module exposed as a `docent` subcommand the skill shells out to, **never reimprovised in prose**. The same binary that _serves_ the UI also exposes this CLI ([architecture.md §5](architecture.md), [#21](https://github.com/angusfretwell/docent/issues/21)).

Design rule with teeth: **a skill that does mechanical work in prose is a skill you can't test.** The skills catalogue and its CLI contract are owned by [agent-integration.md](agent-integration.md) ([#21](https://github.com/angusfretwell/docent/issues/21)).

## The oracle — `docent validate`

`docent validate` runs the `shared/` zod schemas against any `.docent/` tree — the **same validator the runtime uses** ([architecture.md §3](architecture.md), [#2](https://github.com/angusfretwell/docent/issues/2)). **One schema module, four consumers:** runtime, CLI, tests, and nuqs URL params ([architecture.md §1](architecture.md), [#1](https://github.com/angusfretwell/docent/issues/1)). Tests gate on it.

## Fixtures — engine-generated + snapshotted

Fixtures are **hybrid**: built by running the real subcommands once, then committed, so they're schema-valid by construction and regenerate via a task (which doubles as a smoke test of the engine).

- **Blob/git state comes from content-addressed blob stores** (`blobs/<sha>`, served through the `GET /api/blob/:sha` seam) — _not_ bundled git repos. `blobSha` is opaque content identity, so no live `git cat-file` is needed in tests ([architecture.md §2](architecture.md), [#31](https://github.com/angusfretwell/docent/issues/31)).
- **Hand-authored minimal cases** for the tricky states — drift `shifted` / `outdated`, multi-round threads, a detached thread ([data-model.md](data-model.md)).
- **A couple of captured real-PR fixtures** reuse [#4](https://github.com/angusfretwell/docent/issues/4)'s real 178-/319-file diffs for scale and perf.

One shared `fixtures/` directory serves every tier.

## Tiers — all deterministic and gating

1. **unit** — `bun test` over pure functions (drift re-anchoring, manifest fold, anchor resolution).
2. **contract** — `docent validate` over the fixtures, plus a write→validate round-trip.
3. **skill↔CLI conformance lint** — parse each `SKILL.md` and assert every referenced `docent` subcommand/flag actually exists. Catches skill/engine drift **with no agent in the loop**.
4. **served E2E — Playwright** boots the real Bun server against a fixture `.docent/` and drives the real browser, so the vendor components run for real, not mocked: the `@pierre/diffs` worker pool + virtualizer ([#4](https://github.com/angusfretwell/docent/issues/4)) and rrweb replay ([#5](https://github.com/angusfretwell/docent/issues/5)).

`bun test` is the **only** non-DOM runner (no Vitest). Component tests stay minimal (badges, thread rows, drift × resolved cells).

## The agent is simulated by file writes

In tier 4, Playwright writes the file a skill would produce **directly into the fixture `.docent/` mid-test** and asserts the SSE-driven live update — the agent-review loop end-to-end with **no live agent**. This is exactly the watch → SSE → refetch loop proven in the [#6](https://github.com/angusfretwell/docent/issues/6) prototype ([architecture.md §2](architecture.md)).

## No live-agent tier in CI

Skill executability and authoring quality are a **human** concern, backstopped by tier 3's conformance lint. **Rejected:** a nightly Claude-Code-headless eval (executability via the schema oracle + LLM-judged quality) — deliberately trading automated proof-of-good-authoring for a fast, deterministic, agent-free suite.

## Why this is worth pinning

A future reader will ask why there's a CLI _inside_ the server binary, why skills shell out to it, and why an **agent-first** tool's test suite never runs an agent. The answer is **testable-by-inertness**: filesystem-is-the-interface lets us simulate the agent with files and validate its output against one schema, so the engine is deterministic-testable and the LLM stays out of CI. The live alternatives — skill logic in prose, and a live-agent eval tier — were rejected on purpose.
