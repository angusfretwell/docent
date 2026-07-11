/**
 * The Product walkthrough tab: a hand-authored `docent/walkthrough@2`
 * (kind: product) rendered as an ordered tour — prose interleaved with captures
 * (walkthroughs.md §1, §5). Screenshot captures render as dims-aware embeds;
 * recording captures replay through rrweb, self-contained with no network
 * (walkthroughs.md §6, the #5 spike). The generator's annotation pins overlay
 * their capture — durable, not resolvable, distinct from Findings
 * (walkthroughs.md §7). Reviewer Findings anchor via the capture arms
 * (`screenshot-region`, `recording-timestamp`, `text-span`) and render beside
 * their target; a whole-capture Finding is the arm with its coordinate omitted.
 * Drift is identity-based (walkthroughs.md §8): a capture/section anchor is live
 * while its target exists in this immutable walkthrough, outdated once
 * superseded — then it detaches and renders against its born capture. No
 * shifted. Staleness (bornChangeId vs head) surfaces once at the top, matching
 * the code tab.
 */

import { Replayer } from "rrweb";
import type { eventWithTime } from "rrweb";
import { useEffect, useRef, useState } from "react";
import "rrweb/dist/style.css";
import type { ChangeRecord, FindingEntry, WalkthroughEntry } from "@shared/schemas/dossier";
import type { DriftState } from "@shared/schemas/drift";
import { foldFinding } from "@shared/lib/finding";
import type { FoldedFinding } from "@shared/lib/finding";
import type { Anchor } from "@shared/schemas/finding";
import {
  captureById,
  identityDrift,
  interleaveCaptureSegments,
  walkthroughStaleness,
} from "@shared/lib/walkthrough";
import type {
  Capture,
  WalkthroughAnnotation,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";
import { captureUrl, fetchCaptureEvents } from "../lib/blobs";

const pillStyle: React.CSSProperties = {
  borderRadius: "0.35rem",
  fontSize: "0.75rem",
  padding: "0.05rem 0.45rem",
  whiteSpace: "nowrap",
};
const staleStyle: React.CSSProperties = {
  ...pillStyle,
  background: "rgba(210,153,34,0.2)",
  color: "#d29922",
};
const outdatedStyle: React.CSSProperties = {
  ...pillStyle,
  background: "rgba(224,108,32,0.2)",
  color: "#e0863c",
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

/** An overlay tone — the border and chip colour of a pin and its caption. */
interface Tone {
  border: string;
  chip: string;
}

// Two visually distinct overlay tones: an authored annotation (durable, blue)
// versus a reviewer Finding (orange), so a reader tells the two acts apart at a
// glance (walkthroughs.md §7).
const ANNOTATION_TONE: Tone = { border: "#4c8dff", chip: "rgba(56,132,255,0.9)" };
const FINDING_TONE: Tone = { border: "#e0863c", chip: "rgba(224,108,32,0.9)" };

// The capture anchor arms, named once so narrowing and filters read one token.
const SCREENSHOT_REGION = "screenshot-region";
const RECORDING_TIMESTAMP = "recording-timestamp";
const TEXT_SPAN = "text-span";

// A highlighted text-span quote sitting inline in the section prose (§7).
const markStyle: React.CSSProperties = {
  background: "rgba(224,108,32,0.22)",
  borderRadius: "0.2rem",
  padding: "0 0.1rem",
};

/** A screenshot-region rect an overlay can position, plus its callout body and tone. */
interface RegionPin {
  body: string;
  label: string;
  rect: readonly [number, number, number, number];
  tone: Tone;
}

/** A recording-timestamp marker on the replay timeline, plus its callout. */
interface TimePin {
  atMs: number;
  body: string;
  label: string;
  toMs?: number;
  tone: Tone;
}

/** A capture-level callout with no coordinate — a whole-capture annotation or Finding. */
interface WholePin {
  body: string;
  label: string;
  tone: Tone;
}

// The two capture anchor arms are structurally identical across annotations and
// Findings — same `kind`/`capture` plus an optional coordinate — so one raw
// collector feeds both the screenshot and recording placement (§7). The shape is
// the Finding union's two capture arms (an annotation anchor is assignable to it),
// derived so it can't drift from the schema. A pin sourced from an annotation is
// toned blue and labelled `A`; from a Finding, orange `F`.
type CaptureAnchor = Extract<Anchor, { kind: "screenshot-region" | "recording-timestamp" }>;

interface RawPin {
  anchor: CaptureAnchor;
  body: string;
  label: string;
  tone: Tone;
}

/** The capture id an anchor targets, or `undefined` for a non-capture anchor. */
function captureAnchorId(anchor: FoldedFinding["anchor"]): string | undefined {
  if (anchor?.kind === SCREENSHOT_REGION || anchor?.kind === RECORDING_TIMESTAMP) {
    return anchor.capture;
  }
  return undefined;
}

/**
 * The identity drift of a capture-arm Finding (walkthroughs.md §8): `live` while
 * the capture it points at is still placed in a section here, `outdated` once
 * gone — the single live/outdated decision both the inline pins and the detached
 * section route off. `undefined` for a non-capture anchor. Placement, not mere
 * registry membership, is the test: a capture no section renders has nowhere to
 * pin a live Finding, so such Findings detach and surface rather than vanish.
 */
function captureFindingDrift(
  anchor: FoldedFinding["anchor"],
  placedCaptureIds: ReadonlySet<string>,
): DriftState | undefined {
  const id = captureAnchorId(anchor);
  return id === undefined ? undefined : identityDrift(placedCaptureIds.has(id));
}

/**
 * The raw pins for one capture of one arm `kind`: annotations targeting it
 * (numbered `A1…`) then Findings anchored to it (numbered `F1…`). Whether each
 * pin is placed (has a coordinate) or whole-capture is decided by the caller,
 * which reads the coordinate off the anchor.
 */
function rawPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  captureId: string,
  kind: "screenshot-region" | "recording-timestamp",
): RawPin[] {
  const pins: RawPin[] = [];
  let annotationCount = 0;
  for (const annotation of annotations) {
    if (annotation.anchor.kind === kind) {
      annotationCount += 1;
      pins.push({
        anchor: annotation.anchor,
        body: annotation.body,
        label: `A${annotationCount}`,
        tone: ANNOTATION_TONE,
      });
    }
  }
  let findingCount = 0;
  for (const finding of findings) {
    const { anchor } = finding;
    if (anchor?.kind === kind && anchor.capture === captureId) {
      findingCount += 1;
      pins.push({ anchor, body: finding.body, label: `F${findingCount}`, tone: FINDING_TONE });
    }
  }
  return pins;
}

/** Split a capture's screenshot pins into placed region rects and whole-capture callouts. */
function screenshotPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture,
): { regions: RegionPin[]; whole: WholePin[] } {
  const regions: RegionPin[] = [];
  const whole: WholePin[] = [];
  for (const pin of rawPins(annotations, findings, capture.id, SCREENSHOT_REGION)) {
    const rect = pin.anchor.kind === SCREENSHOT_REGION ? pin.anchor.rect : undefined;
    if (rect) {
      regions.push({ body: pin.body, label: pin.label, rect, tone: pin.tone });
    } else {
      whole.push({ body: pin.body, label: pin.label, tone: pin.tone });
    }
  }
  return { regions, whole };
}

/** Split a capture's recording pins into placed timeline markers and whole-capture callouts. */
function recordingPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture,
): { times: TimePin[]; whole: WholePin[] } {
  const times: TimePin[] = [];
  const whole: WholePin[] = [];
  for (const pin of rawPins(annotations, findings, capture.id, RECORDING_TIMESTAMP)) {
    const from = pin.anchor.kind === RECORDING_TIMESTAMP ? pin.anchor.fromMs : undefined;
    const to = pin.anchor.kind === RECORDING_TIMESTAMP ? pin.anchor.toMs : undefined;
    if (from === undefined) {
      whole.push({ body: pin.body, label: pin.label, tone: pin.tone });
    } else {
      times.push({ atMs: from, body: pin.body, label: pin.label, toMs: to, tone: pin.tone });
    }
  }
  return { times, whole };
}

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
function Captions({ pins }: { pins: readonly { body: string; label: string; tone: Tone }[] }) {
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
        {/* A content-addressed capture blob served from the Dossier, not a
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
  const rootRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { times, whole } = recordingPins(annotations, findings, capture);
  const [vw, vh] = capture.viewport;
  const duration = capture.durationMs ?? 0;

  useEffect(() => {
    let cancelled = false;
    let replayer: Replayer | null = null;
    fetchCaptureEvents(captureUrl(walkthroughId, capture.media, "recording"))
      .then((events) => {
        if (cancelled || rootRef.current === null) {
          return;
        }
        replayer = new Replayer(events as eventWithTime[], {
          mouseTail: false,
          root: rootRef.current,
          skipInactive: false,
          speed: 1,
        });
        replayerRef.current = replayer;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      replayer?.destroy();
      replayerRef.current = null;
    };
  }, [walkthroughId, capture.media]);

  function seek(ms: number) {
    replayerRef.current?.play(ms);
  }

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
        <p style={{ fontSize: "0.8rem", opacity: 0.6 }}>Could not load the recording.</p>
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
          <button disabled={!ready} onClick={() => seek(0)} style={buttonStyle} type="button">
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
              <Chip label={pin.label} tone={pin.tone} /> {(pin.atMs / 1000).toFixed(1)}
              {pin.toMs === undefined ? "" : `–${(pin.toMs / 1000).toFixed(1)}`}s
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
 * The annotations in a section that target a given capture id. An annotation's
 * anchor spans the full Finding vocabulary (§7), so a non-capture arm (e.g.
 * text-span) simply never matches a capture id and is skipped here.
 */
function annotationsFor(section: WalkthroughSection, captureId: string): WalkthroughAnnotation[] {
  return (section.annotations ?? []).filter(
    (annotation) => captureAnchorId(annotation.anchor) === captureId,
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
  const active = quotes.filter((quote) => quote.length > 0 && text.includes(quote));
  if (active.length === 0) {
    return <p style={proseStyle}>{text}</p>;
  }
  const nodes: React.ReactNode[] = [];
  let rest = text;
  while (rest.length > 0) {
    let at = -1;
    let quote = "";
    for (const candidate of active) {
      const index = rest.indexOf(candidate);
      if (index !== -1 && (at === -1 || index < at)) {
        at = index;
        quote = candidate;
      }
    }
    if (at === -1) {
      nodes.push(rest);
      break;
    }
    if (at > 0) {
      nodes.push(rest.slice(0, at));
    }
    nodes.push(
      <mark key={`mark:${quote}:${nodes.length}`} style={markStyle}>
        {quote}
      </mark>,
    );
    rest = rest.slice(at + quote.length);
  }
  return <p style={proseStyle}>{nodes}</p>;
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
  const quotes = textSpans.map((finding) =>
    finding.anchor?.kind === TEXT_SPAN ? finding.anchor.quote : "",
  );

  return (
    <section style={{ borderTop: "1px solid rgba(128,128,128,0.2)", padding: "1rem 0" }}>
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
            on “{finding.anchor?.kind === TEXT_SPAN ? finding.anchor.quote : ""}”:{" "}
          </span>
          {finding.body}
        </div>
      ))}
      {segments.map((segment) => {
        if (segment.kind === "prose") {
          return (
            <Prose key={`prose:${segment.text.slice(0, 24)}`} quotes={quotes} text={segment.text} />
          );
        }
        const captureId = captureIds[segment.index] ?? "";
        const capture = captureById(manifest, captureId);
        if (capture === undefined) {
          return (
            <p key={`capture:${segment.index}`} style={{ fontSize: "0.8rem", opacity: 0.6 }}>
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

/** Group narrative (`walkthrough-section`) Findings on this walkthrough by section id. */
function narrativeBySectionId(
  folded: readonly FoldedFinding[],
  walkthroughId: string,
): Map<string, FoldedFinding[]> {
  const bySection = new Map<string, FoldedFinding[]>();
  for (const finding of folded) {
    const { anchor } = finding;
    if (anchor?.kind === "walkthrough-section" && anchor.walkthroughId === walkthroughId) {
      const list = bySection.get(anchor.sectionId) ?? [];
      list.push(finding);
      bySection.set(anchor.sectionId, list);
    }
  }
  return bySection;
}

/** Group `text-span` Findings by the section id they quote into. */
function textSpansBySectionId(folded: readonly FoldedFinding[]): Map<string, FoldedFinding[]> {
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
  captureId: string,
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
    (finding) => captureFindingDrift(finding.anchor, placedCaptureIds) === "outdated",
  );
  if (detached.length === 0) {
    return null;
  }
  return (
    <section style={{ borderTop: "1px solid rgba(128,128,128,0.2)", padding: "1rem 0" }}>
      <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Detached findings</h2>
        <span style={outdatedStyle}>Outdated</span>
      </div>
      <p style={{ fontSize: "0.8rem", opacity: 0.6 }}>
        These Findings point at captures no longer placed in this walkthrough; they render against
        their born capture.
      </p>
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
                <span style={{ opacity: 0.6 }}>capture {captureId} (unavailable): </span>
                {finding.body}
              </div>
            )}
          </div>
        );
      })}
    </section>
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
  const folded = findings.map((finding) => foldFinding(finding.id, finding.records));
  const narrative = narrativeBySectionId(folded, walkthrough.id);
  const textSpans = textSpansBySectionId(folded);
  const captureFindings = folded.filter(
    (finding) =>
      finding.anchor?.kind === SCREENSHOT_REGION || finding.anchor?.kind === RECORDING_TIMESTAMP,
  );

  // Placement, not registry membership, decides identity drift: a capture is
  // rendered only where a section places it, so a Finding is live only if its
  // capture is placed. Registry-but-unplaced captures fall through to
  // DetachedFindings, so their Findings surface rather than vanish (§8).
  const placedCaptureIds = new Set(sections.flatMap((section) => section.captures ?? []));
  const liveCaptureFindings = captureFindings.filter(
    (finding) => captureFindingDrift(finding.anchor, placedCaptureIds) === "live",
  );

  const staleness = walkthroughStaleness(manifest?.bornChangeId ?? "", changes);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "0 1.5rem 3rem" }}>
      <header style={{ padding: "1rem 0" }}>
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>
            {manifest?.title ?? "Product walkthrough"}
          </h1>
          {staleness.stale ? (
            <span style={staleStyle}>
              {staleness.behind} change{staleness.behind === 1 ? "" : "s"} behind
            </span>
          ) : null}
        </div>
      </header>
      {sections.length === 0 ? (
        <p style={{ opacity: 0.7 }}>This walkthrough has no readable sections.</p>
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
