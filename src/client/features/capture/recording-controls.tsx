import { Button } from "@client/components/ui/button";
import { Slider } from "@client/components/ui/slider";
import { Toggle } from "@client/components/ui/toggle";
import { cn } from "@client/lib/utils";
import { Pause, Play, Repeat } from "lucide-react";
import prettyMilliseconds from "pretty-ms";

import type { RrwebReplayer } from "./hooks/use-rrweb-replayer";

/**
 * `secondsDecimalDigits: 0` holds it to whole seconds: the scrubber reads it
 * every frame, and the default tenths would flicker the readout.
 */
function formatOffset(ms: number) {
  return prettyMilliseconds(ms, {
    colonNotation: true,
    secondsDecimalDigits: 0,
  });
}

/** `Slider` is typed for range sliders too, so its handlers hand back a union this single thumb can't be. */
function offsetOf(value: number | readonly number[]) {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

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
          "relative rounded-xl border bg-popover/80 text-popover-foreground shadow-lg/5 backdrop-blur-xl not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)]"
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

        {/* The Slider's default min-width pushes the repeat toggle out of a
            narrow panel, so both are relaxed to min-w-0 to take only the slack
            left. */}
        <Slider
          aria-label="Recording position"
          className="min-w-0 flex-1 [&_[data-slot=slider-control]]:min-w-0"
          disabled={!ready}
          // `durationMs` is 0 until the recording's length lands, and Base UI's
          // Slider requires `max > min` — floor it so the disabled scrubber
          // doesn't warn.
          max={Math.max(durationMs, 1)}
          min={0}
          onValueChange={handleScrub}
          step={100}
          value={currentMs}
        />

        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
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
