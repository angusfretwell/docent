import { themes, workerFactory } from "@client/lib/worker-factory";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { ReactNode } from "react";

/**
 * Hoisted to app root for a single long-lived worker pool. Mounted per-view it
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
