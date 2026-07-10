import { Schema } from "effect";
import { useEffect, useState } from "react";
import { Change, DiffError } from "../shared/change.ts";
import { DiffView } from "./diff-view.tsx";

// Sync decode boundary: the fetch handler below owns the try/catch.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);

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

  if (state.kind === "loading") {
    return <Notice>Loading diff…</Notice>;
  }
  if (state.kind === "error") {
    return <Notice>Could not load the diff: {state.message}</Notice>;
  }
  const { change } = state;
  if (change.patch === "") {
    return (
      <Notice>
        <code>{change.branch}</code> has no changes against{" "}
        <code>{change.defaultBranch}</code>.
      </Notice>
    );
  }
  return <DiffView patch={change.patch} />;
}
