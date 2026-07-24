import { cn } from "@client/lib/utils";
import type { ReactNode } from "react";

import type { Zoom } from "./hooks/use-zoom";

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
