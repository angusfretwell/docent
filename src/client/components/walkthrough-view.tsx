/**
 * The Code walkthrough tab: a hand-authored `docent/walkthrough@2` (kind: code)
 * rendered as an ordered tour — prose interleaved with diff ranges, each range
 * rendered through the same `@pierre/diffs` `CodeView` substrate as the Diff tab
 * and deep-linking into it (walkthroughs.md §1, §5). Staleness (bornChangeId vs
 * head) and per-range drift (the Finding re-anchor, worst-of section rollup)
 * surface as badges, never hidden (walkthroughs.md §8). Findings anchored to a
 * section by identity surface as narrative callouts; Findings on code inside a
 * section fall through to the `line` arm and surface here too, beside their
 * range — the same record that shows in the Diff tab (walkthroughs.md §7).
 */

import type { CodeViewFileItem } from "@pierre/diffs";
import { CodeView, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { splitLines } from "@shared/lib/drift";
import { foldFinding } from "@shared/lib/finding";
import type { FoldedFinding } from "@shared/lib/finding";
import {
  identityAnchorDrift,
  interleaveSegments,
  rollupDrift,
  walkthroughStaleness,
} from "@shared/lib/walkthrough";
import type { DriftState } from "@shared/schemas/drift";
import type { Anchor } from "@shared/schemas/finding";
import type {
  ChangeRecord,
  FindingEntry,
  WalkthroughEntry,
} from "@shared/schemas/review";
import type {
  WalkthroughRange,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";
import { unique } from "radashi";
import { useEffect, useState } from "react";

import { fetchBlobText } from "../lib/blobs";
import { themes, workerFactory } from "../lib/code-view";
import type { DriftResult } from "../lib/drift";
import { useRangeDrift } from "../lib/walkthrough-drift";
import type { KeyedRange } from "../lib/walkthrough-drift";

/**
 * Deep-link into the Diff tab at a file/line/side. The optional fourth argument
 * carries the tour's file sequence, reordering the Diff surface into walkthrough
 * order rather than merely jumping to the first range (walkthroughs.md §1).
 */
export type OpenInDiff = (
  file: string,
  line: number,
  side: "base" | "head",
  order?: readonly string[]
) => void;

/** A stable key for a section's range, so drift and rendering agree. */
function rangeKey(sectionId: string, index: number): string {
  return `${sectionId}#${index}`;
}

/** The `CodeView` item id for a range — its content coordinate, not a drift key. */
function rangeItemId(range: WalkthroughRange): string {
  return `${range.file}:${range.blobSha}:${range.lines[0]}-${range.lines[1]}`;
}

/** Whether two 1-based inclusive line ranges overlap. */
function overlaps(
  a: readonly [number, number],
  b: readonly [number, number]
): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

const TONE: Record<"info" | "signal", React.CSSProperties> = {
  info: { background: "rgba(56,132,255,0.18)", color: "#4c8dff" },
  signal: { background: "rgba(224,108,32,0.2)", color: "#e0863c" },
};
const pillStyle: React.CSSProperties = {
  borderRadius: "0.35rem",
  fontSize: "0.75rem",
  padding: "0.05rem 0.45rem",
  whiteSpace: "nowrap",
};
const buttonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: "0.25rem",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  fontSize: "0.75rem",
  padding: "0.1rem 0.5rem",
};
const staleStyle: React.CSSProperties = {
  ...pillStyle,
  background: "rgba(210,153,34,0.2)",
  color: "#d29922",
};
const proseStyle: React.CSSProperties = {
  lineHeight: 1.5,
  margin: "0.5rem 0",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const findingStyle: React.CSSProperties = {
  borderLeft: "2px solid rgba(56,132,255,0.5)",
  fontSize: "0.85rem",
  margin: "0.4rem 0",
  opacity: 0.85,
  padding: "0.1rem 0.6rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const rangeHeaderStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  fontSize: "0.8rem",
  gap: "0.5rem",
  marginBottom: "0.25rem",
  opacity: 0.85,
};
const headerRowStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.6rem",
};

/**
 * The drift badge for a range or a section rollup (walkthroughs.md §8): `moved`
 * for a shifted block (still present, at new line numbers), `changed` for an
 * outdated one (the tour's code was edited or deleted). `live` shows nothing.
 */
function DriftTag({ state }: { state: DriftState }) {
  if (state === "shifted") {
    return <span style={{ ...pillStyle, ...TONE.info }}>Moved</span>;
  }
  if (state === "outdated") {
    return <span style={{ ...pillStyle, ...TONE.signal }}>Changed</span>;
  }
  return null;
}

// A short, readable height for a range: enough to show the block without an
// inner scrollbar for small hunks, capped so a large range still fits the flow.
const RANGE_LINE_HEIGHT = 20;
const RANGE_CHROME = 52;
const RANGE_MAX_HEIGHT = 480;

function rangeHeight(lineCount: number): number {
  return Math.min(
    RANGE_MAX_HEIGHT,
    Math.max(2, lineCount) * RANGE_LINE_HEIGHT + RANGE_CHROME
  );
}

/** The lone `CodeView` file item for a range — the Diff tab's renderer, one blob. */
function RangeCodeView({
  cacheKey,
  contents,
  id,
  name,
}: {
  cacheKey: string;
  contents: string;
  id: string;
  name: string;
}) {
  const item: CodeViewFileItem = {
    file: { cacheKey, contents, name },
    id,
    type: "file",
  };
  return (
    <CodeView
      items={[item]}
      options={{ stickyHeaders: false, theme: themes }}
      style={{ height: "100%", overflow: "auto" }}
    />
  );
}

/** The range's rendered body: a loading note, a load-failure note, or the code. */
function RangeBody({
  range,
  text,
  failed,
}: {
  range: WalkthroughRange;
  text: string | null;
  failed: boolean;
}) {
  if (failed) {
    return (
      <p style={{ fontSize: "0.8rem", opacity: 0.6 }}>
        Could not load {range.file}.
      </p>
    );
  }
  if (text === null) {
    return (
      <p style={{ fontSize: "0.8rem", opacity: 0.6 }}>Loading {range.file}…</p>
    );
  }
  return (
    <div
      style={{
        border: "1px solid rgba(128,128,128,0.25)",
        borderRadius: "0.4rem",
        height: rangeHeight(range.lines[1] - range.lines[0] + 1),
        overflow: "hidden",
      }}
    >
      <RangeCodeView
        cacheKey={`${range.blobSha}:${range.lines[0]}-${range.lines[1]}`}
        contents={text}
        id={rangeItemId(range)}
        name={range.file}
      />
    </div>
  );
}

/**
 * One range rendered through `CodeView`. The bytes come from the range's
 * content-addressed born blob (`/api/blob/:sha`) — immutable, so always
 * addressable — sliced to the range's lines. Drift never changes what is shown
 * (a shifted block is byte-identical; an outdated one detaches and renders
 * against its born text — walkthroughs.md §8); it only drives the badge and the
 * Diff deep-link's target line. A `base`/`head` label and the born line range
 * head the block, since the slice renumbers from 1.
 */
function RangeCode({
  range,
  drift,
  findings,
  onOpenInDiff,
}: {
  range: WalkthroughRange;
  drift: DriftResult | undefined;
  findings: readonly FoldedFinding[];
  onOpenInDiff: OpenInDiff;
}) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBlobText(range.blobSha)
      .then((full) => {
        if (!cancelled) {
          const sliced = splitLines(full)
            .slice(range.lines[0] - 1, range.lines[1])
            .join("\n");
          setText(sliced);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.blobSha, range.lines]);

  const targetLine = drift?.lines?.[0] ?? range.lines[0];
  const state = drift?.state ?? "live";
  const codeFindings = findings.filter(
    (finding) =>
      finding.anchor?.kind === "line" &&
      finding.anchor.file === range.file &&
      overlaps(finding.anchor.lines, range.lines)
  );

  return (
    <div style={{ margin: "0.6rem 0" }}>
      <div style={rangeHeaderStyle}>
        <code>
          {range.file}:{range.lines[0]}–{range.lines[1]}
        </code>
        <span style={{ opacity: 0.6 }}>({range.side})</span>
        <DriftTag state={state} />
        <button
          onClick={() => onOpenInDiff(range.file, targetLine, range.side)}
          style={buttonStyle}
          type="button"
        >
          Open in Diff
        </button>
      </div>
      <RangeBody failed={failed} range={range} text={text} />
      {codeFindings.map((finding) => (
        <div key={finding.id} style={findingStyle}>
          {finding.body}
        </div>
      ))}
    </div>
  );
}

/**
 * One section: its title, drift rollup, narrative Findings, and interleaved body.
 * A section rendered here belongs to the shown (latest) walkthrough, so its
 * narrative Findings are identity-live by construction (§8). A Finding on a
 * superseded walkthrough is outdated and detaches into the trailing
 * `DetachedNarrative` section rather than rendering against a section this tour
 * no longer holds (data-model.md §6.2).
 */
function Section({
  section,
  drift,
  narrative,
  code,
  onOpenInDiff,
}: {
  section: WalkthroughSection;
  drift: ReadonlyMap<string, DriftResult>;
  narrative: readonly FoldedFinding[];
  code: readonly FoldedFinding[];
  onOpenInDiff: OpenInDiff;
}) {
  const ranges = section.ranges ?? [];
  const rollup = rollupDrift(
    ranges.map((_, index) => drift.get(rangeKey(section.id, index))?.state)
  );
  const segments = interleaveSegments(section.body, ranges.length);

  return (
    <section
      style={{
        borderTop: "1px solid rgba(128,128,128,0.2)",
        padding: "1rem 0",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{section.title}</h2>
        <DriftTag state={rollup} />
      </div>
      {narrative.map((finding) => (
        <div key={finding.id} style={findingStyle}>
          <span style={{ opacity: 0.6 }}>note: </span>
          {finding.body}
        </div>
      ))}
      {segments.map((segment) =>
        segment.kind === "prose" ? (
          <p key={`prose:${segment.text.slice(0, 24)}`} style={proseStyle}>
            {segment.text}
          </p>
        ) : (
          <RangeCode
            drift={drift.get(rangeKey(section.id, segment.index))}
            findings={code}
            key={`range:${segment.index}`}
            onOpenInDiff={onOpenInDiff}
            range={ranges[segment.index] as WalkthroughRange}
          />
        )
      )}
    </section>
  );
}

/** Whether a folded finding is a narrative anchor on this walkthrough. */
function isNarrative(anchor: Anchor | undefined, walkthroughId: string) {
  return (
    anchor?.kind === "walkthrough-section" &&
    anchor.walkthroughId === walkthroughId
  );
}

/** Group narrative Findings by the section id they anchor. */
function narrativeBySectionId(
  folded: readonly FoldedFinding[],
  walkthroughId: string
): Map<string, FoldedFinding[]> {
  const bySection = new Map<string, FoldedFinding[]>();
  for (const finding of folded) {
    const { anchor } = finding;
    if (
      anchor?.kind === "walkthrough-section" &&
      isNarrative(anchor, walkthroughId)
    ) {
      const list = bySection.get(anchor.sectionId) ?? [];
      list.push(finding);
      bySection.set(anchor.sectionId, list);
    }
  }
  return bySection;
}

/** A superseded narrative Finding plus the born section prose it detaches to. */
interface DetachedNote {
  bornText?: string;
  finding: FoldedFinding;
}

/**
 * The unresolved narrative Findings whose walkthrough was superseded: born on
 * an earlier **code** walkthrough, so they no longer anchor a section this tour
 * holds. Each is outdated per identity drift and detaches to its born section
 * prose (data-model.md §6.2). Resolved + outdated is the §6.3 collapsed end
 * state, so those are omitted here as in the Findings panel's default view.
 * Product-pillar narrative Findings are left for the Product tab; the Findings
 * panel is the cross-pillar home for both.
 */
function detachedNarrative(
  folded: readonly FoldedFinding[],
  walkthroughs: readonly WalkthroughEntry[]
): DetachedNote[] {
  const detached: DetachedNote[] = [];
  for (const finding of folded) {
    const { anchor } = finding;
    if (anchor?.kind !== "walkthrough-section") {
      continue;
    }

    // A resolved + outdated Finding is the §6.3 healthy end state — collapsed,
    // matching the Findings panel's default-hide-resolved. Only unresolved
    // detached Findings still warrant the Code tab's re-check surface.
    if (finding.resolved) {
      continue;
    }

    const born = walkthroughs.find(
      (entry) => entry.id === anchor.walkthroughId
    );
    if (born?.kind !== "code") {
      continue;
    }

    const drift = identityAnchorDrift(anchor, walkthroughs);
    if (drift?.state === "outdated") {
      detached.push({
        finding,
        ...(drift.bornText === undefined ? {} : { bornText: drift.bornText }),
      });
    }
  }
  return detached;
}

/**
 * The trailing "Detached findings" section: narrative Findings on a superseded
 * walkthrough, rendered against their born section prose so they surface rather
 * than vanish when a newer tour supersedes theirs (data-model.md §6.2).
 */
function DetachedNarrative({ notes }: { notes: readonly DetachedNote[] }) {
  if (notes.length === 0) {
    return null;
  }
  return (
    <section
      style={{
        borderTop: "1px solid rgba(128,128,128,0.2)",
        padding: "1rem 0",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Detached findings</h2>
        <span style={{ ...pillStyle, ...TONE.signal }}>Outdated</span>
      </div>
      <p style={{ fontSize: "0.8rem", opacity: 0.6 }}>
        These Findings were left on a superseded walkthrough; they render
        against their born section prose.
      </p>
      {notes.map(({ finding, bornText }) => (
        <div key={finding.id} style={{ margin: "0.6rem 0" }}>
          {bornText === undefined ? null : <p style={proseStyle}>{bornText}</p>}
          <div style={findingStyle}>
            <span style={{ opacity: 0.6 }}>note: </span>
            {finding.body}
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * The Code walkthrough tab body. Renders the latest code walkthrough's sections
 * in manifest order; surfaces staleness once at the top and per-range/section
 * drift throughout. Narrative Findings on a superseded walkthrough detach into a
 * trailing section. `onOpenInDiff` deep-links a range (or the whole tour, from
 * its first target) into the Diff tab.
 */
export function WalkthroughView({
  walkthrough,
  walkthroughs,
  changes,
  findings,
  patch,
  onOpenInDiff,
}: {
  walkthrough: WalkthroughEntry;
  walkthroughs: readonly WalkthroughEntry[];
  changes: readonly ChangeRecord[];
  findings: readonly FindingEntry[];
  patch: string;
  onOpenInDiff: OpenInDiff;
}) {
  const { sections } = walkthrough;

  // Every range across every section, keyed stably, so one drift pass covers the
  // whole tour (walkthroughs.md §8).
  const keyed: KeyedRange[] = sections.flatMap((section) =>
    (section.ranges ?? []).map((range, index) => ({
      key: rangeKey(section.id, index),
      range,
    }))
  );
  const drift = useRangeDrift(keyed, patch);

  const folded = findings.map((finding) =>
    foldFinding(finding.id, finding.records)
  );
  const narrative = narrativeBySectionId(folded, walkthrough.id);
  const codeFindings = folded.filter(
    (finding) => finding.anchor?.kind === "line"
  );
  const detached = detachedNarrative(folded, walkthroughs);

  const staleness = walkthroughStaleness(
    walkthrough.manifest?.bornChangeId ?? "",
    changes
  );
  const firstRange = keyed[0]?.range;
  // The tour's file sequence — sections in manifest order, each section's ranges
  // in order, deduped to a file's first appearance: the "open Diff tab in
  // walkthrough order" payload (walkthroughs.md §1).
  const orderedFiles = unique(keyed.map((entry) => entry.range.file));

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "0 1.5rem 3rem" }}>
      <WorkerPoolContextProvider
        highlighterOptions={{ theme: themes, useTokenTransformer: true }}
        poolOptions={{
          poolSize: Math.min(8, navigator.hardwareConcurrency || 4),
          workerFactory,
        }}
      >
        <header style={{ padding: "1rem 0" }}>
          <div style={headerRowStyle}>
            <h1 style={{ fontSize: "1.4rem", margin: 0 }}>
              {walkthrough.manifest?.title ?? "Code walkthrough"}
            </h1>
            {staleness.stale ? (
              <span style={staleStyle}>
                {staleness.behind} change{staleness.behind === 1 ? "" : "s"}{" "}
                behind
              </span>
            ) : null}
            {firstRange ? (
              <button
                onClick={() =>
                  onOpenInDiff(
                    firstRange.file,
                    firstRange.lines[0],
                    firstRange.side,
                    orderedFiles
                  )
                }
                style={{ ...buttonStyle, marginLeft: "auto" }}
                type="button"
              >
                Open Diff in walkthrough order
              </button>
            ) : null}
          </div>
        </header>
        {sections.length === 0 ? (
          <p style={{ opacity: 0.7 }}>
            This walkthrough has no readable sections.
          </p>
        ) : (
          sections.map((section) => (
            <Section
              code={codeFindings}
              drift={drift}
              key={section.id}
              narrative={narrative.get(section.id) ?? []}
              onOpenInDiff={onOpenInDiff}
              section={section}
            />
          ))
        )}
        <DetachedNarrative notes={detached} />
      </WorkerPoolContextProvider>
    </div>
  );
}
