import type { CaptureProps } from "./capture-frame";
import { RecordingCapture } from "./capture-recording";
import { ScreenshotCapture } from "./capture-screenshot";

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
