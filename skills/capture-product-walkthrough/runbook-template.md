# The `.docent/capture.md` serving runbook

The runbook is the **fallback brief** the capture skill both reads (step 1, precedence rung 2) and authors (step 8, first run). It is **markdown, not a config schema** — prose setup instructions carried across capture sessions so later captures don't re-ask the human. It is **not the source of truth**: it is consulted only when the knowledge isn't discoverable from codebase context.

It lives at repo root: `.docent/capture.md` (an app-level property, not per-review — one app, one serving story).

## What it carries

Only what a capture needs and codebase context did not already answer:

- **Serving** — how the app is served: the command (if agent-launched) and the base URL / port.
- **Reaching a usable state** — login steps or test credentials, and any data seeding, needed before the flow under review is walkable.
- **Viewport default** — the app's stable capture viewport, `[width, height]` (overridable per-capture, so this is just the default).

Starting route is deliberately **absent** — it is a per-capture concern the skill resolves, never a runbook property.

## Template

```markdown
# Capture runbook

## Serving

- Base URL: http://localhost:5173
- Start command: `npm run dev` <!-- omit if the human runs the server themselves -->

## Reaching a usable state

- Log in at `/login` with `reviewer@example.test` / `password` (seeded dev account).
- Run `npm run seed` once to populate sample data.

## Viewport

- Default: 1280 x 800
```

Keep it terse and true. If a capture discovers the runbook is stale (a changed port, a broken login), update it in the same run.
