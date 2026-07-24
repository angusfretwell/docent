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
 * the fitted and the zoomed size therefore come from `useZoom` as explicit
 * pixels.
 */
export function ScreenshotCapture({
  annotations,
  capture,
  findings,
  refitted,
  target,
  walkthroughId,
}: CaptureProps) {
  const regions = screenshotPins(annotations, findings, capture);
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
        {/* rrweb rebuilds the snapshot a beat after the blob loads, so a cold
            capture would otherwise pop in; fading on `ready` lands it the same
            way a step between two captures dissolves. */}
        <div
          className={cn(
            "absolute ring ring-border transition-opacity duration-75 motion-reduce:transition-none",
            ready ? "opacity-100" : "opacity-0"
          )}
          style={frameStyle}
        >
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

          {/* Pins are percentages of the frame, which is 0×0 until the stage is
              measured — rendering them before then collapses every mark into the
              stage's top-left corner for a frame. */}
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
