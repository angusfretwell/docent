import { Button } from "@client/components/ui/button";
import { Slider } from "@client/components/ui/slider";
import { Toggle } from "@client/components/ui/toggle";
import { cn } from "@client/lib/utils";
import { Pause, Play, Repeat } from "lucide-react";
import prettyMilliseconds from "pretty-ms";

import type { CaptureProps } from "./frame";
import { CaptureStage, useRefit } from "./frame";
import { useZoom } from "./hooks/use-zoom";
import { useRecordingPeek } from "./hooks/use-recording-peek";
import type { RrwebReplayer } from "./hooks/use-rrweb-replayer";
import { useRrwebReplayer } from "./hooks/use-rrweb-replayer";
import { recordingPins } from "./lib/pins";

/**
 * A recording's playhead offset as `m:ss`. `secondsDecimalDigits: 0` holds it to
 * whole seconds because the scrubber reads it every animation frame, and the
 * tenths `colonNotation` shows by default would flicker the readout as it runs.
 */
function formatOffset(ms: number) {
  return prettyMilliseconds(ms, {
    colonNotation: true,
    secondsDecimalDigits: 0,
  });
}

/**
 * The scrubber's position. `Slider` is typed for range sliders as well as
 * single-thumb ones, so its handlers hand back a union this one thumb can't be.
 */
function offsetOf(value: number | readonly number[]) {
  return typeof value === "number" ? value : (value[0] ?? 0);
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
 * here — by the same `useZoom` the screenshot arm uses, which makes a
 * replay shrunk to fit its panel readable at the size it was recorded at.
 */
export function RecordingCapture({
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

  const zoom = useZoom(capture.viewport);
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
