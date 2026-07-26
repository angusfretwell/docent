# The `.docent/capture.md` serving runbook

The runbook is what the run's preflight leaves behind and what the capture flow ([capture.md](capture.md)) reads as its setup. It is **markdown, not a config schema** — prose setup instructions carried across runs, written once while the human is present so later runs go unattended. Its existence is also the "we know how to drive the app" signal that lets a later preflight skip its one prompt.

It lives at repo root: `.docent/capture.md` (an app-level property, not per-review — one app, one serving story).

## What it carries

Only what a capture needs, and stated plainly enough that an agent with no human to ask can act on it:

- **Serving** — how the app is served: the command (if agent-launched) and the base URL / port.
- **Reaching a usable state** — login steps or test credentials, and any data seeding, needed before the flow under review is walkable.
- **Viewport default** — the app's stable capture viewport, `[width, height]` (overridable per-capture, so this is just the default).

Starting route is deliberately **absent** — routes are chosen per shot from the change under review, never a runbook property.

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

Keep it terse and true. A capture that finds it wrong (a changed port, a broken login) reports that as an obstacle and carries on rather than editing it: correcting the runbook happens where somebody can be asked what the truth is, which is the preflight, and the preflight rewrites it whenever it cannot reach the app at the base URL recorded here.
