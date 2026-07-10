import { Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { Change, DiffError } from "../shared/change.ts";
import { DossierSnapshot } from "../shared/dossier.ts";
import type { FindingEntry, ViewedEvent } from "../shared/dossier.ts";
import type { FindingWrite } from "../shared/finding-write.ts";
import type { PendingRange } from "../shared/pending.ts";
import { Pending } from "../shared/pending.ts";
import { fetchPendingExpandedFileDiff, isPendingExpandable } from "./blobs.ts";
import { useDrift } from "./drift.ts";
import type { DiffViewHandle } from "./diff-view.tsx";
import { DiffView } from "./diff-view.tsx";
import { writeFinding } from "./findings-client.ts";
import { FindingsPanel } from "./findings-panel.tsx";

// Append a Finding record. The write lands a file in `.docent/`, which trips the
// server's watch → SSE push → snapshot re-fetch, so the new record renders
// itself; the caller just awaits the POST.
async function handleWrite(write: FindingWrite): Promise<void> {
  await writeFinding(write);
}

// Stable empties so the pre-snapshot render doesn't churn DiffView's effects.
const NO_VIEWED: readonly ViewedEvent[] = [];
const NO_FINDINGS: readonly FindingEntry[] = [];

// Sync decode boundary: the fetch handlers below own the try/catch.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);
const decodeSnapshot = Schema.decodeUnknownSync(DossierSnapshot);
const decodePending = Schema.decodeUnknownSync(Pending);

// Which selector entry is showing: the committed Change, or the read-only
// Pending working-tree preview.
type Selection = "change" | "pending";

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
function DossierStatus({ dossier }: { dossier: DossierSnapshot }) {
  return (
    <div style={statusStyle}>
      <code>{dossier.dossier.branch}</code> · {dossier.changes.length} changes ·{" "}
      {dossier.findings.length} findings · {dossier.walkthroughs.length} walkthroughs
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p style={{ opacity: 0.7, padding: "1rem" }}>{children}</p>;
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
 * toggle. It is strictly a preview: no Finding authoring, no mark-as-viewed.
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
          <span aria-hidden="true" style={{ color: "#d29922", marginLeft: "0.4rem" }}>
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
          <span style={{ marginLeft: "0.4rem", opacity: 0.6 }}>Read-only preview</span>
        </>
      )}
    </div>
  );
}

/**
 * The committed-Change body: loading / error / empty / the rendered diff. This
 * is the mark-as-viewed surface — the Dossier's viewed events and findings fold
 * into the diff here (Pending is a read-only preview, so it carries neither).
 */
function ChangeBody({
  state,
  dossier,
  diffRef,
}: {
  state: LoadState;
  dossier: DossierSnapshot | null;
  diffRef: React.Ref<DiffViewHandle>;
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
        <code>{change.branch}</code> has no changes against <code>{change.defaultBranch}</code>.
      </Notice>
    );
  }
  return (
    <DiffView
      findings={dossier?.findings ?? NO_FINDINGS}
      generated={change.generated}
      onWrite={handleWrite}
      patch={change.patch}
      ref={diffRef}
      viewed={dossier?.viewed ?? NO_VIEWED}
    />
  );
}

/** The Pending body: the working-tree preview, with worktree-sourced expansion. */
function PendingBody({
  pending,
  diffRef,
}: {
  pending: Pending;
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
      viewed={NO_VIEWED}
    />
  );
}

export function App() {
  const [change, setChange] = useState<LoadState>({ kind: "loading" });
  const [pending, setPending] = useState<Pending | null>(null);
  const [dossier, setDossier] = useState<DossierSnapshot | null>(null);
  const [selected, setSelected] = useState<Selection>("change");
  const [range, setRange] = useState<PendingRange>("incremental");
  const diffRef = useRef<DiffViewHandle>(null);

  // One live loop for the whole tab: fetch the Change, the Pending preview (at
  // the current range), and the dossier once, then re-fetch all three on every
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
    // event, so a transient error never blanks the Pending preview or dossier.
    async function loadBestEffort<T>(
      url: string,
      decode: (value: unknown) => T,
      apply: (value: T) => void,
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
      return loadBestEffort(`/api/pending?range=${range}`, decodePending, setPending);
    }
    function loadDossier() {
      // oxlint-disable-next-line react-compiler
      return loadBestEffort("/api/dossier", decodeSnapshot, setDossier);
    }
    function refetchAll() {
      void loadChange();
      void loadPending();
      void loadDossier();
    }
    // oxlint-disable-next-line react-doctor/query-no-query-in-effect
    refetchAll();
    const events = new EventSource("/api/events");
    events.addEventListener("dossier-changed", refetchAll);
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
    findings: dossier?.findings ?? NO_FINDINGS,
    patch: change.kind === "loaded" ? change.change.patch : "",
  });

  // Derived, not stored: Pending shows only while dirty, so a clean tree (e.g.
  // after commit) falls back to the committed Change with no lifecycle logic.
  const dirty = pending?.dirty ?? false;
  const effective: Selection = selected === "pending" && dirty ? "pending" : "change";
  const branch = pending?.branch ?? (change.kind === "loaded" ? change.change.branch : "…");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {dossier ? <DossierStatus dossier={dossier} /> : null}
      <ChangeSelector
        branch={branch}
        dirty={dirty}
        onRange={setRange}
        onSelect={setSelected}
        range={range}
        selected={effective}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {effective === "pending" && pending ? (
            <PendingBody diffRef={diffRef} pending={pending} />
          ) : (
            <ChangeBody diffRef={diffRef} dossier={dossier} state={change} />
          )}
        </div>
        {dossier ? (
          <FindingsPanel
            drift={drift}
            findings={dossier.findings}
            onJump={(file, line) => diffRef.current?.scrollToLine(file, line)}
            onWrite={handleWrite}
          />
        ) : null}
      </div>
    </div>
  );
}
