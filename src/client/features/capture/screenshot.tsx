import { PinChip } from "@client/features/walkthrough/chips";
import { cn } from "@client/lib/utils";
import { useEffect, useRef } from "react";

import { usePinFocus, usePinHover } from "./hooks/use-pin-hover";
import { useRefit } from "./hooks/use-refit";
import { useRrwebSnapshot } from "./hooks/use-rrweb-snapshot";
import { useZoom } from "./hooks/use-zoom";
import type { RegionPin } from "./lib/pins";
import { screenshotPins } from "./lib/pins";
import { CaptureStage } from "./stage";
import type { CaptureProps } from "./view";

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
        "absolute block cursor-pointer rounded-xs outline-2 outline-offset-2",
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
          "absolute -bottom-4.5 -left-1 rounded-tl-none",
          active ? "opacity-100" : "opacity-0"
        )}
        label={pin.label}
      />
    </button>
  );
}

/**
 * Pins are positioned as percentages of the frame, so the frame must be exactly
 * the rendered capture on both axes — otherwise the marks stretch off their
 * regions. Both the fitted and zoomed sizes come from `useZoom` as explicit
 * pixels.
 */
export function ScreenshotCapture({
  callouts,
  capture,
  comments,
  ordinal,
  refitted,
  target,
  walkthroughId,
}: CaptureProps) {
  const regions = screenshotPins(callouts, comments, capture, ordinal);
  const natural = capture.dims ?? capture.viewport;
  const zoom = useZoom(natural);
  const { frameRect, frameStyle, measured, scale } = zoom;

  useRefit(zoom, refitted);

  const { failed, ready, rootRef } = useRrwebSnapshot(
    walkthroughId,
    capture.media,
    natural
  );
  const [naturalWidth, naturalHeight] = natural;

  // The nonce marks a request served: depending on the request object alone
  // would re-frame on any re-render and fight a reader who has since zoomed by
  // hand. A request stands rather than expiring, so one made against a capture
  // not yet mounted is still waiting when this mounts.
  const focused = usePinFocus();
  const served = useRef(-1);

  useEffect(() => {
    if (focused === undefined || focused.nonce === served.current) {
      return;
    }

    if (focused.key.target !== target) {
      return;
    }

    // Framing is measured against the stage, so a request arriving as this
    // capture mounts waits — leaving the nonce unserved brings the effect back
    // once measured.
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
        {/* rrweb rebuilds the snapshot a beat after the blob loads, so fading on
            `ready` lands it rather than popping in. */}
        <div
          className={cn(
            "absolute ring ring-border transition-opacity duration-75 motion-reduce:transition-none",
            ready ? "opacity-100" : "opacity-0"
          )}
          style={frameStyle}
        >
          {/* rrweb reconstructs the recorded DOM but not the browser's default
              canvas, so a page with no background of its own would render
              transparent. */}
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

          {/* Pins are percentages of the frame, which is 0×0 until measured —
              rendering them before then collapses every mark into the top-left
              for a frame. */}
          {measured
            ? regions.map((pin) => (
                <RegionOverlay key={pin.label} pin={pin} target={target} />
              ))
            : null}
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
