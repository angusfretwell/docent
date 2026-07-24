import { Pane } from "@client/components/pane";
import { Badge } from "@client/components/ui/badge";
import { Button } from "@client/components/ui/button";
import { Group, GroupSeparator } from "@client/components/ui/group";
import { cn } from "@client/lib/utils";
import type { FoldedFinding } from "@shared/lib/finding";
import type {
  Capture,
  WalkthroughAnnotation,
} from "@shared/schemas/walkthrough";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import prettyMilliseconds from "pretty-ms";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import type { Zoom } from "./hooks/use-zoom";

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
export function useRefit(zoom: Zoom, refitted: number) {
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
          ? ` · ${prettyMilliseconds(duration, { secondsDecimalDigits: 1 })}`
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
}: { capture: Capture; children: ReactNode } & CaptionProps) {
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
 * it was. `useZoom` fits and centres against the stage it measures, so
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
export function CaptureStage({
  children,
  kind,
  overlay,
  zoom,
}: {
  children: ReactNode;
  kind: "recording" | "screenshot";
  overlay?: ReactNode;
  zoom: Zoom;
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
