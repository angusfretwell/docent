import { useState } from "react";
import type { FindingEntry } from "../shared/dossier.ts";
import type { FoldedFinding, WhatsNext } from "../shared/finding.ts";
import { findingLocation, foldFinding, sortFoldedFindings } from "../shared/finding.ts";

// The Dossier-global Findings panel (diff-review.md §7): a flat list of every
// Finding sorted by location, with a show-resolved toggle (off by default).
// Records arrive folded on the client so the panel and future agent surfaces
// share one derivation. v1 is deliberately minimal — one control, one row shape.

const WHATS_NEXT_LABEL: Record<WhatsNext, string> = {
  closed: "Closed",
  "needs-action": "Needs action",
  "needs-answer": "Needs answer",
  "needs-decision": "Needs decision",
  "needs-verify": "Needs verify",
};

const panelStyle: React.CSSProperties = {
  borderLeft: "1px solid rgba(128,128,128,0.25)",
  display: "flex",
  flexDirection: "column",
  fontSize: "0.8rem",
  height: "100vh",
  overflow: "auto",
  width: "20rem",
};

const headerStyle: React.CSSProperties = {
  alignItems: "center",
  borderBottom: "1px solid rgba(128,128,128,0.25)",
  display: "flex",
  gap: "0.5rem",
  justifyContent: "space-between",
  // Top padding clears the fixed DossierStatus pill (top-right, over every tab),
  // so the panel's one control is never covered by it.
  padding: "2rem 0.75rem 0.5rem",
  position: "sticky",
  top: 0,
};

const rowStyle: React.CSSProperties = {
  border: "none",
  borderBottom: "1px solid rgba(128,128,128,0.15)",
  display: "block",
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

/** The line/file a Finding can jump to in the diff, or nothing when detached. */
function jumpTarget(finding: FoldedFinding): { file: string; line: number } | undefined {
  if (finding.anchor?.kind === "line") {
    return { file: finding.anchor.file, line: finding.anchor.lines[0] };
  }
  return undefined;
}

function FindingRow({
  finding,
  onJump,
}: {
  finding: FoldedFinding;
  onJump: (file: string, line: number) => void;
}) {
  const target = jumpTarget(finding);

  return (
    <button
      disabled={target === undefined}
      onClick={target ? () => onJump(target.file, target.line) : undefined}
      style={{ ...rowStyle, background: "none", cursor: target ? "pointer" : "default" }}
      type="button"
    >
      <div style={locationStyle}>{findingLocation(finding.anchor)}</div>
      <div style={metaStyle}>
        <span>{finding.resolved ? "Resolved" : "Open"}</span>
        <span>·</span>
        <span>{WHATS_NEXT_LABEL[finding.whatsNext]}</span>
      </div>
    </button>
  );
}

/**
 * The Findings side panel. Folds each record directory, sorts by location, and
 * hides resolved Findings unless the toggle is on. New records dropped into
 * `findings/` reach here live: the parent re-fetches the snapshot on every SSE
 * change event, re-rendering the panel.
 */
export function FindingsPanel({
  findings,
  onJump,
}: {
  findings: readonly FindingEntry[];
  onJump: (file: string, line: number) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);

  const folded = sortFoldedFindings(
    findings.map((finding) => foldFinding(finding.id, finding.records)),
  );
  const visible = showResolved ? folded : folded.filter((finding) => !finding.resolved);

  return (
    <aside style={panelStyle}>
      <header style={headerStyle}>
        <strong>Findings · {visible.length}</strong>
        <label style={{ alignItems: "center", display: "flex", gap: "0.25rem", opacity: 0.8 }}>
          <input
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
            type="checkbox"
          />
          Show resolved
        </label>
      </header>
      {visible.length === 0 ? (
        <p style={{ opacity: 0.6, padding: "0.75rem" }}>No findings to show.</p>
      ) : (
        visible.map((finding) => <FindingRow finding={finding} key={finding.id} onJump={onJump} />)
      )}
    </aside>
  );
}
