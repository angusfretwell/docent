import { Button } from "@client/components/ui/button";
import { Slider } from "@client/components/ui/slider";
import { Toggle } from "@client/components/ui/toggle";
import { cn } from "@client/lib/utils";
import { Pause, Play, Repeat } from "lucide-react";
import prettyMilliseconds from "pretty-ms";

import type { RrwebReplayer } from "./hooks/use-rrweb-replayer";

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
export function RecordingControls({ replay }: { replay: RrwebReplayer }) {
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
          // `durationMs` is 0 until the replayer reports the recording's length,
          // and Base UI's Slider requires `max > min`. Floor it so the disabled
          // scrubber doesn't warn on the first frame before the duration lands.
          max={Math.max(durationMs, 1)}
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
