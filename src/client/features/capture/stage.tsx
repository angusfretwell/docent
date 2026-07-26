import { cn } from "@client/lib/utils";
import type { CaptureKind } from "@shared/enums/capture-kind";
import type { ReactNode } from "react";

import type { Zoom } from "./hooks/use-zoom";

/**
 * The overlay sits outside the stage element rather than within it: the zoom
 * gestures are bound to the stage and would otherwise read a drag along the
 * scrubber as a pan. Anything a kind adds floats over as a sibling rather than a
 * row beneath, which would shorten the stage and reseat the capture.
 */
export function CaptureStage({
  children,
  kind,
  overlay,
  zoom,
}: {
  children: ReactNode;
  kind: CaptureKind;
  overlay?: ReactNode;
  zoom: Zoom;
}) {
  const { dragging, stageProps, toggle, zoomable, zoomed } = zoom;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        aria-label={`${zoomed ? "Fit" : "Zoom"} ${kind}`}
        aria-pressed={zoomed}
        // `touch-none` hands every finger to the gesture handlers rather than to
        // the browser's own panning, and the callout is what a long press would
        // otherwise raise over the reconstructed page.
        className={cn(
          "absolute inset-0 touch-none overflow-hidden overscroll-none select-none [-webkit-touch-callout:none]",
          dragging && "cursor-grabbing"
        )}
        onKeyDown={handleKeyDown}
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
