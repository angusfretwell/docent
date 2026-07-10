import { useEffect, useState } from "react";
import type { RepoDiff } from "../shared/diff.ts";
import { DiffView } from "./diff-view.tsx";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; diff: RepoDiff };

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
        const body = (await res.json()) as RepoDiff & { error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setState({ diff: body, kind: "loaded" });
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
  const { diff } = state;
  if (diff.patch === "") {
    return (
      <Notice>
        <code>{diff.branch}</code> has no changes against{" "}
        <code>{diff.defaultBranch}</code>.
      </Notice>
    );
  }
  return <DiffView patch={diff.patch} />;
}
