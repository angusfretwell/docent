import type { InnerZoom } from "@client/hooks/use-inner-zoom";
import { useInnerZoom } from "@client/hooks/use-inner-zoom";
import type { RrwebReplayer } from "@client/hooks/use-rrweb-replayer";
import { useRrwebReplayer } from "@client/hooks/use-rrweb-replayer";
import { useRrwebSnapshot } from "@client/hooks/use-rrweb-snapshot";
import { cn } from "@client/lib/utils";
import type { RegionPin, TimePin } from "@client/lib/walkthrough-pins";
import { recordingPins, screenshotPins } from "@client/lib/walkthrough-pins";
import type { FoldedFinding } from "@shared/lib/finding";
import type {
  Capture,
  WalkthroughAnnotation,
} from "@shared/schemas/walkthrough";
import {
  ChevronDown,
  ChevronUp,
  Globe,
  Pause,
  Play,
  Repeat,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { Pane } from "../pane";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Slider } from "../ui/slider";
import { Toggle } from "../ui/toggle";
import {
  PinChip,
  usePinFocus,
  usePinHover,
  usePinHovered,
} from "../walkthrough/callouts";

/**
 * How the panel names the capture it holds, and how the reader steps off it.
 * Stepping is the tour's own jump — the handlers scroll the prose — so a
 * neighbour the tour can't reach arrives as `undefined` and disables its arrow.
 */
interface CaptionProps {
  label: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

/**
 * The capture itself and everything that pins onto it. `target` is the prose
 * target key this capture is placed under — the other half of a pin's identity,
 * without which a mark can't tell its own callout from a like-labelled one on a
 * different capture.
 */
export interface CaptureProps {
  annotations: readonly WalkthroughAnnotation[];
  capture: Capture;
  findings: readonly FoldedFinding[];
  /**
   * A counter the panel bumps to ask for the whole capture back. A count rather
   * than a flag because asking twice has to read as two requests — a reader who
   * refit, zoomed in again, then asked once more means it both times.
   */
  refitted: number;
  target: string | undefined;
  walkthroughId: string;
}

/**
 * Give the capture back whole whenever the panel asks again. The first count is
 * the one this capture mounted with — a capture arriving is already fitted, and
 * refitting it there would fight the framing a focus request is about to do.
 */
function useRefit(zoom: InnerZoom, refitted: number) {
  const { refit } = zoom;
  const asked = useRef(refitted);

  useEffect(() => {
    if (refitted === asked.current) {
      return;
    }

    asked.current = refitted;
    refit();
  }, [refit, refitted]);
}

function CaptureCaption({
  capture,
  label,
  onNext,
  onPrevious,
}: { capture: Capture } & CaptionProps) {
  const duration = capture.durationMs ?? 0;

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <Group>
        <Button
          aria-label="Previous capture"
          disabled={onPrevious === undefined}
          onClick={onPrevious}
          size="icon-xs"
          variant="outline"
        >
          <ChevronUp />
        </Button>
        <GroupSeparator />
        <Button
          aria-label="Next capture"
          disabled={onNext === undefined}
          onClick={onNext}
          size="icon-xs"
          variant="outline"
        >
          <ChevronDown />
        </Button>
      </Group>

      <span className="shrink-0 flex items-center gap-1.5 text-sm tabular-nums">
        <span>{label}</span>
        {capture.kind === "recording" && duration > 0
          ? ` · ${(duration / 1000).toFixed(1)}s`
          : ""}
      </span>

      <Badge variant="secondary" className="font-mono ml-auto">
        <Globe />
        {capture.route}
      </Badge>
    </div>
  );
}

/**
 * The dotted field a capture is staged on, so a screenshot or replay that does
 * not fill its panel reads as sitting on the stage rather than floating in an
 * empty pane.
 */
const stageBackground = cn(
  "bg-size-[16px_16px]",
  "bg-[radial-gradient(--alpha(var(--color-foreground)/16%)_1px,transparent_1px)]"
);

/**
 * The card the capture is read in: the caption naming what is on the stage, and
 * the dotted field it is staged on. Both belong to the panel rather than to any
 * one capture, so they are rendered once around whichever captures the panel is
 * holding — stepping from one to the next moves only what is on the stage, and
 * the frame around it never blinks.
 *
 * Captures are placed into `children` as siblings filling the stage, which is
 * what lets one dissolve into another over a field that never moves.
 */
export function CaptureFrame({
  capture,
  children,
  ...caption
}: { capture: Capture; children: React.ReactNode } & CaptionProps) {
  return (
    <Pane>
      <CaptureCaption capture={capture} {...caption} />

      <div className={cn("relative min-h-0 flex-1", stageBackground)}>
        {children}
      </div>
    </Pane>
  );
}

/**
 * The area a capture is fitted into, shared by both kinds so that stepping
 * between a screenshot and a recording of the same size leaves the capture where
 * it was. `useInnerZoom` fits and centres against the stage it measures, so
 * anything a kind adds — a replay's transport — floats over the stage as a
 * sibling rather than taking a row beneath it: a row shortens the stage for that
 * kind alone, which is enough to rescale and reseat the capture.
 *
 * The stage is transparent: the field it appears to sit on is painted once by
 * `CaptureFrame`, behind every capture the panel is holding at the time. What is
 * measured here is only the box, which each capture needs one of to have its own
 * zoom bound to and fitted against.
 *
 * The overlay sits outside the stage rather than within it because the zoom
 * gestures are bound to the stage element and would otherwise read a drag along
 * the scrubber as a pan.
 */
function CaptureStage({
  children,
  kind,
  overlay,
  zoom,
}: {
  children: React.ReactNode;
  kind: "recording" | "screenshot";
  overlay?: React.ReactNode;
  zoom: InnerZoom;
}) {
  const { dragging, stageProps, toggle, zoomable, zoomed } = zoom;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        aria-label={`${zoomed ? "Fit" : "Zoom"} ${kind}`}
        aria-pressed={zoomed}
        className={cn(
          "absolute inset-0 overflow-hidden touch-none select-none",
          dragging && "cursor-move"
        )}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={zoomable ? 0 : -1}
        {...stageProps}
      >
        {children}
      </div>

      {overlay}
    </div>
  );
}

/**
 * One region mark on a screenshot. Its rect comes from the anchor as fractions
 * of the capture, so the overlay is positioned in percentages of the wrapper and
 * survives any resize. The mark shows its label only while the pin is hovered —
 * from here or from the callout in the prose — so an unread capture isn't
 * covered in chips. Clicking it frames the region, the same act as clicking its
 * callout, since both go through the shared pin focus.
 */
function RegionOverlay({
  pin,
  target,
}: {
  pin: RegionPin;
  target: string | undefined;
}) {
  const { active, onClick, onPointerEnter, onPointerLeave } = usePinHover(
    target,
    pin.label
  );

  return (
    <button
      aria-label={`Frame ${pin.label}: ${pin.body}`}
      className={cn(
        "absolute block rounded-xs outline-2 outline-offset-2 cursor-pointer",
        active ? "rounded-bl-none outline-primary" : "outline-primary/50"
      )}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{
        height: `${pin.rect[3] * 100}%`,
        left: `${pin.rect[0] * 100}%`,
        top: `${pin.rect[1] * 100}%`,
        width: `${pin.rect[2] * 100}%`,
      }}
      type="button"
    >
      <PinChip
        className={cn(
          "absolute -bottom-4.5 -left-1 rounded-tl-none ",
          active ? "opacity-100" : "opacity-0"
        )}
        label={pin.label}
      />
    </button>
  );
}

/**
 * One screenshot: the full-page blob served from the walkthrough's own
 * `captures/` dir, held in a stage that clips it rather than at its natural
 * size — the same framing as a recording, so switching between the two kinds
 * doesn't shift the frame. Clicking the stage zooms the capture to the size it
 * was taken at and drags it around, which is how a full-page screenshot gets
 * read: fitted into a panel it is far too small for its own text.
 *
 * The frame holds reconstructed DOM rather than an image (walkthroughs.md §6),
 * so the zoom scales it by transform: a still frame is real text and stays sharp
 * however far in the reader pushes it, which is the whole reason the blob is an
 * rrweb snapshot rather than a PNG.
 *
 * Normalized `rect` coordinates (0..1) position each pin as percentages of the
 * frame, so the frame must be exactly the rendered capture on both axes — any
 * slack it takes beyond it is slack the pins are measured against, which
 * stretches and displaces them on whichever axis the capture does not fill. Both
 * the fitted and the zoomed size therefore come from `useInnerZoom` as explicit
 * pixels.
 */
function ScreenshotCapture({
  annotations,
  capture,
  findings,
  refitted,
  target,
  walkthroughId,
}: CaptureProps) {
  const regions = screenshotPins(annotations, findings, capture);
  const natural = capture.dims ?? capture.viewport;
  const zoom = useInnerZoom(natural);
  const { frameRect, frameStyle, measured, scale } = zoom;

  useRefit(zoom, refitted);

  const { failed, rootRef } = useRrwebSnapshot(
    walkthroughId,
    capture.media,
    natural
  );
  const [naturalWidth, naturalHeight] = natural;

  // A focus request can arrive from either column, and repeatedly for the same
  // pin, so the nonce it carries is what marks one as served — depending on the
  // request object alone would re-frame on any unrelated re-render and fight a
  // reader who had since zoomed by hand.
  //
  // A request stands rather than expiring, so one made against a capture that
  // wasn't on the panel is still waiting when this mounts to answer it.
  const focused = usePinFocus();
  const served = useRef(-1);

  useEffect(() => {
    if (focused === undefined || focused.nonce === served.current) {
      return;
    }

    if (focused.key.target !== target) {
      return;
    }

    // Framing is measured against the stage, so a request that arrives with this
    // capture mounting has to wait a beat for one to measure — leaving the nonce
    // unserved is what brings the effect back when it has.
    if (!measured) {
      return;
    }

    const pin = regions.find((region) => region.label === focused.key.label);

    if (pin === undefined) {
      return;
    }

    served.current = focused.nonce;
    frameRect(pin.rect);
  }, [focused, frameRect, measured, regions, target]);

  return (
    <>
      <CaptureStage kind="screenshot" zoom={zoom}>
        <div className="absolute ring ring-border" style={frameStyle}>
          {/* As on a replay, rrweb reconstructs the recorded DOM but not the
              browser's default canvas, so a page that sets no background of its
              own would render transparent onto the stage. */}
          <div
            aria-label={`Screenshot of ${capture.route}`}
            className="h-full w-full overflow-hidden bg-white"
            role="img"
          >
            <div
              ref={rootRef}
              style={{
                height: `${naturalHeight}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: `${naturalWidth}px`,
              }}
            />
          </div>

          {regions.map((pin) => (
            <RegionOverlay key={pin.label} pin={pin} target={target} />
          ))}
        </div>
      </CaptureStage>

      {failed ? (
        <p className="shrink-0 border-t bg-card p-3 text-[13px] text-muted-foreground">
          Could not load the screenshot.
        </p>
      ) : null}
    </>
  );
}

/** `m:ss` for a millisecond offset — recordings are short, so no hours. */
function formatOffset(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);

  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/**
 * The scrubber's position. `Slider` is typed for range sliders as well as
 * single-thumb ones, so its handlers hand back a union this one thumb can't be.
 */
function offsetOf(value: number | readonly number[]) {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

/** How long a pointer settles on a callout before the replay answers it. */
const PEEK_DWELL_MS = 200;

/** Where the transport would be found had nothing borrowed it. */
interface PeekResume {
  currentMs: number;
  playing: boolean;
}

/**
 * Hovering a recording's callout has the replay demonstrate it: a span loops
 * within itself, a bare timestamp holds on its frame. The transport is borrowed
 * rather than seized — where the playhead was and whether it was running are
 * given back when the pointer leaves, so brushing past a callout on the way down
 * the prose cannot cost a reader their place. A dwell keeps a pointer merely
 * passing through from yanking the playhead at all.
 *
 * Clicking commits instead. The focus request the screenshot arm reads as "frame
 * this region" reads here as "keep me here", and the restore is abandoned — and
 * where the click arrived from another capture's callout, with no dwell to have
 * borrowed the transport in the first place, it does the demonstrating itself.
 */
function useRecordingPeek(
  replay: RrwebReplayer,
  pins: readonly TimePin[],
  target: string | undefined
) {
  const { currentMs, pause, play, playing, ready, seek, setLoop } = replay;

  const hovered = usePinHovered();
  const focused = usePinFocus();

  const peekRef = useRef<{ committed: boolean; resume: PeekResume } | null>(
    null
  );
  const resumeRef = useRef<PeekResume>({ currentMs: 0, playing: false });

  /* Frozen for the duration of a peek: the loop drives the playhead itself, so
     tracking it through one would overwrite the very position to give back. */
  useEffect(() => {
    if (peekRef.current === null) {
      resumeRef.current = { currentMs, playing };
    }
  });

  const release = useCallback(() => {
    const peek = peekRef.current;

    if (peek === null) {
      return;
    }

    peekRef.current = null;

    if (peek.committed) {
      return;
    }

    setLoop(undefined);

    /* `seek` keeps play/pause as it finds it, so the resumed state has to be in
       place before the playhead moves — otherwise a peek that paused would seek
       the reader's position and leave it stranded there. */
    if (peek.resume.playing) {
      seek(peek.resume.currentMs);
      play();
    } else {
      pause();
      seek(peek.resume.currentMs);
    }
  }, [pause, play, seek, setLoop]);

  const engage = useCallback(
    (atMs: number, toMs: number | undefined) => {
      peekRef.current ??= { committed: false, resume: resumeRef.current };

      if (toMs === undefined) {
        setLoop(undefined);
        pause();
        seek(atMs);
        return;
      }

      setLoop([atMs, toMs]);
      seek(atMs);
      play();
    },
    [pause, play, seek, setLoop]
  );

  /* Keyed on the offsets rather than the pin, which is rebuilt on every render:
     depending on its identity would restart the dwell before it ever elapsed. */
  const pin =
    hovered === undefined || hovered.target !== target
      ? undefined
      : pins.find((candidate) => candidate.label === hovered.label);
  const atMs = pin?.atMs;
  const toMs = pin?.toMs;

  useEffect(() => {
    if (atMs === undefined) {
      release();
      return;
    }

    const dwell = setTimeout(() => engage(atMs, toMs), PEEK_DWELL_MS);

    return () => clearTimeout(dwell);
  }, [atMs, engage, release, toMs]);

  const served = useRef(-1);

  useEffect(() => {
    if (focused === undefined || focused.nonce === served.current) {
      return;
    }

    if (focused.key.target !== target) {
      return;
    }

    // Nothing can be demonstrated on a transport that has no recording behind it
    // yet, so the request stands until the replay is loaded.
    if (!ready) {
      return;
    }

    served.current = focused.nonce;

    // Clicking a callout of a recording that wasn't on the panel brings it on
    // with no pointer ever having reached it, so the request does the seeking a
    // dwell would otherwise have done.
    if (peekRef.current === null) {
      const asked = pins.find(
        (candidate) => candidate.label === focused.key.label
      );

      if (asked === undefined) {
        return;
      }

      engage(asked.atMs, asked.toMs);
    }

    const peek = peekRef.current;

    if (peek !== null) {
      peek.committed = true;
    }
  }, [engage, focused, pins, ready, target]);
}

/**
 * The replay's transport: play/pause, a scrubber over the whole recording, and
 * the repeat toggle. The scrubber seeks on every change and leaves play/pause
 * alone, so the replay tracks the pointer through a drag and cannot be left
 * stranded in a state the pointer-up was supposed to undo.
 *
 * Driving the transport by hand frees a span a callout confined it to: having
 * asked to be somewhere else, the reader should not be pulled back on the next
 * lap.
 *
 * It floats over the foot of the stage rather than sitting in a row below it, so
 * a recording and a screenshot are fitted into the same area and stepping from
 * one to the other doesn't move the capture.
 */
function RecordingControls({ replay }: { replay: RrwebReplayer }) {
  const {
    currentMs,
    durationMs,
    pause,
    play,
    playing,
    ready,
    repeat,
    seek,
    setLoop,
    setRepeat,
  } = replay;

  function handleScrub(value: number | readonly number[]) {
    setLoop(undefined);
    seek(offsetOf(value));
  }

  function handleTransport() {
    setLoop(undefined);

    if (playing) {
      pause();
    } else {
      play();
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
      <div
        className={cn(
          "flex w-full max-w-lg items-center gap-2 p-1.5",
          "relative rounded-xl border bg-popover/80 backdrop-blur-xl not-dark:bg-clip-padding text-popover-foreground shadow-lg/5 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)]"
        )}
      >
        <Button
          aria-label={playing ? "Pause recording" : "Play recording"}
          disabled={!ready}
          onClick={handleTransport}
          size="icon-sm"
          variant="ghost"
        >
          {playing ? (
            <Pause className="fill-current stroke-0" />
          ) : (
            <Play className="fill-current stroke-0" />
          )}
        </Button>

        {/* The slider sizes itself to fill its row and carries a min-width for
            standalone use; in a narrow panel that pushes the repeat toggle out
            of the frame, so both are relaxed to let it take only the slack
            left. */}
        <Slider
          aria-label="Recording position"
          className="min-w-0 flex-1 [&_[data-slot=slider-control]]:min-w-0"
          disabled={!ready}
          max={durationMs}
          min={0}
          onValueChange={handleScrub}
          step={100}
          value={currentMs}
        />

        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {formatOffset(currentMs)} / {formatOffset(durationMs)}
        </span>

        <Toggle
          aria-label="Repeat recording"
          onPressedChange={setRepeat}
          pressed={repeat}
          size="sm"
        >
          <Repeat />
        </Toggle>
      </div>
    </div>
  );
}

/**
 * One recording: a self-contained rrweb replay of the captured session
 * (walkthroughs.md §6). The event stream is fetched from the content-addressed
 * `captures/<sha>.rrweb.json` blob and handed to rrweb's `Replayer`, which
 * reconstructs the DOM with no further network.
 *
 * Recording-timestamp pins carry no mark of their own: a moment in a recording
 * has nowhere on the frame to sit, and a tick on the scrubber says only that
 * something is there. They are read from the prose instead, which has the room
 * to say what the moment is — and dwelling on one plays it.
 *
 * rrweb reconstructs the DOM at the recorded viewport size and never scales it
 * (scale-to-fit is an rrweb-player feature), so the mount is sized and scaled
 * here — by the same `useInnerZoom` the screenshot arm uses, which makes a
 * replay shrunk to fit its panel readable at the size it was recorded at.
 */
function RecordingCapture({
  annotations,
  capture,
  findings,
  refitted,
  target,
  walkthroughId,
}: CaptureProps) {
  const replay = useRrwebReplayer(walkthroughId, capture.media);
  const { rootRef } = replay;
  const pins = recordingPins(annotations, findings, capture);

  useRecordingPeek(replay, pins, target);

  const zoom = useInnerZoom(capture.viewport);
  const { frameStyle, scale } = zoom;

  useRefit(zoom, refitted);

  const [viewportWidth, viewportHeight] = capture.viewport;

  return (
    <>
      <CaptureStage
        kind="recording"
        overlay={
          replay.failed ? undefined : <RecordingControls replay={replay} />
        }
        zoom={zoom}
      >
        <div
          // rrweb reconstructs the recorded DOM but not the browser's default
          // canvas, so a page that sets no background of its own replays
          // transparent and lets the stage show through.
          className="absolute overflow-hidden bg-white ring ring-border"
          style={frameStyle}
        >
          <div
            // The replay is played, not used, so nothing inside it needs the
            // pointer — and the reconstructed page is an iframe, which would
            // otherwise swallow every drag and wheel before the stage saw it.
            //
            // `--replay-scale` is what the cursor counter-scales by, so it
            // stays legible on a stage the replay had to shrink to fit.
            className="replay-cursor pointer-events-none"
            ref={rootRef}
            style={
              {
                "--replay-scale": scale,
                height: `${viewportHeight}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: `${viewportWidth}px`,
              } as React.CSSProperties
            }
          />
        </div>
      </CaptureStage>

      {replay.failed ? (
        <p className="shrink-0 border-t bg-card p-3 text-[13px] text-muted-foreground">
          Could not load the recording.
        </p>
      ) : null}
    </>
  );
}

/**
 * Route a capture to the screenshot embed or the rrweb replay. Both fill the
 * stage they are given rather than carrying a frame of their own, so a panel can
 * hold more than one at a time — which is what a dissolve between two of them
 * needs.
 */
export function CaptureView({ capture, ...props }: CaptureProps) {
  if (capture.kind === "recording") {
    return <RecordingCapture capture={capture} {...props} />;
  }

  return <ScreenshotCapture capture={capture} {...props} />;
}
