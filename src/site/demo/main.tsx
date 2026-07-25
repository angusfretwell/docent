import { setBackend } from "@client/api/backend";
import { basepath } from "@client/lib/basepath";
import { noop } from "radashi";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { replayHandler } from "./replay-handler";

const snapshotUrl = `${basepath}/demo-snapshot.json`;
const REPO_URL = "https://github.com/angusfretwell/docent";

async function fetchSnapshot(): Promise<unknown> {
  const response = await fetch(snapshotUrl);

  if (!response.ok) {
    throw new Error(`${snapshotUrl} responded ${response.status}`);
  }

  return await response.json();
}

/**
 * Inline styles rather than Tailwind classes: the client stylesheet's automatic
 * source detection scans `src/client`, so a utility class written here would
 * never be generated.
 */
const PAGE_STYLE: CSSProperties = {
  alignItems: "center",
  display: "flex",
  fontFamily: "var(--font-sans)",
  justifyContent: "center",
  minHeight: "100dvh",
  padding: "2rem",
};

const PANEL_STYLE: CSSProperties = {
  color: "var(--color-foreground)",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  maxWidth: "34rem",
};

const HEADING_STYLE: CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 600,
};

const BODY_STYLE: CSSProperties = {
  color: "var(--color-muted-foreground)",
  lineHeight: 1.6,
};

const COMMAND_STYLE: CSSProperties = {
  color: "var(--color-foreground)",
  fontFamily: "var(--font-mono)",
};

function MissingSnapshot() {
  return (
    <main style={PAGE_STYLE}>
      <div style={PANEL_STYLE}>
        <h1 style={HEADING_STYLE}>This demo could not load</h1>
        <p style={BODY_STYLE}>
          The review it replays is missing from this build. Try again later, or{" "}
          <a href={REPO_URL} style={COMMAND_STYLE}>
            run docent on a branch of your own
          </a>
          .
        </p>
      </div>
    </main>
  );
}

/**
 * Only a build that skipped the capture reaches this, so the fix belongs in the
 * console where a developer will see it; the page says something a visitor can
 * act on instead.
 */
function reportMissingSnapshot(cause: unknown): void {
  console.error(
    "The demo snapshot is missing or no longer matches the API contract. Record one with `bun run build:snapshot`, then rebuild with `bun run build:site`."
  );
  console.error(cause);

  const rootElement = document.querySelector("#root");

  if (rootElement === null) {
    return;
  }

  createRoot(rootElement).render(<MissingSnapshot />);
}

try {
  const replay = replayHandler(await fetchSnapshot(), { basepath });

  setBackend({
    fetch: (input, init) => replay(new Request(input, init)),
    // The demo watches nothing, so there is no stream to close.
    subscribe: () => noop,
  });

  // Dynamic: `@client/main` renders as it evaluates, so a static import would
  // hoist above `setBackend` and the client would boot against a real server.
  await import("@client/main");
} catch (error) {
  reportMissingSnapshot(error);
}
