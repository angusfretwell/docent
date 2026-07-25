import { setBackend } from "@client/api/backend";
import { basepath } from "@client/lib/basepath";
import { noop } from "radashi";

import { replayHandler } from "./replay-handler";

const snapshotUrl = `${basepath}/demo-snapshot.json`;

const snapshot = await fetch(snapshotUrl);

// Only a local build that skipped the capture gets here — a deploy without the
// snapshot never assembles — so this reads as the console note it is.
if (!snapshot.ok) {
  throw new Error(
    `${snapshotUrl} responded ${snapshot.status}; record one with \`bun run build:snapshot\``
  );
}

const replay = replayHandler(await snapshot.json(), { basepath });

setBackend({
  fetch: (input, init) => replay(new Request(input, init)),
  // The demo watches nothing, so there is no stream to close.
  subscribe: () => noop,
});

// Dynamic: `@client/main` renders as it evaluates, so a static import would
// hoist above `setBackend` and the client would boot against a real server.
await import("@client/main");
