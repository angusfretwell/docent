import { useState } from "react";
import type { FindingEntry } from "../shared/dossier.ts";
import type { FindingWrite } from "../shared/finding-write.ts";
import type { FoldedFinding } from "../shared/finding.ts";
import {
  findingJumpTarget,
  findingLocation,
  foldFinding,
  sortFoldedFindings,
  WHATS_NEXT_LABEL,
} from "../shared/finding.ts";
import { Composer } from "./composer.tsx";
import { FindingThread } from "./finding-thread.tsx";

// The Dossier-global Findings panel (diff-review.md §7): a flat list of every
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
  // Top padding clears the fixed DossierStatus pill (top-right, over every tab),
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
  display: "flex",
  gap: "0.5rem",
  marginTop: "0.25rem",
  opacity: 0.7,
};

function FindingRow({
  expanded,
  finding,
  onToggle,
  onWrite,
}: {
  expanded: boolean;
  finding: FoldedFinding;
  onToggle: () => void;
  onWrite: (write: FindingWrite) => Promise<void>;
}) {
  return (
    <div style={{ borderBottom: "1px solid rgba(128,128,128,0.15)" }}>
      <button onClick={onToggle} style={rowStyle} type="button">
        <div style={locationStyle}>{findingLocation(finding.anchor)}</div>
        <div style={metaStyle}>
          <span>{finding.resolved ? "Resolved" : "Open"}</span>
          <span>·</span>
          <span>{WHATS_NEXT_LABEL[finding.whatsNext]}</span>
        </div>
      </button>
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
  findings,
  onJump,
  onWrite,
}: {
  findings: readonly FindingEntry[];
  onJump: (file: string, line: number) => void;
  onWrite: (write: FindingWrite) => Promise<void>;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [changeComposerOpen, setChangeComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const folded = sortFoldedFindings(
    findings.map((finding) => foldFinding(finding.id, finding.records)),
  );
  const visible = showResolved ? folded : folded.filter((finding) => !finding.resolved);

  function toggle(finding: FoldedFinding) {
    setExpandedId((current) => (current === finding.id ? null : finding.id));
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
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <strong>Findings · {visible.length}</strong>
          <label style={{ alignItems: "center", display: "flex", gap: "0.25rem", opacity: 0.8 }}>
            <input
              checked={showResolved}
              onChange={(event) => setShowResolved(event.target.checked)}
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
            expanded={expandedId === finding.id}
            finding={finding}
            key={finding.id}
            onToggle={() => toggle(finding)}
            onWrite={onWrite}
          />
        ))
      )}
    </aside>
  );
}
