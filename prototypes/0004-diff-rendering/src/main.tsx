import type { CodeViewItem } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import { CodeView, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const params = new URLSearchParams(location.search);
const fixture = params.get("fixture") ?? "three";
const useWorker = params.get("worker") !== "0";
const diffStyle = (params.get("style") as "unified" | "split") ?? "unified";
const annotate = params.get("annotate") === "1";

const themes = { dark: "github-dark", light: "github-light" } as const;

// One Shiki-tokenizing worker per hardware thread (capped). This is the
// "high-performance" path — tokenization runs off the main thread.
function workerFactory() {
  return new Worker(
    new URL("@pierre/diffs/worker/worker.js", import.meta.url),
    {
      type: "module",
    }
  );
}

declare global {
  interface Window {
    __meta: Record<string, unknown>;
  }
}

function View({ items }: { items: CodeViewItem[] }) {
  const view = (
    <CodeView
      disableWorkerPool={!useWorker}
      items={items}
      // theme + diffStyle are core render options; layout keeps a sticky header.
      options={{ diffStyle, stickyHeaders: true, theme: themes } as never}
      renderAnnotation={
        annotate
          ? (a) => (
              <div
                style={{
                  background: "#fff7d6",
                  borderLeft: "3px solid #e2b53d",
                  font: "13px ui-sans-serif, system-ui, sans-serif",
                  padding: "6px 10px",
                }}
              >
                💬 sample comment ({"side" in a ? a.side : "?"} line{" "}
                {"lineNumber" in a ? a.lineNumber : "?"})
              </div>
            )
          : undefined
      }
      // CodeView must be its own scroll container: its virtualizer reads this
      // element's scrollTop, not an ancestor's. Scrolling a parent wrapper
      // instead leaves the virtualizer stuck on the first viewport.
      style={{ height: "100vh", overflow: "auto" }}
    />
  );

  if (!useWorker) {
    return view;
  }
  return (
    <WorkerPoolContextProvider
      highlighterOptions={{ theme: themes, useTokenTransformer: true }}
      poolOptions={{
        poolSize: Math.min(8, navigator.hardwareConcurrency || 4),
        workerFactory,
      }}
    >
      {view}
    </WorkerPoolContextProvider>
  );
}

function App() {
  const [patch, setPatch] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/fixtures/${fixture}.diff`)
      .then((r) => r.text())
      .then(setPatch);
  }, []);

  const items = useMemo<CodeViewItem[] | null>(() => {
    if (patch == null) {
      return null;
    }
    const parsed = processPatch(patch);
    const files = parsed.files;
    // A couple of demo comment annotations on the first file, opt-in.
    const built: CodeViewItem[] = files.map((fileDiff, i) => ({
      annotations:
        annotate && i === 0
          ? [
              { lineNumber: 8, side: "deletions" as const },
              { lineNumber: 15, side: "deletions" as const },
            ]
          : undefined,
      fileDiff,
      id: `${fileDiff.name}#${i}`,
      type: "diff" as const,
    }));
    window.__meta = {
      annotate,
      diffLines: files.reduce(
        (n, f) =>
          n + (diffStyle === "split" ? f.splitLineCount : f.unifiedLineCount),
        0
      ),
      diffStyle,
      fileCount: files.length,
      fixture,
      t0: performance.now(),
      totalLines: patch.split("\n").length,
      worker: useWorker,
    };
    return built;
  }, [patch]);

  if (items == null) {
    return null;
  }
  return (
    <div id="scroll" style={{ height: "100vh", overflow: "hidden" }}>
      <View items={items} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
