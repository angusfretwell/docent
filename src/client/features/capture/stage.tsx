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
        className={cn(
          "absolute inset-0 overflow-hidden touch-none select-none",
          dragging && "cursor-move"
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
