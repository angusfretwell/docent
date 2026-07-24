import type { FoldedComment } from "@shared/lib/comment";
import type { WalkthroughId } from "@shared/schemas/ids";
import type {
  Capture,
  WalkthroughAnnotation,
} from "@shared/schemas/walkthrough";

import { RecordingCapture } from "./recording";
import { ScreenshotCapture } from "./screenshot";

export interface CaptureProps {
  annotations: readonly WalkthroughAnnotation[];
  capture: Capture;
  comments: readonly FoldedComment[];
  /**
   * A counter, not a flag: asking twice must read as two requests — a reader who
   * refit, zoomed in, then asked again means it both times.
   */
  refitted: number;
  target: string | undefined;
  walkthroughId: WalkthroughId;
}

export function CaptureView({ capture, ...props }: CaptureProps) {
  if (capture.kind === "recording") {
    return <RecordingCapture capture={capture} {...props} />;
  }

  return <ScreenshotCapture capture={capture} {...props} />;
}
