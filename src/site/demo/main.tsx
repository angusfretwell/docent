import { setBackend } from "@client/api/backend";
import { basepath } from "@client/lib/basepath";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { replayHandler } from "./replay-handler";

const snapshotUrl = `${basepath}/demo-snapshot.json`;

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
        <h1 style={HEADING_STYLE}>This demo has no data</h1>
        <p style={BODY_STYLE}>
          The demo replays a recorded snapshot of a docent review, and this
          build is missing it. Record one with{" "}
          <code style={COMMAND_STYLE}>bun run capture:snapshot</code>, then
          rebuild with <code style={COMMAND_STYLE}>bun run build:site</code>.
        </p>
      </div>
    </main>
  );
}

function reportMissingSnapshot(cause: unknown): void {
  console.error(cause);

  const rootElement = document.querySelector("#root");

  if (rootElement === null) {
    return;
  }

  createRoot(rootElement).render(<MissingSnapshot />);
}

/** The demo watches nothing, so there is no stream to close. */
function unsubscribe(): void {
  return undefined;
}

try {
  const replay = replayHandler(await fetchSnapshot(), { basepath });

  setBackend({
    fetch: (input, init) => replay(new Request(input, init)),
    subscribe: () => unsubscribe,
  });

  // Dynamic: `@client/main` renders as it evaluates, so a static import would
  // hoist above `setBackend` and the client would boot against a real server.
  await import("@client/main");
} catch (error) {
  reportMissingSnapshot(error);
}
