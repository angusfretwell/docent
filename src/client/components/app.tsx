import {
  latestCodeWalkthrough,
  latestProductWalkthrough,
} from "@shared/lib/walkthrough";
import { Change, DiffError } from "@shared/schemas/change";
import type { FindingWrite } from "@shared/schemas/finding-write";
import type { PendingRange } from "@shared/schemas/pending";
import { Pending } from "@shared/schemas/pending";
import { ReviewSnapshot } from "@shared/schemas/review";
import type {
  FindingEntry,
  ViewedEvent,
  WalkthroughEntry,
} from "@shared/schemas/review";
import { Schema } from "effect";
import { useEffect, useRef, useState } from "react";

import {
  fetchPendingExpandedFileDiff,
  isPendingExpandable,
} from "../lib/blobs";
import type { DriftResult } from "../lib/drift";
import { useDrift } from "../lib/drift";
import { writeFinding } from "../lib/findings-client";
import type { DiffViewHandle } from "./diff-view";
import { DiffView } from "./diff-view";
import { FindingsPanel } from "./findings-panel";
import { ProductWalkthroughView } from "./product-walkthrough-view";
import { WalkthroughView } from "./walkthrough-view";

// Append a Finding record. The write lands a file in `.docent/`, which trips the
// server's watch → SSE push → snapshot re-fetch, so the new record renders
// itself; the caller just awaits the POST.
async function handleWrite(write: FindingWrite): Promise<void> {
  await writeFinding(write);
}

// Stable empties so the pre-snapshot render doesn't churn DiffView's effects.
const NO_VIEWED: readonly ViewedEvent[] = [];
const NO_FINDINGS: readonly FindingEntry[] = [];
const NO_WALKTHROUGHS: readonly WalkthroughEntry[] = [];

// Sync decode boundary: the fetch handlers below own the try/catch.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);
const decodeSnapshot = Schema.decodeUnknownSync(ReviewSnapshot);
const decodePending = Schema.decodeUnknownSync(Pending);

// Which selector entry is showing: the committed Change, or the read-only
// Pending working-tree preview.
type Selection = "change" | "pending";

// The tab / view mode (walkthroughs.md §1). Each is its own self-contained
// surface over the same Change: the Diff tab, the Code walkthrough tab, and the
// Product walkthrough tab (#15).
type Tab = "diff" | "walkthrough" | "product";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; change: Change };

function failureMessage(body: unknown, status: number): string {
  try {
    return decodeDiffError(body).error;
  } catch {
    return `HTTP ${status}`;
  }
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
function ReviewStatus({ review }: { review: ReviewSnapshot }) {
  return (
    <div style={statusStyle}>
      <code>{review.review.branch}</code> · {review.changes.length} changes ·{" "}
      {review.findings.length} findings · {review.walkthroughs.length}{" "}
      walkthroughs
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p style={{ opacity: 0.7, padding: "1rem" }}>{children}</p>;
}

const tabBarStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(128,128,128,0.25)",
  display: "flex",
  gap: "0.25rem",
  padding: "0.3rem 0.6rem 0",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid #4c8dff" : "2px solid transparent",
    color: "inherit",
    cursor: "pointer",
    font: "inherit",
    fontSize: "0.9rem",
    opacity: active ? 1 : 0.7,
    padding: "0.4rem 0.7rem",
  };
}

/** The view-mode tabs (walkthroughs.md §1). Each tab is its own self-contained surface. */
function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <div style={tabBarStyle}>
      <button
        aria-pressed={tab === "diff"}
        onClick={() => onTab("diff")}
        style={tabStyle(tab === "diff")}
        type="button"
      >
        Diff
      </button>
      <button
        aria-pressed={tab === "walkthrough"}
        onClick={() => onTab("walkthrough")}
        style={tabStyle(tab === "walkthrough")}
        type="button"
      >
        Code walkthrough
      </button>
      <button
        aria-pressed={tab === "product"}
        onClick={() => onTab("product")}
        style={tabStyle(tab === "product")}
        type="button"
      >
        Product walkthrough
      </button>
    </div>
  );
}

const barStyle: React.CSSProperties = {
  alignItems: "center",
  borderBottom: "1px solid rgba(128,128,128,0.25)",
  display: "flex",
  flexWrap: "wrap",
  fontSize: "0.85rem",
  gap: "0.5rem",
  padding: "0.4rem 0.6rem",
};

function entryStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(56,139,253,0.18)" : "transparent",
    border: "1px solid rgba(128,128,128,0.35)",
    borderRadius: "0.25rem",
    color: "inherit",
    cursor: "pointer",
    font: "inherit",
    padding: "0.2rem 0.6rem",
  };
}

/**
 * The Change selector. In this slice it carries the committed Change plus — when
 * the working tree is dirty — the read-only **Pending** entry at the top, with a
 * dirty badge (diff-review.md §6). Pending auto-surfaces here when dirty and
 * auto-hides when clean; selecting it exposes the incremental/cumulative range
 * toggle. A preview surface: mark-as-viewed applies (keyed on content SHAs),
 * but no Finding authoring.
 */
function ChangeSelector({
  branch,
  dirty,
  selected,
  range,
  onSelect,
  onRange,
}: {
  branch: string;
  dirty: boolean;
  selected: Selection;
  range: PendingRange;
  onSelect: (selection: Selection) => void;
  onRange: (range: PendingRange) => void;
}) {
  return (
    <div style={barStyle}>
      {dirty && (
        <button
          aria-pressed={selected === "pending"}
          onClick={() => onSelect("pending")}
          style={entryStyle(selected === "pending")}
          type="button"
        >
          Pending
          <span
            aria-hidden="true"
            style={{ color: "#d29922", marginLeft: "0.4rem" }}
          >
            ●
          </span>
        </button>
      )}
      <button
        aria-pressed={selected === "change"}
        onClick={() => onSelect("change")}
        style={entryStyle(selected === "change")}
        type="button"
      >
        <code>{branch}</code>
      </button>
      {selected === "pending" && (
        <>
          <span style={{ marginLeft: "0.4rem", opacity: 0.6 }}>Range:</span>
          <button
            aria-pressed={range === "incremental"}
            onClick={() => onRange("incremental")}
            style={entryStyle(range === "incremental")}
            type="button"
          >
            Incremental
          </button>
          <button
            aria-pressed={range === "cumulative"}
            onClick={() => onRange("cumulative")}
            style={entryStyle(range === "cumulative")}
            type="button"
          >
            Cumulative
          </button>
          <span style={{ marginLeft: "0.4rem", opacity: 0.6 }}>
            Read-only preview
          </span>
        </>
      )}
    </div>
  );
}

/**
 * The committed-Change body: loading / error / empty / the rendered diff. The
 * Review's viewed events and findings fold into the diff here; Pending folds the
 * same viewed events (content-SHA keyed) but renders no findings.
 */
function ChangeBody({
  state,
  review,
  diffRef,
  drift,
}: {
  state: LoadState;
  review: ReviewSnapshot | null;
  diffRef: React.Ref<DiffViewHandle>;
  drift: ReadonlyMap<string, DriftResult>;
}) {
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
  return (
    <DiffView
      drift={drift}
      findings={review?.findings ?? NO_FINDINGS}
      generated={change.generated}
      onWrite={handleWrite}
      patch={change.patch}
      ref={diffRef}
      viewed={review?.viewed ?? NO_VIEWED}
    />
  );
}

/**
 * The Pending body: the working-tree preview, with worktree-sourced expansion.
 * Mark-as-viewed applies here (diff-review.md §6) — the Review's viewed events
 * fold in, keyed on the working file's full content SHA, so a mark set on
 * Pending carries into the minted Change once the bytes commit unchanged.
 * Findings still don't render inline (Pending authors none).
 */
function PendingBody({
  pending,
  review,
  diffRef,
}: {
  pending: Pending;
  review: ReviewSnapshot | null;
  diffRef: React.Ref<DiffViewHandle>;
}) {
  if (pending.patch === "") {
    return <Notice>The working tree is clean — nothing pending.</Notice>;
  }
  return (
    <DiffView
      expandFile={fetchPendingExpandedFileDiff}
      findings={NO_FINDINGS}
      isFileExpandable={isPendingExpandable}
      patch={pending.patch}
      ref={diffRef}
      viewed={review?.viewed ?? NO_VIEWED}
    />
  );
}

/**
 * The Diff tab: the Change/Pending selector over the diff surface. The global
 * Findings panel is mounted by `App` beside every tab, so it isn't rendered
 * here. Split out so `App` picks a tab without carrying the diff surface's own
 * derivations (dirty/effective/branch).
 */
function DiffTab({
  change,
  pending,
  review,
  drift,
  diffRef,
  selected,
  range,
  onSelect,
  onRange,
}: {
  change: LoadState;
  pending: Pending | null;
  review: ReviewSnapshot | null;
  drift: ReadonlyMap<string, DriftResult>;
  diffRef: React.RefObject<DiffViewHandle | null>;
  selected: Selection;
  range: PendingRange;
  onSelect: (selection: Selection) => void;
  onRange: (range: PendingRange) => void;
}) {
  const dirty = pending?.dirty ?? false;
  const effective: Selection =
    selected === "pending" && dirty ? "pending" : "change";
  const branch =
    pending?.branch ?? (change.kind === "loaded" ? change.change.branch : "…");

  return (
    <>
      <ChangeSelector
        branch={branch}
        dirty={dirty}
        onRange={onRange}
        onSelect={onSelect}
        range={range}
        selected={effective}
      />
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {effective === "pending" && pending ? (
          <PendingBody diffRef={diffRef} pending={pending} review={review} />
        ) : (
          <ChangeBody
            diffRef={diffRef}
            review={review}
            drift={drift}
            state={change}
          />
        )}
      </div>
    </>
  );
}

/** The Code walkthrough tab, or a prompt to author one when none exists. */
function WalkthroughTab({
  review,
  patch,
  onOpenInDiff,
}: {
  review: ReviewSnapshot | null;
  patch: string;
  onOpenInDiff: (file: string, line: number, side: "base" | "head") => void;
}) {
  const walkthrough = latestCodeWalkthrough(review?.walkthroughs ?? []);
  if (!(walkthrough && review)) {
    return <Notice>No code walkthrough yet. Run /docent to author one.</Notice>;
  }
  return (
    <WalkthroughView
      changes={review.changes}
      findings={review.findings}
      onOpenInDiff={onOpenInDiff}
      patch={patch}
      walkthrough={walkthrough}
      walkthroughs={review.walkthroughs}
    />
  );
}

/** The Product walkthrough tab, or a prompt to author one when none exists. */
function ProductWalkthroughTab({ review }: { review: ReviewSnapshot | null }) {
  const walkthrough = latestProductWalkthrough(review?.walkthroughs ?? []);
  if (!(walkthrough && review)) {
    return (
      <Notice>No product walkthrough yet. Run /docent to author one.</Notice>
    );
  }
  return (
    <ProductWalkthroughView
      changes={review.changes}
      findings={review.findings}
      walkthrough={walkthrough}
      walkthroughs={review.walkthroughs}
    />
  );
}

export function App() {
  const [change, setChange] = useState<LoadState>({ kind: "loading" });
  const [pending, setPending] = useState<Pending | null>(null);
  const [review, setReview] = useState<ReviewSnapshot | null>(null);
  const [selected, setSelected] = useState<Selection>("change");
  const [range, setRange] = useState<PendingRange>("incremental");
  const [tab, setTab] = useState<Tab>("diff");
  // A one-shot Diff deep-link from the walkthrough tab: switch to Diff, then
  // scroll to the range's file/line once DiffView has mounted (walkthroughs.md §1).
  const [pendingJump, setPendingJump] = useState<{
    file: string;
    line: number;
    side: "base" | "head";
  } | null>(null);
  const diffRef = useRef<DiffViewHandle>(null);

  // One live loop for the whole tab: fetch the Change, the Pending preview (at
  // the current range), and the review once, then re-fetch all three on every
  // SSE change event — an agent editing the working tree pushes a coarse event
  // and Pending refreshes live (architecture.md §2). Re-runs when the range
  // toggles, which reloads Pending for the new range.
  useEffect(() => {
    let cancelled = false;
    async function loadChange() {
      try {
        const res = await fetch("/api/diff");
        const body: unknown = await res.json();
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          throw new Error(failureMessage(body, res.status));
        }
        // oxlint-disable-next-line react-compiler
        setChange({ change: decodeChange(body), kind: "loaded" });
      } catch (error) {
        if (!cancelled) {
          // oxlint-disable-next-line react-compiler
          setChange({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    // Best-effort read: on any failure keep the last good value until the next
    // event, so a transient error never blanks the Pending preview or review.
    async function loadBestEffort<T>(
      url: string,
      decode: (value: unknown) => T,
      apply: (value: T) => void
    ) {
      try {
        const res = await fetch(url);
        if (res.ok && !cancelled) {
          apply(decode(await res.json()));
        }
      } catch {
        // Ignored by design (see above).
      }
    }
    function loadPending() {
      // oxlint-disable-next-line react-compiler
      return loadBestEffort(
        `/api/pending?range=${range}`,
        decodePending,
        setPending
      );
    }
    function loadReview() {
      // oxlint-disable-next-line react-compiler
      return loadBestEffort("/api/review", decodeSnapshot, setReview);
    }
    function refetchAll() {
      void loadChange();
      void loadPending();
      void loadReview();
    }
    // oxlint-disable-next-line react-doctor/query-no-query-in-effect
    refetchAll();
    const events = new EventSource("/api/events");
    events.addEventListener("review-changed", refetchAll);
    return () => {
      cancelled = true;
      events.close();
    };
  }, [range]);

  // Drift is judged against the committed Change (Pending carries no Findings),
  // computed lazily from each Finding's born anchor (data-model.md §6). The map
  // feeds both the panel's (drift × resolved) badges and the inline diff's
  // shifted re-anchoring.
  const drift = useDrift({
    findings: review?.findings ?? NO_FINDINGS,
    patch: change.kind === "loaded" ? change.change.patch : "",
    walkthroughs: review?.walkthroughs ?? NO_WALKTHROUGHS,
  });

  // The deep-link loop: a walkthrough range or a Findings-panel row (the panel is
  // global, so the click can come from any tab) opens the Diff tab at its
  // file/line. Switching to Diff mounts DiffView; the effect then scrolls once
  // DiffView's imperative handle is live, given a frame for the renderer to lay
  // out, and clears the one-shot request. When Diff is already active the tab set
  // is a no-op and the same effect still scrolls.
  function openInDiff(file: string, line: number, side: "base" | "head") {
    setTab("diff");
    setPendingJump({ file, line, side });
  }
  useEffect(() => {
    if (tab !== "diff" || pendingJump === null) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      diffRef.current?.scrollToLine(
        pendingJump.file,
        pendingJump.line,
        pendingJump.side
      );
      setPendingJump(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, pendingJump]);

  const patch = change.kind === "loaded" ? change.change.patch : "";

  let body: React.ReactNode;
  if (tab === "walkthrough") {
    body = (
      <WalkthroughTab review={review} onOpenInDiff={openInDiff} patch={patch} />
    );
  } else if (tab === "product") {
    body = <ProductWalkthroughTab review={review} />;
  } else {
    body = (
      <DiffTab
        change={change}
        diffRef={diffRef}
        review={review}
        drift={drift}
        onRange={setRange}
        onSelect={setSelected}
        pending={pending}
        range={range}
        selected={selected}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {review ? <ReviewStatus review={review} /> : null}
      <TabBar onTab={setTab} tab={tab} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {body}
        </div>
        {review ? (
          <FindingsPanel
            drift={drift}
            findings={review.findings}
            onJump={(file, line) => openInDiff(file, line, "head")}
            onWrite={handleWrite}
          />
        ) : null}
      </div>
    </div>
  );
}
