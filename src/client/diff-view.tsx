import type { CodeViewItem } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import { CodeView, WorkerPoolContextProvider } from "@pierre/diffs/react";

const themes = { dark: "github-dark", light: "github-light" } as const;

// One Shiki-tokenizing worker per hardware thread (capped). Tokenization must
// stay off the main thread: the #4 re-benchmark measured worker-off scroll at
// p95 225 ms with 15 long frames vs. zero with the pool on.
function workerFactory() {
  return new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), {
    type: "module",
  });
}

/**
 * The whole branch diff as one continuous virtualized cross-file scroll —
 * `CodeView`'s virtualizer is where the renderer's performance lives.
 */
export function DiffView({ patch }: { patch: string }) {
  const { files } = processPatch(patch);
  const items: CodeViewItem[] = files.map((fileDiff, i) => ({
    fileDiff,
    id: `${fileDiff.name}#${i}`,
    type: "diff" as const,
  }));

  return (
    <WorkerPoolContextProvider
      highlighterOptions={{ theme: themes, useTokenTransformer: true }}
      poolOptions={{
        poolSize: Math.min(8, navigator.hardwareConcurrency || 4),
        workerFactory,
      }}
    >
      <CodeView
        items={items}
        options={{ diffStyle: "unified", stickyHeaders: true, theme: themes }}
        // CodeView must be its own scroll container: its virtualizer reads
        // this element's scrollTop, not an ancestor's. An outer scrolling
        // wrapper breaks both scrolling and virtualization.
        style={{ height: "100vh", overflow: "auto" }}
      />
    </WorkerPoolContextProvider>
  );
}
