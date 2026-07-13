/**
 * The Code walkthrough tab: a hand-authored `docent/walkthrough` (kind: code)
 * rendered as an ordered tour — prose interleaved with diff ranges, each range
 * rendered through the same `@pierre/diffs` `CodeView` substrate as the Diff tab
 * and deep-linking into it (walkthroughs.md §1, §5). Staleness (bornChangeId vs
 * head) and per-range drift (the Finding re-anchor, worst-of section rollup)
 * surface as badges, never hidden (walkthroughs.md §8). Findings anchored to a
 * section by identity surface as narrative callouts; Findings on code inside a
 * section fall through to the `line`/`file` arms and surface here too — a `line`
 * beside its range, a whole-`file` once at the section level — the same records
 * that show in the Diff tab (walkthroughs.md §7).
 */

import {
  CodeViewWorkerPool,
  DetachedSection,
  narrativeBySectionId,
  StalenessBadge,
} from "@client/features/walkthrough-shared";
import { themes } from "@client/lib/code-view";
import type { DriftResult } from "@client/lib/drift";
import type { OpenInDiff } from "@client/lib/nav";
import { Badge } from "@client/ui/badge";
import { Button } from "@client/ui/button";
import type { CodeViewFileItem } from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import { findingLocation, foldFinding } from "@shared/lib/finding";
import type { FoldedFinding } from "@shared/lib/finding";
import { identityAnchorDrift } from "@shared/lib/identity-drift";
import {
  rollupDrift,
  walkthroughStaleness,
} from "@shared/lib/walkthrough-annotations";
import { interleaveSegments } from "@shared/lib/walkthrough-segments";
import type { DriftState } from "@shared/schemas/drift";
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
import { useState } from "react";

import { useRangeWindow } from "./use-range-window";
import { CONTEXT_STEP } from "./walkthrough-context";
import type { RangeWindow } from "./walkthrough-context";
import { useRangeDrift } from "./walkthrough-drift";
import type { KeyedRange } from "./walkthrough-drift";

/** A stable key for a section's range, so drift and rendering agree. */
function rangeKey(sectionId: string, index: number): string {
  return `${sectionId}#${index}`;
}

/**
 * The `CodeView` item id / highlighter cache key for a shown window — its
 * content coordinate, not a drift key. Keyed on the shown lines so expanding
 * context re-tokenizes the widened slice rather than reusing the narrow one.
 */
function windowId(
  range: WalkthroughRange,
  lines: readonly [number, number]
): string {
  return `${range.file}:${range.blobSha}:${lines[0]}-${lines[1]}`;
}

/** Whether two 1-based inclusive line ranges overlap. */
function overlaps(
  a: readonly [number, number],
  b: readonly [number, number]
): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

const proseClass = "my-2 leading-normal whitespace-pre-wrap break-words";
const findingClass =
  "my-1.5 border-l-2 border-l-info/50 px-2.5 py-0.5 text-sm whitespace-pre-wrap break-words";

/**
 * The drift badge for a range or a section rollup (walkthroughs.md §8): `moved`
 * for a shifted block (still present, at new line numbers), `changed` for an
 * outdated one (the tour's code was edited or deleted). `live` shows nothing.
 */
function DriftTag({ state }: { state: DriftState }) {
  if (state === "shifted") {
    return <Badge variant="info">Moved</Badge>;
  }
  if (state === "outdated") {
    return <Badge variant="signal">Changed</Badge>;
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
  codeWindow,
  failed,
}: {
  range: WalkthroughRange;
  codeWindow: RangeWindow | null;
  failed: boolean;
}) {
  if (failed) {
    return (
      <p className="text-[0.8rem] text-muted-foreground">
        Could not load {range.file}.
      </p>
    );
  }
  if (codeWindow === null) {
    return (
      <p className="text-[0.8rem] text-muted-foreground">
        Loading {range.file}…
      </p>
    );
  }
  const id = windowId(range, codeWindow.lines);
  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{
        height: rangeHeight(codeWindow.lines[1] - codeWindow.lines[0] + 1),
      }}
    >
      <RangeCodeView
        cacheKey={id}
        contents={codeWindow.text}
        id={id}
        name={range.file}
      />
    </div>
  );
}

/**
 * One range rendered through `CodeView`. The bytes come from the range's
 * content-addressed born blob (`/api/blob/:sha`) — immutable, so always
 * addressable — sliced to the range's lines. The whole blob is fetched once and
 * held, so the reader can **expand context** inline: widening the slice is a
 * pure re-slice of bytes already in hand, the same content-addressed sourcing
 * the Diff tab expands from (walkthroughs.md §1), never a second fetch. Drift
 * never changes what is shown (a shifted block is byte-identical; an outdated
 * one detaches and renders against its born text — walkthroughs.md §8); it only
 * drives the badge and the Diff deep-link's target line. A `base`/`head` label
 * and the born line range head the block, since the slice renumbers from 1.
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
  // Context lines revealed on each side of the range, grown by "Expand context".
  const [context, setContext] = useState(0);
  const { codeWindow, failed } = useRangeWindow(range, context);

  const targetLine = drift?.lines?.[0] ?? range.lines[0];
  const state = drift?.state ?? "live";
  const codeFindings = findings.filter(
    (finding) =>
      finding.anchor?.kind === "line" &&
      finding.anchor.file === range.file &&
      overlaps(finding.anchor.lines, range.lines)
  );
  const canExpand =
    codeWindow !== null && (codeWindow.canExpandUp || codeWindow.canExpandDown);

  return (
    <div className="my-2.5">
      <div className="mb-1 flex items-center gap-2 text-[0.8rem] text-muted-foreground">
        <code>
          {range.file}:{range.lines[0]}–{range.lines[1]}
        </code>
        <span className="opacity-60">({range.side})</span>
        <DriftTag state={state} />
        <Button
          onClick={() => onOpenInDiff(range.file, targetLine, range.side)}
          size="xs"
          variant="outline"
        >
          Open in Diff
        </Button>
        {canExpand ? (
          <Button
            onClick={() => setContext((prev) => prev + CONTEXT_STEP)}
            size="xs"
            variant="outline"
          >
            Expand context
          </Button>
        ) : null}
        {context > 0 ? (
          <Button onClick={() => setContext(0)} size="xs" variant="outline">
            Collapse
          </Button>
        ) : null}
      </div>
      <RangeBody codeWindow={codeWindow} failed={failed} range={range} />
      {codeFindings.map((finding) => (
        <div className={findingClass} key={finding.id}>
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

  // A whole-file Finding has no line to sit beside, so it surfaces once at the
  // section level for each section whose ranges touch that file — the `file`
  // arm §7 promises the walkthrough renders, not only the `line` arm. Line
  // Findings still render inside their range via RangeCode.
  const sectionFiles = new Set(ranges.map((range) => range.file));
  const fileFindings = code.filter(
    (finding) =>
      finding.anchor?.kind === "file" && sectionFiles.has(finding.anchor.file)
  );

  return (
    <section className="border-t py-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[1.05rem] font-semibold">{section.title}</h2>
        <DriftTag state={rollup} />
      </div>
      {narrative.map((finding) => (
        <div className={findingClass} key={finding.id}>
          <span className="text-muted-foreground">note: </span>
          {finding.body}
        </div>
      ))}
      {fileFindings.map((finding) => (
        <div className={findingClass} key={finding.id}>
          <span className="text-muted-foreground">
            {findingLocation(finding.anchor)}:{" "}
          </span>
          {finding.body}
        </div>
      ))}
      {segments.map((segment) =>
        segment.kind === "prose" ? (
          <p className={proseClass} key={`prose:${segment.text.slice(0, 24)}`}>
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
    <DetachedSection explanation="These Findings were left on a superseded walkthrough; they render against their born section prose.">
      {notes.map(({ finding, bornText }) => (
        <div className="my-2.5" key={finding.id}>
          {bornText === undefined ? null : (
            <p className={proseClass}>{bornText}</p>
          )}
          <div className={findingClass}>
            <span className="text-muted-foreground">note: </span>
            {finding.body}
          </div>
        </div>
      ))}
    </DetachedSection>
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
    (finding) =>
      finding.anchor?.kind === "line" || finding.anchor?.kind === "file"
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
    <div className="h-full overflow-auto px-6 pb-12">
      <CodeViewWorkerPool>
        <header className="py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[1.4rem] font-semibold">
              {walkthrough.manifest?.title ?? "Code walkthrough"}
            </h1>
            <StalenessBadge staleness={staleness} />
            {firstRange ? (
              <Button
                className="ml-auto"
                onClick={() =>
                  onOpenInDiff(
                    firstRange.file,
                    firstRange.lines[0],
                    firstRange.side,
                    orderedFiles
                  )
                }
                size="xs"
                variant="outline"
              >
                Open Diff in walkthrough order
              </Button>
            ) : null}
          </div>
        </header>
        {sections.length === 0 ? (
          <p className="text-muted-foreground">
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
      </CodeViewWorkerPool>
    </div>
  );
}
