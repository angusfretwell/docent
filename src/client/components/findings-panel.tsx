import { changeHistoryLabel } from "@shared/lib/drift";
import type { FoldedFinding } from "@shared/lib/finding";
import {
  findingJumpTarget,
  findingLocation,
  foldFinding,
  sortFoldedFindings,
  WHATS_NEXT_LABEL,
} from "@shared/lib/finding";
import type { DriftState } from "@shared/schemas/drift";
import type { FindingWrite } from "@shared/schemas/finding-write";
import type { FindingEntry } from "@shared/schemas/review";
import { useState } from "react";

import type { DriftResult } from "../lib/drift";
import { useFindingParam, useResolvedParam } from "../url/params";
import { Composer } from "./composer";
import { DRIFT_SIGNAL, DriftPill } from "./drift-badge";
import { FindingThread } from "./finding-thread";

// The Review-global Findings panel (diff-review.md §7): a flat list of every
// Finding sorted by location, with a show-resolved toggle (off by default) and a
// change-level composer. It is the home for triage and for detached Findings —
// which have no line in the diff to pin to. Rows expand to a thread in place, so
// replies, resolves and reopens are authorable here as well as inline. Records
// arrive folded here so the panel and future agent surfaces share one derivation.

const panelStyle: React.CSSProperties = {
  borderLeft: "1px solid rgba(128,128,128,0.25)",
  display: "flex",
  flexDirection: "column",
  fontSize: "0.8rem",
  height: "100%",
  overflow: "auto",
  width: "20rem",
};

const headerStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(128,128,128,0.25)",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  // Top padding clears the fixed ReviewStatus pill (top-right, over every tab),
  // so the panel's controls are never covered by it.
  padding: "2rem 0.75rem 0.5rem",
  position: "sticky",
  top: 0,
};

const rowStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  display: "block",
  font: "inherit",
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  width: "100%",
};

const locationStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: "0.5rem",
  marginTop: "0.25rem",
  opacity: 0.7,
};

// The cross-Change timeline ("opened on chg_001 · resolved on chg_004") — labels,
// not navigation (diff-review.md §7), from each record's own changeId.
const historyStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  marginTop: "0.2rem",
  opacity: 0.55,
};

// An outdated Finding detaches from the diff and renders against its born text
// (data-model.md §6.1) — shown in place so the reviewer keeps the original
// context without navigating to the birth Change.
const bornTextStyle: React.CSSProperties = {
  background: "rgba(128,128,128,0.08)",
  borderLeft: `2px solid rgba(${DRIFT_SIGNAL},0.5)`,
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.72rem",
  margin: "0 0.5rem",
  overflowX: "auto",
  padding: "0.4rem 0.5rem",
  whiteSpace: "pre",
};

function FindingRow({
  drift,
  expanded,
  finding,
  history,
  onToggle,
  onWrite,
}: {
  drift?: DriftResult;
  expanded: boolean;
  finding: FoldedFinding;
  history: string;
  onToggle: () => void;
  onWrite: (write: FindingWrite) => Promise<void>;
}) {
  const state: DriftState = drift?.state ?? "live";
  return (
    <div style={{ borderBottom: "1px solid rgba(128,128,128,0.15)" }}>
      <button onClick={onToggle} style={rowStyle} type="button">
        <div style={locationStyle}>{findingLocation(finding.anchor)}</div>
        <div style={metaStyle}>
          <span>{finding.resolved ? "Resolved" : "Open"}</span>
          <span>·</span>
          <span>{WHATS_NEXT_LABEL[finding.whatsNext]}</span>
          <DriftPill resolved={finding.resolved} state={state} />
        </div>
        {history === "" ? null : <div style={historyStyle}>{history}</div>}
      </button>
      {expanded && state === "outdated" && drift?.bornText ? (
        <pre style={bornTextStyle}>{drift.bornText}</pre>
      ) : null}
      {expanded ? <FindingThread finding={finding} onWrite={onWrite} /> : null}
    </div>
  );
}

/**
 * The Findings side panel. Folds each record directory, sorts by location, hides
 * resolved ones unless the toggle is on, and expands a row to its thread on click
 * (also jumping to its diff anchor when it has one). New records — dropped here,
 * inline in the diff, or by an external agent — reach the panel live: the parent
 * re-fetches the snapshot on every SSE change event.
 */
export function FindingsPanel({
  drift,
  findings,
  onJump,
  onWrite,
}: {
  drift: ReadonlyMap<string, DriftResult>;
  findings: readonly FindingEntry[];
  onJump: (file: string, line: number) => void;
  onWrite: (write: FindingWrite) => Promise<void>;
}) {
  const [showResolved, setShowResolved] = useResolvedParam();
  const [expandedId, setExpandedId] = useFindingParam();
  const [changeComposerOpen, setChangeComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Keep each Finding's records beside its fold so the row can render the
  // cross-Change timeline (which reads per-record changeId) without re-walking.
  const historyById = new Map(
    findings.map((finding) => [finding.id, changeHistoryLabel(finding.records)])
  );
  const folded = sortFoldedFindings(
    findings.map((finding) => foldFinding(finding.id, finding.records))
  );
  const visible = showResolved
    ? folded
    : folded.filter((finding) => !finding.resolved);

  function toggle(finding: FoldedFinding) {
    void setExpandedId((current) =>
      current === finding.id ? null : finding.id
    );
    const target = findingJumpTarget(finding.anchor);
    if (target !== undefined) {
      onJump(target.file, target.line);
    }
  }

  function submitChangeFinding(body: string) {
    setBusy(true);
    void onWrite({ anchor: { kind: "change" }, body, op: "open" })
      .then(() => setChangeComposerOpen(false))
      .finally(() => setBusy(false));
  }

  return (
    <aside style={panelStyle}>
      <header style={headerStyle}>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <strong>Findings · {visible.length}</strong>
          <label
            style={{
              alignItems: "center",
              display: "flex",
              gap: "0.25rem",
              opacity: 0.8,
            }}
          >
            <input
              checked={showResolved}
              onChange={(event) => {
                void setShowResolved(event.target.checked);
              }}
              type="checkbox"
            />
            Show resolved
          </label>
        </div>
        <button
          className="expand-context"
          onClick={() => setChangeComposerOpen((open) => !open)}
          type="button"
        >
          {changeComposerOpen ? "Cancel" : "Comment on whole change"}
        </button>
        {changeComposerOpen ? (
          <Composer
            autoFocus
            busy={busy}
            onSubmit={submitChangeFinding}
            placeholder="A finding about the whole change…"
            submitLabel="Comment"
          />
        ) : null}
      </header>
      {visible.length === 0 ? (
        <p style={{ opacity: 0.6, padding: "0.75rem" }}>No findings to show.</p>
      ) : (
        visible.map((finding) => (
          <FindingRow
            drift={drift.get(finding.id)}
            expanded={expandedId === finding.id}
            finding={finding}
            history={historyById.get(finding.id) ?? ""}
            key={finding.id}
            onToggle={() => toggle(finding)}
            onWrite={onWrite}
          />
        ))
      )}
    </aside>
  );
}
