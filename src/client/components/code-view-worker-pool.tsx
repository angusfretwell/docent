import { WorkerPoolContextProvider } from "@pierre/diffs/react";

import { themes, workerFactory } from "../lib/code-view";

/**
 * The shared `WorkerPoolContextProvider` config for every `CodeView` surface —
 * the Diff tab's cross-file scroll and the Code walkthrough's per-range
 * renderer both highlight through the same worker pool, sized to the
 * available cores (capped at 8) rather than each duplicating that rule.
 */
export function CodeViewWorkerPool({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkerPoolContextProvider
      highlighterOptions={{ theme: themes, useTokenTransformer: true }}
      poolOptions={{
        poolSize: Math.min(8, navigator.hardwareConcurrency || 4),
        workerFactory,
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}
