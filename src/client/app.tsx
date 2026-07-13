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
import {
  Outlet,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { createContext, useContext, useRef, useState } from "react";

import { fetchPendingExpandedFileDiff } from "./data/blobs";
import type { LoadState } from "./data/review";
import { useReviewData, useReviewStream } from "./data/review";
import { ErrorBoundary } from "./error-boundary";
import type { DiffViewHandle } from "./features/diff";
import { DiffView, useDiffDeepLink } from "./features/diff";
import { FindingsPanel, writeFinding } from "./features/findings";
import { ProductWalkthroughView } from "./features/product";
import { WalkthroughView } from "./features/walkthrough";
import { isPendingExpandable } from "./lib/blobs";
import type { DriftResult } from "./lib/drift";
import { useDrift } from "./lib/drift";
import type { OpenInDiff } from "./lib/nav";
import { Tabs, TabsList, TabsTab } from "./ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import type { Selection } from "./url/params";
import {
  DIFF_SEARCH_DEFAULTS,
  useRangeParam,
  useViewParam,
} from "./url/params";

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
 * Everything the route views share from the root's single live loop: the
 * queries, drift, the diff handle, and the deep-link primitives. Provided by
 * `App` above the `<Outlet />` so each route reads it instead of
 * re-instantiating the loop (one EventSource for the app's lifetime).
 */
interface RootData {
  change: LoadState;
  pending: Pending | null;
  review: ReviewSnapshot | null;
  drift: ReadonlyMap<string, DriftResult>;
  diffRef: React.RefObject<DiffViewHandle | null>;
  fileOrder: readonly string[] | undefined;
  onExitFileOrder: () => void;
  openInDiff: OpenInDiff;
  patch: string;
}

const RootDataContext = createContext<RootData | null>(null);

function useRootData(): RootData {
  const data = useContext(RootDataContext);
  if (data === null) {
    throw new Error("useRootData requires the App shell above the route");
  }
  return data;
}

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

const TAB_ROUTES = {
  diff: "/diff",
  product: "/product",
  walkthrough: "/walkthrough",
} as const;

type Tab = keyof typeof TAB_ROUTES;

/**
 * The view-mode tabs (walkthroughs.md §1), one route each. The strip is a coss
 * `Tabs` controlled by the current pathname — selecting a tab navigates
 * (carrying only the Review-global params), and the route change drives the
 * active indicator — so each view keeps the outlet's unmount-on-switch
 * semantics rather than adopting `Tabs.Panel`'s mounting model.
 */
function TabBar() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const tabs = Object.keys(TAB_ROUTES) as Tab[];
  const active = tabs.find((tab) => TAB_ROUTES[tab] === pathname) ?? "diff";

  return (
    <div className="border-b px-2.5">
      <Tabs
        onValueChange={(value) => {
          void navigate({
            search: (prev) => ({
              finding: prev.finding,
              resolved: prev.resolved,
            }),
            to: TAB_ROUTES[value as Tab],
          });
        }}
        value={active}
      >
        <TabsList variant="underline">
          <TabsTab value="diff">Diff</TabsTab>
          <TabsTab value="walkthrough">Code walkthrough</TabsTab>
          <TabsTab value="product">Product walkthrough</TabsTab>
        </TabsList>
      </Tabs>
    </div>
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
      <ToggleGroup
        onValueChange={(groupValue) => {
          const [next] = groupValue;
          if (next !== undefined) {
            onSelect(next as Selection);
          }
        }}
        size="sm"
        value={[selected]}
        variant="outline"
      >
        {dirty && (
          <ToggleGroupItem value="pending">
            Pending
            <span aria-hidden="true" className="text-warning">
              ●
            </span>
          </ToggleGroupItem>
        )}
        <ToggleGroupItem value="change">
          <code>{branch}</code>
        </ToggleGroupItem>
      </ToggleGroup>
      {selected === "pending" && (
        <>
          <span className="ml-1.5 text-muted-foreground">Range:</span>
          <ToggleGroup
            onValueChange={(groupValue) => {
              const [next] = groupValue;
              if (next !== undefined) {
                onRange(next as PendingRange);
              }
            }}
            size="sm"
            value={[range]}
            variant="outline"
          >
            <ToggleGroupItem value="incremental">Incremental</ToggleGroupItem>
            <ToggleGroupItem value="cumulative">Cumulative</ToggleGroupItem>
          </ToggleGroup>
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
 * The Diff view: the Change/Pending selector over the diff surface. The global
 * Findings panel is mounted by `App` beside every view, so it isn't rendered
 * here. The selector state (`view`, `range`) is the Diff route's own search
 * state; the shared data comes from the root context.
 */
function DiffTab() {
  const {
    change,
    diffRef,
    drift,
    fileOrder,
    onExitFileOrder,
    pending,
    review,
  } = useRootData();
  const [selected, setSelected] = useViewParam();
  const [range, setRange] = useRangeParam();

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
        onRange={setRange}
        onSelect={setSelected}
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

/** The Code walkthrough view, or a prompt to author one when none exists. */
function WalkthroughTab() {
  const { openInDiff, patch, review } = useRootData();

  const walkthrough = latestCodeWalkthrough(review?.walkthroughs ?? []);
  if (!(walkthrough && review)) {
    return <Notice>No code walkthrough yet. Run /docent to author one.</Notice>;
  }
  return (
    <WalkthroughView
      changes={review.changes}
      findings={review.findings}
      onOpenInDiff={openInDiff}
      patch={patch}
      walkthrough={walkthrough}
      walkthroughs={review.walkthroughs}
    />
  );
}

/** The Product walkthrough view, or a prompt to author one when none exists. */
function ProductWalkthroughTab() {
  const { review } = useRootData();

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

export function DiffRoute() {
  return (
    <ErrorBoundary label="Diff tab">
      <DiffTab />
    </ErrorBoundary>
  );
}

export function WalkthroughRoute() {
  return (
    <ErrorBoundary label="Code walkthrough tab">
      <WalkthroughTab />
    </ErrorBoundary>
  );
}

export function ProductRoute() {
  return (
    <ErrorBoundary label="Product walkthrough tab">
      <ProductWalkthroughTab />
    </ErrorBoundary>
  );
}

/** The root route's shell: the one live data loop around the routed view. */
export function App() {
  // The walkthrough-order override for the committed Diff surface: the tour's
  // file sequence, set by "open Diff tab in walkthrough order" and held until the
  // reviewer picks a path/size sort (diff-review.md §2). Ephemeral by design —
  // it never belongs to the URL.
  const [fileOrder, setFileOrder] = useState<readonly string[] | undefined>();
  const diffRef = useRef<DiffViewHandle>(null);

  // `range` is the Diff route's search state, read loosely here because the
  // Pending query lives at the root so every view shares one live data loop.
  const range = useSearch({
    select: (search) => search.range ?? DIFF_SEARCH_DEFAULTS.range,
    strict: false,
  });

  // One live loop for the whole app: the SSE bridge (one connection for the
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

  // The deep-link loop: a walkthrough range or a Findings-panel row (the panel
  // is global, so the click can come from any view) opens the Diff route at its
  // file/line (walkthroughs.md §1), via one atomic navigation.
  const openInDiff = useDiffDeepLink({
    diffRef,
    onFileOrder: setFileOrder,
  });

  const patch = change.kind === "loaded" ? change.change.patch : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {review ? <ReviewStatus review={review} /> : null}
      <TabBar />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <RootDataContext.Provider
            value={{
              change,
              diffRef,
              drift,
              fileOrder,
              onExitFileOrder: () => setFileOrder(undefined),
              openInDiff,
              patch,
              pending,
              review,
            }}
          >
            <Outlet />
          </RootDataContext.Provider>
        </div>
        {review ? (
          <ErrorBoundary label="Findings panel">
            <FindingsPanel
              drift={drift}
              findings={review.findings}
              onJump={(file, line, finding) =>
                openInDiff(file, line, "head", { finding })
              }
              onWrite={handleWrite}
            />
          </ErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}
