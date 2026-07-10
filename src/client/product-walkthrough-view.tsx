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
import type { ChangeRecord, FindingEntry, WalkthroughEntry } from "../shared/dossier.ts";
import { foldFinding } from "../shared/finding.ts";
import type { FoldedFinding } from "../shared/finding.ts";
import {
  captureById,
  identityDrift,
  interleaveCaptureSegments,
  walkthroughStaleness,
} from "../shared/walkthrough.ts";
import type { Capture, WalkthroughAnnotation, WalkthroughSection } from "../shared/walkthrough.ts";
import { captureUrl, fetchCaptureEvents } from "./blobs.ts";

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

// The two capture anchor arms, named once so narrowing and filters read one token.
const SCREENSHOT_REGION = "screenshot-region";
const RECORDING_TIMESTAMP = "recording-timestamp";

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

/** The overlay pins for one screenshot: region rects (with a coordinate) get placed. */
function screenshotPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture,
): { regions: RegionPin[]; whole: WholePin[] } {
  const regions: RegionPin[] = [];
  const whole: WholePin[] = [];
  let n = 0;
  for (const annotation of annotations) {
    const { anchor } = annotation;
    if (anchor.kind !== SCREENSHOT_REGION) {
      continue;
    }
    n += 1;
    const label = `A${n}`;
    if (anchor.rect) {
      regions.push({ body: annotation.body, label, rect: anchor.rect, tone: ANNOTATION_TONE });
    } else {
      whole.push({ body: annotation.body, label, tone: ANNOTATION_TONE });
    }
  }
  let f = 0;
  for (const finding of findings) {
    const { anchor } = finding;
    if (!(anchor?.kind === SCREENSHOT_REGION && anchor.capture === capture.id)) {
      continue;
    }
    f += 1;
    const label = `F${f}`;
    if (anchor.rect) {
      regions.push({ body: finding.body, label, rect: anchor.rect, tone: FINDING_TONE });
    } else {
      whole.push({ body: finding.body, label, tone: FINDING_TONE });
    }
  }
  return { regions, whole };
}

/** The timeline pins for one recording: timestamp markers (with a coordinate) get placed. */
function recordingPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture,
): { times: TimePin[]; whole: WholePin[] } {
  const times: TimePin[] = [];
  const whole: WholePin[] = [];
  let n = 0;
  for (const annotation of annotations) {
    const { anchor } = annotation;
    if (anchor.kind !== RECORDING_TIMESTAMP) {
      continue;
    }
    n += 1;
    const label = `A${n}`;
    if (anchor.fromMs === undefined) {
      whole.push({ body: annotation.body, label, tone: ANNOTATION_TONE });
    } else {
      times.push({
        atMs: anchor.fromMs,
        body: annotation.body,
        label,
        toMs: anchor.toMs,
        tone: ANNOTATION_TONE,
      });
    }
  }
  let f = 0;
  for (const finding of findings) {
    const { anchor } = finding;
    if (!(anchor?.kind === RECORDING_TIMESTAMP && anchor.capture === capture.id)) {
      continue;
    }
    f += 1;
    const label = `F${f}`;
    if (anchor.fromMs === undefined) {
      whole.push({ body: finding.body, label, tone: FINDING_TONE });
    } else {
      times.push({
        atMs: anchor.fromMs,
        body: finding.body,
        label,
        toMs: anchor.toMs,
        tone: FINDING_TONE,
      });
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
              <Chip label={pin.label} tone={pin.tone} /> {(pin.atMs / 1000).toFixed(1)}s
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
            on “{finding.anchor?.kind === "text-span" ? finding.anchor.quote : ""}”:{" "}
          </span>
          {finding.body}
        </div>
      ))}
      {segments.map((segment) => {
        if (segment.kind === "prose") {
          return (
            <p key={`prose:${segment.text.slice(0, 24)}`} style={proseStyle}>
              {segment.text}
            </p>
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
    if (anchor?.kind === "text-span") {
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
  shownCaptureIds,
}: {
  findings: readonly FoldedFinding[];
  walkthroughs: readonly WalkthroughEntry[];
  shownCaptureIds: ReadonlySet<string>;
}) {
  const detached = findings.filter(
    (finding) =>
      (finding.anchor?.kind === SCREENSHOT_REGION ||
        finding.anchor?.kind === RECORDING_TIMESTAMP) &&
      !shownCaptureIds.has(finding.anchor.capture),
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
        These Findings point at captures superseded by a later walkthrough; they render against
        their born capture.
      </p>
      {detached.map((finding) => {
        const captureId =
          finding.anchor?.kind === SCREENSHOT_REGION || finding.anchor?.kind === RECORDING_TIMESTAMP
            ? finding.anchor.capture
            : "";
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

  const shownCaptureIds = new Set((manifest?.captures ?? []).map((capture) => capture.id));
  // Live-by-identity: a capture Finding whose capture still exists here
  // (identityDrift → live). Outdated ones fall through to DetachedFindings.
  const liveCaptureFindings = captureFindings.filter(
    (finding) =>
      finding.anchor !== undefined &&
      (finding.anchor.kind === SCREENSHOT_REGION || finding.anchor.kind === RECORDING_TIMESTAMP) &&
      identityDrift(shownCaptureIds.has(finding.anchor.capture)) === "live",
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
        shownCaptureIds={shownCaptureIds}
        walkthroughs={walkthroughs}
      />
    </div>
  );
}
