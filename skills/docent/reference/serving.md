# Serving the app under review

Everything the run needs about how this app is served: the shape of the `.docent/capture.md` runbook the preflight writes, how to read the capture gate's JSON, and what to do when the gate does not pass. Its one reader is the orchestrator taking [SKILL.md](../SKILL.md)'s §1.

## The `.docent/capture.md` runbook

The runbook is what the preflight leaves behind and what the capture flow ([capture.md](capture.md)) reads as its setup. It is **markdown, not a config schema** — prose setup instructions carried across runs, written once while the human is present so later runs go unattended. Its existence is also the "we know how to drive the app" signal that lets a later preflight skip its one prompt.

It lives at repo root: `.docent/capture.md` (an app-level property, not per-review — one app, one serving story).

### What it carries

Only what a capture needs, and stated plainly enough that an agent with no human to ask can act on it:

- **Serving** — how the app is served: the command (if agent-launched) and the base URL / port.
- **Reaching a usable state** — login steps or test credentials, and any data seeding, needed before the flow under review is walkable.
- **Viewport default** — the app's stable capture viewport, `[width, height]`. `1280 x 1280` unless the repo says otherwise: it is never asked for, and a shot needing a different frame overrides it per-capture.

Starting route is deliberately **absent** — routes are chosen per shot from the change under review, never a runbook property.

### Template

```markdown
# Capture runbook

## Serving

- Base URL: http://localhost:5173
- Start command: `npm run dev` <!-- omit if the human runs the server themselves -->

## Reaching a usable state

- Log in at `/login` with `reviewer@example.test` / `password` (seeded dev account).
- Run `npm run seed` once to populate sample data.

## Viewport

- Default: 1280 x 1280
```

Keep it terse and true.

## Reading the gate

- **`detail` is why each failing check failed**, written to be read aloud — it is what §3's narration relays for a browser it could not get.
- **`url: up` is deliberately lenient: any HTTP status counts.** A 404 or a 500 still means a server answered, and only a refused connection is not-up — a client-rendered app answers with an empty shell either way. Whether the page is any good is settled by §5's executor, which reads the page back before it captures ([capture.md](capture.md), "Reach the app").

## When the gate does not pass

Work up from the cheapest cause — the ordinary one is a dev server that is simply not running, with the runbook telling the truth:

- **First, start what the runbook says to start.** Where it records a **Start command**, run it in the human's session and take the gate again — it polls, so one immediate re-take is the answer. Start what the runbook records and nothing else: never a command you inferred, a port you picked, or a second server beside one already running. The server it brings up stays up and is what §5's capture consumes.
- **Then ask.** Where there is no start command, or the app is still not there, ask the human what changed (§1 step 1) — and rewrite `.docent/capture.md` (step 2) **only where what they say differs from what it records**. Then check again.
- **A base URL the human confirms is still right with nothing answering on it is a dev server that is down.** Say that, and leave the runbook alone — overwriting a correct file loses a working setup.
- **A missing browser has its own rung, and the runbook is not on it.** `browser: missing` is about this machine. Say you are running the install — it is slow and silent — then take the gate again, and only where that fails relay its `detail` and go on. Never rewrite the runbook over a browser problem.

  ```bash
  npx -y agent-browser@latest install
  ```
