/**
 * The Product walkthrough tab: a hand-authored `docent/walkthrough@2`
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
  interleaveCaptureSegments,
  walkthroughStaleness,
} from "@shared/lib/walkthrough";

import "rrweb/dist/style.css";
import type {
  ChangeRecord,
  FindingEntry,
  WalkthroughEntry,
} from "@shared/schemas/review";
import type {
  Capture,
  WalkthroughAnnotation,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";

import { useRrwebReplayer } from "../hooks/use-rrweb-replayer";
import { captureUrl } from "../lib/blobs";
import { highlightQuotes } from "../lib/highlight-quotes";
import { narrativeBySectionId } from "../lib/walkthrough-narrative";
import {
  ANNOTATION_TONE,
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
const captionStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  lineHeight: 1.4,
  margin: "0.2rem 0",
  opacity: 0.85,
};

// An authored annotation note (durable, blue) that has no capture to pin to —
// a file / line / change / walkthrough-section / text-span arm (walkthroughs.md
// §7). Toned like the annotation pins so a reader tells the two acts apart.
const annotationNoteStyle: React.CSSProperties = {
  ...findingStyle,
  borderLeftColor: ANNOTATION_TONE.border,
};

// A highlighted text-span quote sitting inline in the section prose (§7).
const markStyle: React.CSSProperties = {
  background: "rgba(224,108,32,0.22)",
  borderRadius: "0.2rem",
  padding: "0 0.1rem",
};

/** A numbered chip label used both on a pin and in its caption. */
function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      style={{
        background: tone.chip,
        borderRadius: "0.7rem",
        color: "#fff",
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.02rem 0.4rem",
      }}
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
    <div style={{ margin: "0.4rem 0 0.2rem" }}>
      {pins.map((pin) => (
        <p key={pin.label} style={captionStyle}>
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
    <figure style={{ margin: "0.6rem 0" }}>
      <div
        style={{
          aspectRatio: `${w} / ${h}`,
          border: "1px solid rgba(128,128,128,0.25)",
          borderRadius: "0.4rem",
          maxWidth: `${w}px`,
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        {/* A content-addressed capture blob served from the Review, not a
            build asset — a plain img is the right primitive here. */}
        {/* oxlint-disable-next-line react-doctor/nextjs-no-img-element */}
        <img
          alt={`Screenshot of ${capture.route}`}
          src={captureUrl(walkthroughId, capture.media, "screenshot")}
          style={{ display: "block", height: "auto", width: "100%" }}
        />
        {regions.map((pin) => (
          <div
            key={pin.label}
            style={{
              border: `2px solid ${pin.tone.border}`,
              borderRadius: "0.2rem",
              boxSizing: "border-box",
              height: `${pin.rect[3] * 100}%`,
              left: `${pin.rect[0] * 100}%`,
              position: "absolute",
              top: `${pin.rect[1] * 100}%`,
              width: `${pin.rect[2] * 100}%`,
            }}
          >
            <span style={{ left: 0, position: "absolute", top: "-1.1rem" }}>
              <Chip label={pin.label} tone={pin.tone} />
            </span>
          </div>
        ))}
      </div>
      <figcaption style={{ fontSize: "0.75rem", opacity: 0.6 }}>
        <code>{capture.route}</code> · screenshot
      </figcaption>
      <Captions pins={[...regions, ...whole]} />
    </figure>
  );
}

// A recording's replay stage is sized to the recorded viewport, capped to the
// column width; rrweb scales its reconstructed DOM to fill it.
const RECORDING_MAX_WIDTH = 520;

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
  const duration = capture.durationMs ?? 0;

  return (
    <figure style={{ margin: "0.6rem 0" }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(128,128,128,0.25)",
          borderRadius: "0.4rem",
          height: `${vh}px`,
          maxWidth: "100%",
          overflow: "hidden",
          width: `${Math.min(vw, RECORDING_MAX_WIDTH)}px`,
        }}
      >
        <div ref={rootRef} style={{ height: "100%", width: "100%" }} />
      </div>
      {failed ? (
        <p style={{ fontSize: "0.8rem", opacity: 0.6 }}>
          Could not load the recording.
        </p>
      ) : (
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem",
            margin: "0.35rem 0",
          }}
        >
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
      <figcaption style={{ fontSize: "0.75rem", opacity: 0.6 }}>
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
    return <p style={proseStyle}>{text}</p>;
  }
  return (
    <p style={proseStyle}>
      {segments.map((segment, index) =>
        segment.kind === "quote" ? (
          <mark key={`mark:${segment.text}:${index}`} style={markStyle}>
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
    <section
      style={{
        borderTop: "1px solid rgba(128,128,128,0.2)",
        padding: "1rem 0",
      }}
    >
      <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{section.title}</h2>
      {narrative.map((finding) => (
        <div key={finding.id} style={findingStyle}>
          <span style={{ opacity: 0.6 }}>note: </span>
          {finding.body}
        </div>
      ))}
      {textSpans.map((finding) => (
        <div key={finding.id} style={findingStyle}>
          <span style={{ opacity: 0.6 }}>
            on “{finding.anchor?.kind === TEXT_SPAN ? finding.anchor.quote : ""}
            ”:{" "}
          </span>
          {finding.body}
        </div>
      ))}
      {annotations.notes.map((note) => (
        <div
          key={`annotation:${note.location}:${note.body.slice(0, 24)}`}
          style={annotationNoteStyle}
        >
          <span style={{ opacity: 0.6 }}>{note.location}: </span>
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
              key={`capture:${segment.index}`}
              style={{ fontSize: "0.8rem", opacity: 0.6 }}
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
          <div key={finding.id} style={{ margin: "0.6rem 0" }}>
            {born ? (
              <CaptureView
                annotations={[]}
                capture={born.capture}
                findings={[finding]}
                walkthroughId={born.walkthroughId}
              />
            ) : (
              <div style={findingStyle}>
                <span style={{ opacity: 0.6 }}>
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
    <div style={{ height: "100%", overflow: "auto", padding: "0 1.5rem 3rem" }}>
      <header style={{ padding: "1rem 0" }}>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.6rem",
          }}
        >
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>
            {manifest?.title ?? "Product walkthrough"}
          </h1>
          <StalenessBadge staleness={staleness} />
        </div>
      </header>
      {sections.length === 0 ? (
        <p style={{ opacity: 0.7 }}>
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
