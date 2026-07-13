/**
 * The Product walkthrough tab: a hand-authored `docent/walkthrough`
 * (kind: product) rendered as an ordered tour — prose interleaved with captures
 * (walkthroughs.md §1, §5). Screenshot captures render as dims-aware embeds;
 * recording captures replay through rrweb, self-contained with no network
 * (walkthroughs.md §6, the #5 spike). The generator's annotation pins overlay
 * their capture — durable, not resolvable, distinct from Findings
 * (walkthroughs.md §7); a capture-less annotation arm (file / line / change /
 * walkthrough-section / text-span) renders as a section note so none is dropped.
 * Reviewer Findings anchor via the capture arms
 * (`screenshot-region`, `recording-timestamp`, `text-span`) and render beside
 * their target; a whole-capture Finding is the arm with its coordinate omitted.
 * Drift is identity-based (walkthroughs.md §8): a capture/section anchor is live
 * while its target exists in this immutable walkthrough, outdated once
 * superseded — then it detaches and renders against its born capture. No
 * shifted. Staleness (bornChangeId vs head) surfaces once at the top, matching
 * the code tab.
 */

import { foldFinding } from "@shared/lib/finding";
import type { FoldedFinding } from "@shared/lib/finding";
import {
  captureById,
  foldSectionAnnotations,
  walkthroughStaleness,
} from "@shared/lib/walkthrough-annotations";
import { interleaveCaptureSegments } from "@shared/lib/walkthrough-segments";
import type {
  ChangeRecord,
  FindingEntry,
  WalkthroughEntry,
} from "@shared/schemas/review";

import "rrweb/dist/style.css";
import type {
  Capture,
  WalkthroughAnnotation,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";
import { useLayoutEffect, useRef, useState } from "react";

import { useRrwebReplayer } from "../hooks/use-rrweb-replayer";
import { captureUrl } from "../lib/blobs";
import { highlightQuotes } from "../lib/highlight-quotes";
import { narrativeBySectionId } from "../lib/walkthrough-narrative";
import {
  annotationsFor,
  captureAnchorId,
  captureFindingDrift,
  RECORDING_TIMESTAMP,
  recordingPins,
  SCREENSHOT_REGION,
  screenshotPins,
  TEXT_SPAN,
} from "../lib/walkthrough-pins";
import type { Tone } from "../lib/walkthrough-pins";
import { DetachedSection } from "./detached-section";
import { StalenessBadge } from "./staleness-badge";

const proseClass = "my-2 leading-normal whitespace-pre-wrap break-words";
const calloutClass =
  "my-1.5 border-l-2 px-2.5 py-0.5 text-sm whitespace-pre-wrap break-words";
const findingClass = `${calloutClass} border-l-info/50`;
const buttonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: "0.25rem",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  fontSize: "0.75rem",
  padding: "0.1rem 0.5rem",
};
const captionClass = "my-1 text-[0.8rem] leading-snug text-muted-foreground";

// An authored annotation note (durable, blue) that has no capture to pin to —
// a file / line / change / walkthrough-section / text-span arm (walkthroughs.md
// §7). Toned like the annotation pins so a reader tells the two acts apart.
const annotationNoteClass = `${calloutClass} border-l-info`;

// A highlighted text-span quote sitting inline in the section prose (§7).
const markClass = "rounded-xs bg-signal/25 px-0.5 text-foreground";

/** A numbered chip label used both on a pin and in its caption. */
function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className="rounded-full px-1.5 text-xs font-semibold text-white"
      style={{ background: tone.chip }}
    >
      {label}
    </span>
  );
}

/** The caption list under a capture: each pin's chip beside its callout body. */
function Captions({
  pins,
}: {
  pins: readonly { body: string; label: string; tone: Tone }[];
}) {
  if (pins.length === 0) {
    return null;
  }
  return (
    <div className="mt-1.5 mb-1">
      {pins.map((pin) => (
        <p className={captionClass} key={pin.label}>
          <Chip label={pin.label} tone={pin.tone} /> {pin.body}
        </p>
      ))}
    </div>
  );
}

/**
 * One screenshot capture: a dims-aware `<img>` embed (the full-page blob served
 * from the walkthrough's own `captures/` dir) with region pins overlaid.
 * Normalized `rect` coordinates (0..1) position each pin as percentages, so they
 * stay pinned however the image scales.
 */
function ScreenshotCapture({
  walkthroughId,
  capture,
  annotations,
  findings,
}: {
  walkthroughId: string;
  capture: Capture;
  annotations: readonly WalkthroughAnnotation[];
  findings: readonly FoldedFinding[];
}) {
  const { regions, whole } = screenshotPins(annotations, findings, capture);
  const [w, h] = capture.dims ?? capture.viewport;

  return (
    <figure className="my-2.5">
      <div
        className="relative w-full overflow-hidden rounded-md border"
        style={{ aspectRatio: `${w} / ${h}`, maxWidth: `${w}px` }}
      >
        {/* A content-addressed capture blob served from the Review, not a
            build asset — a plain img is the right primitive here. */}
        {/* oxlint-disable-next-line react-doctor/nextjs-no-img-element */}
        <img
          alt={`Screenshot of ${capture.route}`}
          className="block h-auto w-full"
          src={captureUrl(walkthroughId, capture.media, "screenshot")}
        />
        {regions.map((pin) => (
          <div
            className="absolute box-border rounded-xs border-2"
            key={pin.label}
            style={{
              borderColor: pin.tone.border,
              height: `${pin.rect[3] * 100}%`,
              left: `${pin.rect[0] * 100}%`,
              top: `${pin.rect[1] * 100}%`,
              width: `${pin.rect[2] * 100}%`,
            }}
          >
            <span className="absolute -top-[1.1rem] left-0">
              <Chip label={pin.label} tone={pin.tone} />
            </span>
          </div>
        ))}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        <code>{capture.route}</code> · screenshot
      </figcaption>
      <Captions pins={[...regions, ...whole]} />
    </figure>
  );
}

// A recording's replay stage is capped to the column width; the replay is
// scaled down to fit it (see useReplayScale).
const RECORDING_MAX_WIDTH = 520;

/**
 * rrweb's `Replayer` reconstructs the DOM at the recorded viewport size and
 * never scales it (scale-to-fit is an rrweb-player feature) — measure the
 * stage and scale the mount ourselves so the replay fits instead of clipping.
 */
function useReplayScale(recordedWidth: number) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setScale(stage.clientWidth / recordedWidth);
    });
    observer.observe(stage);

    return () => observer.disconnect();
  }, [recordedWidth]);

  return { scale, stageRef };
}

/**
 * One recording capture: a self-contained rrweb replay of the captured session
 * (walkthroughs.md §6). The event stream is fetched from the content-addressed
 * `captures/<sha>.rrweb.json` blob and handed to rrweb's `Replayer`, which
 * reconstructs the DOM with no network. Recording-timestamp pins mark the
 * timeline; clicking one seeks the replay to that offset.
 */
function RecordingCapture({
  walkthroughId,
  capture,
  annotations,
  findings,
}: {
  walkthroughId: string;
  capture: Capture;
  annotations: readonly WalkthroughAnnotation[];
  findings: readonly FoldedFinding[];
}) {
  const { rootRef, ready, failed, seek } = useRrwebReplayer(
    captureUrl(walkthroughId, capture.media, "recording")
  );
  const { times, whole } = recordingPins(annotations, findings, capture);
  const [vw, vh] = capture.viewport;
  const { scale, stageRef } = useReplayScale(vw);
  const duration = capture.durationMs ?? 0;

  return (
    <figure className="my-2.5">
      <div
        className="max-w-full overflow-hidden rounded-md border bg-white"
        ref={stageRef}
        style={{
          height: `${vh * scale}px`,
          width: `${Math.min(vw, RECORDING_MAX_WIDTH)}px`,
        }}
      >
        <div
          ref={rootRef}
          style={{
            height: `${vh}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: `${vw}px`,
          }}
        />
      </div>
      {failed ? (
        <p className="text-[0.8rem] text-muted-foreground">
          Could not load the recording.
        </p>
      ) : (
        <div className="my-1.5 flex flex-wrap items-center gap-1.5">
          <button
            disabled={!ready}
            onClick={() => seek(0)}
            style={buttonStyle}
            type="button"
          >
            ▶ Replay
          </button>
          {times.map((pin) => (
            <button
              disabled={!ready}
              key={pin.label}
              onClick={() => seek(pin.atMs)}
              style={{ ...buttonStyle, borderColor: pin.tone.border }}
              type="button"
            >
              <Chip label={pin.label} tone={pin.tone} />{" "}
              {(pin.atMs / 1000).toFixed(1)}
              {pin.toMs === undefined ? "" : `–${(pin.toMs / 1000).toFixed(1)}`}
              s
            </button>
          ))}
        </div>
      )}
      <figcaption className="text-xs text-muted-foreground">
        <code>{capture.route}</code> · recording
        {duration > 0 ? ` · ${(duration / 1000).toFixed(1)}s` : ""}
      </figcaption>
      <Captions pins={[...times, ...whole]} />
    </figure>
  );
}

/** Route a capture segment to the screenshot embed or the rrweb replay. */
function CaptureView({
  walkthroughId,
  capture,
  annotations,
  findings,
}: {
  walkthroughId: string;
  capture: Capture;
  annotations: readonly WalkthroughAnnotation[];
  findings: readonly FoldedFinding[];
}) {
  if (capture.kind === "recording") {
    return (
      <RecordingCapture
        annotations={annotations}
        capture={capture}
        findings={findings}
        walkthroughId={walkthroughId}
      />
    );
  }
  return (
    <ScreenshotCapture
      annotations={annotations}
      capture={capture}
      findings={findings}
      walkthroughId={walkthroughId}
    />
  );
}

/**
 * A prose run with any text-span Finding quotes highlighted in place — the
 * quote-based anchor rendered **into the section prose** (walkthroughs.md §7),
 * not just listed beside it. Each quote's first occurrence in the run is wrapped;
 * quotes that don't appear here fall through untouched (they still list as a note
 * above the body).
 */
function Prose({ text, quotes }: { text: string; quotes: readonly string[] }) {
  const segments = highlightQuotes(text, quotes);
  const isPlainText = segments.length === 1 && segments[0]?.kind === "text";
  if (isPlainText) {
    return <p className={proseClass}>{text}</p>;
  }
  return (
    <p className={proseClass}>
      {segments.map((segment, index) =>
        segment.kind === "quote" ? (
          <mark className={markClass} key={`mark:${segment.text}:${index}`}>
            {segment.text}
          </mark>
        ) : (
          segment.text
        )
      )}
    </p>
  );
}

/**
 * One section: title, narrative Findings, then the interleaved body. Each
 * `{{capture:i}}` resolves the section's i-th capture id against the manifest
 * registry and renders its embed/replay with the section's annotation pins and
 * this capture's Findings.
 */
function Section({
  section,
  manifest,
  captureFindings,
  narrative,
  textSpans,
}: {
  section: WalkthroughSection;
  manifest: WalkthroughEntry["manifest"];
  captureFindings: readonly FoldedFinding[];
  narrative: readonly FoldedFinding[];
  textSpans: readonly FoldedFinding[];
}) {
  const captureIds = section.captures ?? [];
  const walkthroughId = manifest?.id ?? "";
  const segments = interleaveCaptureSegments(section.body, captureIds.length);

  // Annotations carry the full anchor vocabulary, but only the capture arms pin
  // to a capture; every other arm surfaces as a section note (and a text-span
  // also highlights in the prose) so nothing an author writes is dropped (§7).
  const annotations = foldSectionAnnotations(section.annotations ?? []);
  const quotes = [
    ...textSpans.map((finding) =>
      finding.anchor?.kind === TEXT_SPAN ? finding.anchor.quote : ""
    ),
    ...annotations.quotes,
  ];

  return (
    <section className="border-t py-4">
      <h2 className="text-[1.05rem] font-semibold">{section.title}</h2>
      {narrative.map((finding) => (
        <div className={findingClass} key={finding.id}>
          <span className="text-muted-foreground">note: </span>
          {finding.body}
        </div>
      ))}
      {textSpans.map((finding) => (
        <div className={findingClass} key={finding.id}>
          <span className="text-muted-foreground">
            on “{finding.anchor?.kind === TEXT_SPAN ? finding.anchor.quote : ""}
            ”:{" "}
          </span>
          {finding.body}
        </div>
      ))}
      {annotations.notes.map((note) => (
        <div
          className={annotationNoteClass}
          key={`annotation:${note.location}:${note.body.slice(0, 24)}`}
        >
          <span className="text-muted-foreground">{note.location}: </span>
          {note.body}
        </div>
      ))}
      {segments.map((segment) => {
        if (segment.kind === "prose") {
          return (
            <Prose
              key={`prose:${segment.text.slice(0, 24)}`}
              quotes={quotes}
              text={segment.text}
            />
          );
        }
        const captureId = captureIds[segment.index] ?? "";
        const capture = captureById(manifest, captureId);
        if (capture === undefined) {
          return (
            <p
              className="text-[0.8rem] text-muted-foreground"
              key={`capture:${segment.index}`}
            >
              Missing capture <code>{captureId}</code>.
            </p>
          );
        }
        return (
          <CaptureView
            annotations={annotationsFor(section, captureId)}
            capture={capture}
            findings={captureFindings}
            key={`capture:${segment.index}`}
            walkthroughId={walkthroughId}
          />
        );
      })}
    </section>
  );
}

/** Group `text-span` Findings by the section id they quote into. */
function textSpansBySectionId(
  folded: readonly FoldedFinding[]
): Map<string, FoldedFinding[]> {
  const bySection = new Map<string, FoldedFinding[]>();
  for (const finding of folded) {
    const { anchor } = finding;
    if (anchor?.kind === TEXT_SPAN) {
      const list = bySection.get(anchor.section) ?? [];
      list.push(finding);
      bySection.set(anchor.section, list);
    }
  }
  return bySection;
}

/** Find a capture by id across every walkthrough's registry — the born-capture recovery. */
function findBornCapture(
  walkthroughs: readonly WalkthroughEntry[],
  captureId: string
): { capture: Capture; walkthroughId: string } | undefined {
  for (const entry of walkthroughs) {
    const capture = captureById(entry.manifest, captureId);
    if (capture !== undefined && entry.manifest !== undefined) {
      return { capture, walkthroughId: entry.manifest.id };
    }
  }
  return undefined;
}

/**
 * A capture-arm Finding whose capture is gone from the shown walkthrough:
 * identity drift makes it **outdated**, so it detaches and renders against its
 * born capture, recovered by the content sha from any walkthrough that still
 * registers that capture id (walkthroughs.md §8).
 */
function DetachedFindings({
  findings,
  walkthroughs,
  placedCaptureIds,
}: {
  findings: readonly FoldedFinding[];
  walkthroughs: readonly WalkthroughEntry[];
  placedCaptureIds: ReadonlySet<string>;
}) {
  const detached = findings.filter(
    (finding) =>
      captureFindingDrift(finding.anchor, placedCaptureIds) === "outdated"
  );
  if (detached.length === 0) {
    return null;
  }
  return (
    <DetachedSection explanation="These Findings point at captures no longer placed in this walkthrough; they render against their born capture.">
      {detached.map((finding) => {
        const captureId = captureAnchorId(finding.anchor) ?? "";
        const born = findBornCapture(walkthroughs, captureId);
        return (
          <div className="my-2.5" key={finding.id}>
            {born ? (
              <CaptureView
                annotations={[]}
                capture={born.capture}
                findings={[finding]}
                walkthroughId={born.walkthroughId}
              />
            ) : (
              <div className={findingClass}>
                <span className="text-muted-foreground">
                  capture {captureId} (unavailable):{" "}
                </span>
                {finding.body}
              </div>
            )}
          </div>
        );
      })}
    </DetachedSection>
  );
}

/**
 * The Product walkthrough tab body. Renders the latest product walkthrough's
 * sections in manifest order; surfaces staleness once at the top (identical to
 * the code tab). Live capture Findings render as pins beside their capture;
 * outdated ones detach into a trailing section.
 */
export function ProductWalkthroughView({
  walkthrough,
  changes,
  findings,
  walkthroughs,
}: {
  walkthrough: WalkthroughEntry;
  changes: readonly ChangeRecord[];
  findings: readonly FindingEntry[];
  walkthroughs: readonly WalkthroughEntry[];
}) {
  const { sections, manifest } = walkthrough;
  const folded = findings.map((finding) =>
    foldFinding(finding.id, finding.records)
  );
  const narrative = narrativeBySectionId(folded, walkthrough.id);
  const textSpans = textSpansBySectionId(folded);
  const captureFindings = folded.filter(
    (finding) =>
      finding.anchor?.kind === SCREENSHOT_REGION ||
      finding.anchor?.kind === RECORDING_TIMESTAMP
  );

  // Placement, not registry membership, decides identity drift: a capture is
  // rendered only where a section places it, so a Finding is live only if its
  // capture is placed. Registry-but-unplaced captures fall through to
  // DetachedFindings, so their Findings surface rather than vanish (§8).
  const placedCaptureIds = new Set(
    sections.flatMap((section) => section.captures ?? [])
  );
  const liveCaptureFindings = captureFindings.filter(
    (finding) =>
      captureFindingDrift(finding.anchor, placedCaptureIds) === "live"
  );

  const staleness = walkthroughStaleness(manifest?.bornChangeId ?? "", changes);

  return (
    <div className="h-full overflow-auto px-6 pb-12">
      <header className="py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[1.4rem] font-semibold">
            {manifest?.title ?? "Product walkthrough"}
          </h1>
          <StalenessBadge staleness={staleness} />
        </div>
      </header>
      {sections.length === 0 ? (
        <p className="text-muted-foreground">
          This walkthrough has no readable sections.
        </p>
      ) : (
        sections.map((section) => (
          <Section
            captureFindings={liveCaptureFindings}
            key={section.id}
            manifest={manifest}
            narrative={narrative.get(section.id) ?? []}
            section={section}
            textSpans={textSpans.get(section.id) ?? []}
          />
        ))
      )}
      <DetachedFindings
        findings={captureFindings}
        placedCaptureIds={placedCaptureIds}
        walkthroughs={walkthroughs}
      />
    </div>
  );
}
