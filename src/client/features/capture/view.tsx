import type { FoldedFinding } from "@shared/lib/finding";
import type { WalkthroughId } from "@shared/schemas/ids";
import type {
  Capture,
  WalkthroughAnnotation,
} from "@shared/schemas/walkthrough";

import { RecordingCapture } from "./recording";
import { ScreenshotCapture } from "./screenshot";

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
  walkthroughId: WalkthroughId;
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
