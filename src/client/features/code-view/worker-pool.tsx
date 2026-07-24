import { themes, workerFactory } from "@client/lib/worker-factory";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { ReactNode } from "react";

/**
 * Hoisted to app root so the Shiki worker pool is one long-lived instance. The
 * pierre library constructs the pool — and starts loading WASM + grammars —
 * when this provider first mounts, and terminates it when the last mount
 * unmounts. Kept here, it warms during the initial data fetch and survives
 * navigation between the Diff and Code-walkthrough views; mounted per-view it
 * would be torn down and cold-restarted on every switch, re-highlighting from
 * scratch (the unhighlighted-then-highlighted flicker) on arrival.
 */
export function CodeViewWorkerPool({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider
      poolOptions={{ workerFactory }}
      highlighterOptions={{
        langs: ["typescript", "javascript", "css", "html"],
        preferredHighlighter: "shiki-wasm",
        theme: themes,
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}
