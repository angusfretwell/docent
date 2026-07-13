import {
  Composer,
  DriftPill,
  FindingThread,
} from "@client/features/walkthrough-shared";
import type { DriftResult } from "@client/lib/drift";
import { Button } from "@client/ui/button";
import { Checkbox } from "@client/ui/checkbox";
import { Label } from "@client/ui/label";
import { useFindingParam, useResolvedParam } from "@client/url/params";
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

// The Review-global Findings panel (diff-review.md §7): a flat list of every
// Finding sorted by location, with a show-resolved toggle (off by default) and a
// change-level composer. It is the home for triage and for detached Findings —
// which have no line in the diff to pin to. Rows expand to a thread in place, so
// replies, resolves and reopens are authorable here as well as inline. Records
// arrive folded here so the panel and future agent surfaces share one derivation.

// The cross-Change timeline ("opened on chg_001 · resolved on chg_004") — labels,
// not navigation (diff-review.md §7), from each record's own changeId.
const historyClass = "mt-[0.2rem] text-[0.7rem] text-muted-foreground";

// An outdated Finding detaches from the diff and renders against its born text
// (data-model.md §6.1) — shown in place so the reviewer keeps the original
// context without navigating to the birth Change. The signal-toned rail is the
// same re-check accent as the drift pill's signal tone.
const bornTextClass =
  "mx-2 overflow-x-auto whitespace-pre border-l-2 border-l-signal/50 bg-muted px-2 py-1.5 font-mono text-[0.72rem]";

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
    <div className="border-b">
      <button
        className="block w-full cursor-pointer px-3 py-2 text-left"
        onClick={onToggle}
        type="button"
      >
        <div className="truncate font-mono">
          {findingLocation(finding.anchor)}
        </div>
        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
          <span>{finding.resolved ? "Resolved" : "Open"}</span>
          <span>·</span>
          <span>{WHATS_NEXT_LABEL[finding.whatsNext]}</span>
          <DriftPill resolved={finding.resolved} state={state} />
        </div>
        {history === "" ? null : <div className={historyClass}>{history}</div>}
      </button>
      {expanded && state === "outdated" && drift?.bornText ? (
        <pre className={bornTextClass}>{drift.bornText}</pre>
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
  onJump: (file: string, line: number, finding: string | null) => void;
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
    const next = expandedId === finding.id ? null : finding.id;

    // A row with a diff anchor expands and jumps in one navigation (one
    // history entry); an anchorless (detached/change-level) row just expands.
    const target = findingJumpTarget(finding.anchor);
    if (target === undefined) {
      setExpandedId(next);
      return;
    }

    onJump(target.file, target.line, next);
  }

  function submitChangeFinding(body: string) {
    setBusy(true);
    void onWrite({ anchor: { kind: "change" }, body, op: "open" })
      .then(() => setChangeComposerOpen(false))
      .finally(() => setBusy(false));
  }

  return (
    <aside className="flex h-full w-80 flex-col overflow-auto border-l text-[0.8rem]">
      {/* Top padding clears the fixed ReviewStatus pill (top-right, over every
          tab), so the panel's controls are never covered by it. z-10 keeps
          positioned Badges in scrolled-away rows from painting over it. */}
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background px-3 pt-8 pb-2">
        <div className="flex items-center justify-between">
          <strong>Findings · {visible.length}</strong>
          <Label className="gap-1.5 font-normal text-muted-foreground">
            <Checkbox
              checked={showResolved}
              onCheckedChange={(checked) => {
                setShowResolved(checked);
              }}
            />
            Show resolved
          </Label>
        </div>
        <Button
          onClick={() => setChangeComposerOpen((open) => !open)}
          size="xs"
          variant="outline"
        >
          {changeComposerOpen ? "Cancel" : "Comment on whole change"}
        </Button>
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
        <p className="p-3 text-muted-foreground">No findings to show.</p>
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
