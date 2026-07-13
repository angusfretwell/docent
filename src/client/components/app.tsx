import {
  latestCodeWalkthrough,
  latestProductWalkthrough,
} from "@shared/lib/identity-drift";
import type { FindingWrite } from "@shared/schemas/finding-write";
import type { Pending, PendingRange } from "@shared/schemas/pending";
import type {
  FindingEntry,
  ReviewSnapshot,
  ViewedEvent,
  WalkthroughEntry,
} from "@shared/schemas/review";
import { useRef, useState } from "react";

import { fetchPendingExpandedFileDiff } from "../data/blobs";
import type { LoadState } from "../data/review";
import { useReviewData, useReviewStream } from "../data/review";
import { useDiffDeepLink } from "../hooks/use-diff-deep-link";
import { isPendingExpandable } from "../lib/blobs";
import type { DriftResult } from "../lib/drift";
import { useDrift } from "../lib/drift";
import { writeFinding } from "../lib/findings-client";
import { cn } from "../lib/utils";
import type { Selection, Tab } from "../url/params";
import { useRangeParam, useTabParam, useViewParam } from "../url/params";
import type { DiffViewHandle } from "./diff-view";
import { DiffView } from "./diff-view";
import { ErrorBoundary } from "./error-boundary";
import { FindingsPanel } from "./findings-panel";
import { ProductWalkthroughView } from "./product-walkthrough-view";
import type { OpenInDiff } from "./walkthrough-view";
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

/**
 * A live status pill proving the watch → SSE → re-fetch loop end to end. Floats
 * over the diff (fixed) so it never disturbs `CodeView`'s scroll container.
 */
function ReviewStatus({ review }: { review: ReviewSnapshot }) {
  return (
    <div className="fixed top-0 right-0 z-10 rounded-bl-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      <code>{review.review.branch}</code> · {review.changes.length} changes ·{" "}
      {review.findings.length} findings · {review.walkthroughs.length}{" "}
      walkthroughs
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-muted-foreground">{children}</p>;
}

function tabClass(active: boolean): string {
  return cn(
    "cursor-pointer border-b-2 border-transparent px-3 py-1.5 text-[0.9rem]",
    active ? "border-b-info" : "text-muted-foreground"
  );
}

/** The view-mode tabs (walkthroughs.md §1). Each tab is its own self-contained surface. */
function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <div className="flex gap-1 border-b px-2.5 pt-1">
      <button
        aria-pressed={tab === "diff"}
        className={tabClass(tab === "diff")}
        onClick={() => onTab("diff")}
        type="button"
      >
        Diff
      </button>
      <button
        aria-pressed={tab === "walkthrough"}
        className={tabClass(tab === "walkthrough")}
        onClick={() => onTab("walkthrough")}
        type="button"
      >
        Code walkthrough
      </button>
      <button
        aria-pressed={tab === "product"}
        className={tabClass(tab === "product")}
        onClick={() => onTab("product")}
        type="button"
      >
        Product walkthrough
      </button>
    </div>
  );
}

function entryClass(active: boolean): string {
  return cn(
    "cursor-pointer rounded-sm border border-input px-2.5 py-0.5",
    active && "bg-info/15"
  );
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
    <div className="flex flex-wrap items-center gap-2 border-b px-2.5 py-1.5 text-[0.85rem]">
      {dirty && (
        <button
          aria-pressed={selected === "pending"}
          className={entryClass(selected === "pending")}
          onClick={() => onSelect("pending")}
          type="button"
        >
          Pending
          <span aria-hidden="true" className="ml-1.5 text-warning">
            ●
          </span>
        </button>
      )}
      <button
        aria-pressed={selected === "change"}
        className={entryClass(selected === "change")}
        onClick={() => onSelect("change")}
        type="button"
      >
        <code>{branch}</code>
      </button>
      {selected === "pending" && (
        <>
          <span className="ml-1.5 text-muted-foreground">Range:</span>
          <button
            aria-pressed={range === "incremental"}
            className={entryClass(range === "incremental")}
            onClick={() => onRange("incremental")}
            type="button"
          >
            Incremental
          </button>
          <button
            aria-pressed={range === "cumulative"}
            className={entryClass(range === "cumulative")}
            onClick={() => onRange("cumulative")}
            type="button"
          >
            Cumulative
          </button>
          <span className="ml-1.5 text-muted-foreground">
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
  fileOrder,
  onExitFileOrder,
}: {
  state: LoadState;
  review: ReviewSnapshot | null;
  diffRef: React.Ref<DiffViewHandle>;
  drift: ReadonlyMap<string, DriftResult>;
  fileOrder: readonly string[] | undefined;
  onExitFileOrder: () => void;
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
      fileOrder={fileOrder}
      findings={review?.findings ?? NO_FINDINGS}
      generated={change.generated}
      onExitFileOrder={onExitFileOrder}
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
  fileOrder,
  onSelect,
  onRange,
  onExitFileOrder,
}: {
  change: LoadState;
  pending: Pending | null;
  review: ReviewSnapshot | null;
  drift: ReadonlyMap<string, DriftResult>;
  diffRef: React.RefObject<DiffViewHandle | null>;
  selected: Selection;
  range: PendingRange;
  fileOrder: readonly string[] | undefined;
  onSelect: (selection: Selection) => void;
  onRange: (range: PendingRange) => void;
  onExitFileOrder: () => void;
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
            drift={drift}
            fileOrder={fileOrder}
            onExitFileOrder={onExitFileOrder}
            review={review}
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
  onOpenInDiff: OpenInDiff;
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
  const [selected, setSelected] = useViewParam();
  const [range, setRange] = useRangeParam();
  const [tab, setTab] = useTabParam();
  // The walkthrough-order override for the committed Diff surface: the tour's
  // file sequence, set by "open Diff tab in walkthrough order" and held until the
  // reviewer picks a path/size sort (diff-review.md §2).
  const [fileOrder, setFileOrder] = useState<readonly string[] | undefined>();
  const diffRef = useRef<DiffViewHandle>(null);

  // One live loop for the whole tab: the SSE bridge (one connection for the
  // app's lifetime) invalidates the Change, Pending, and review queries on
  // every `review-changed` event (architecture.md §2), and `useReviewData`
  // reads them at the current range.
  useReviewStream();
  const { change, pending, review } = useReviewData(range);

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
  // file/line (walkthroughs.md §1), via one atomic URL update.
  const openInDiff = useDiffDeepLink({
    diffRef,
    onFileOrder: setFileOrder,
  });

  const patch = change.kind === "loaded" ? change.change.patch : "";

  let body: React.ReactNode;
  if (tab === "walkthrough") {
    body = (
      <ErrorBoundary label="Code walkthrough tab">
        <WalkthroughTab
          review={review}
          onOpenInDiff={openInDiff}
          patch={patch}
        />
      </ErrorBoundary>
    );
  } else if (tab === "product") {
    body = (
      <ErrorBoundary label="Product walkthrough tab">
        <ProductWalkthroughTab review={review} />
      </ErrorBoundary>
    );
  } else {
    body = (
      <ErrorBoundary label="Diff tab">
        <DiffTab
          change={change}
          diffRef={diffRef}
          drift={drift}
          fileOrder={fileOrder}
          onExitFileOrder={() => setFileOrder(undefined)}
          onRange={(next) => {
            void setRange(next);
          }}
          onSelect={(next) => {
            void setSelected(next);
          }}
          pending={pending}
          range={range}
          review={review}
          selected={selected}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {review ? <ReviewStatus review={review} /> : null}
      <TabBar
        onTab={(next) => {
          void setTab(next);
        }}
        tab={tab}
      />
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
          <ErrorBoundary label="Findings panel">
            <FindingsPanel
              drift={drift}
              findings={review.findings}
              onJump={(file, line) => openInDiff(file, line, "head")}
              onWrite={handleWrite}
            />
          </ErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}
