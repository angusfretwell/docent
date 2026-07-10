import { Schema } from "effect";
import { useEffect, useState } from "react";
import { Change, DiffError } from "../shared/change.ts";
import { DossierSnapshot } from "../shared/dossier.ts";
import { DiffView } from "./diff-view.tsx";

// Sync decode boundary: the fetch handler below owns the try/catch.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);
const decodeSnapshot = Schema.decodeUnknownSync(DossierSnapshot);

/**
 * The live Dossier: fetched once, then re-fetched every time the server's SSE
 * stream reports a `.docent/` change. This is the agent-review loop's client
 * half — an external agent dropping a record file trips the watch, the server
 * pushes an event, and this hook re-reads the snapshot (architecture.md §2).
 *
 * The re-fetch lives directly in the effect (no data library): the linter's
 * React Query / React Compiler assumptions below don't apply to this app.
 */
function useLiveDossier(): DossierSnapshot | null {
  const [snapshot, setSnapshot] = useState<DossierSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refetch() {
      try {
        const res = await fetch("/api/dossier");
        if (res.ok && !cancelled) {
          // oxlint-disable-next-line react-compiler
          setSnapshot(decodeSnapshot(await res.json()));
        }
      } catch {
        // Best-effort: keep the last good snapshot until the next event.
      }
    }
    // oxlint-disable-next-line react-doctor/query-no-query-in-effect
    void refetch();
    const events = new EventSource("/api/events");
    // Coarse in v1: any change re-reads the whole snapshot.
    events.addEventListener("dossier-changed", () => void refetch());
    return () => {
      cancelled = true;
      events.close();
    };
  }, []);

  return snapshot;
}

// Fixed pill over the diff; hoisted so it isn't rebuilt on every render.
const statusStyle: React.CSSProperties = {
  background: "rgba(128,128,128,0.12)",
  borderRadius: "0 0 0 0.5rem",
  fontSize: "0.75rem",
  opacity: 0.75,
  padding: "0.3rem 0.6rem",
  position: "fixed",
  right: 0,
  top: 0,
  zIndex: 10,
};

/**
 * A live status pill proving the watch → SSE → re-fetch loop end to end. Floats
 * over the diff (fixed) so it never disturbs `CodeView`'s scroll container.
 */
function DossierStatus({ dossier }: { dossier: DossierSnapshot }) {
  return (
    <div style={statusStyle}>
      <code>{dossier.dossier.branch}</code> · {dossier.changes.length} changes ·{" "}
      {dossier.findings.length} findings · {dossier.walkthroughs.length} walkthroughs
    </div>
  );
}

function failureMessage(body: unknown, status: number): string {
  try {
    return decodeDiffError(body).error;
  } catch {
    return `HTTP ${status}`;
  }
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; change: Change };

function Notice({ children }: { children: React.ReactNode }) {
  return <p style={{ opacity: 0.7, padding: "1rem" }}>{children}</p>;
}

export function App() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const dossier = useLiveDossier();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/diff");
        const body: unknown = await res.json();
        if (!res.ok) {
          throw new Error(failureMessage(body, res.status));
        }
        const change = decodeChange(body);
        if (!cancelled) {
          setState({ change, kind: "loaded" });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const live = dossier ? <DossierStatus dossier={dossier} /> : null;

  if (state.kind === "loading") {
    return (
      <>
        {live}
        <Notice>Loading diff…</Notice>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        {live}
        <Notice>Could not load the diff: {state.message}</Notice>
      </>
    );
  }
  const { change } = state;
  if (change.patch === "") {
    return (
      <>
        {live}
        <Notice>
          <code>{change.branch}</code> has no changes against <code>{change.defaultBranch}</code>.
        </Notice>
      </>
    );
  }
  return (
    <>
      {live}
      <DiffView patch={change.patch} />
    </>
  );
}
