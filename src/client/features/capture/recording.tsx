import { useRecordingPeek } from "./hooks/use-recording-peek";
import { useRefit } from "./hooks/use-refit";
import { useRrwebReplayer } from "./hooks/use-rrweb-replayer";
import { useZoom } from "./hooks/use-zoom";
import { recordingPins } from "./lib/pins";
import { RecordingControls } from "./recording-controls";
import { CaptureStage } from "./stage";
import type { CaptureProps } from "./view";

/**
 * rrweb reconstructs the DOM at the recorded viewport size and never scales it
 * (scale-to-fit is an rrweb-player feature), so the mount is sized and scaled
 * here by the same `useZoom` the screenshot arm uses.
 */
export function RecordingCapture({
  callouts,
  capture,
  comments,
  refitted,
  target,
  walkthroughId,
}: CaptureProps) {
  const replay = useRrwebReplayer(walkthroughId, capture.media);
  const { rootRef } = replay;
  const pins = recordingPins(callouts, comments, capture);

  useRecordingPeek(replay, pins, target);

  const zoom = useZoom(capture.viewport);
  const { frameStyle, scale } = zoom;

  useRefit(zoom, refitted);

  const [viewportWidth, viewportHeight] = capture.viewport;

  return (
    <>
      <CaptureStage
        kind="recording"
        overlay={
          replay.failed ? undefined : <RecordingControls replay={replay} />
        }
        zoom={zoom}
      >
        <div
          // rrweb reconstructs the recorded DOM but not the browser's default
          // canvas, so a page with no background of its own replays transparent.
          className="absolute overflow-hidden bg-white ring ring-border"
          style={frameStyle}
        >
          <div
            // The reconstructed page is an iframe that would otherwise swallow
            // every drag and wheel before the stage saw it. `--replay-scale` is
            // what the cursor counter-scales by, to stay legible on a shrunk
            // stage.
            className="replay-cursor pointer-events-none"
            ref={rootRef}
            style={
              {
                "--replay-scale": scale,
                height: `${viewportHeight}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: `${viewportWidth}px`,
              } as React.CSSProperties
            }
          />
        </div>
      </CaptureStage>

      {replay.failed ? (
        <p className="shrink-0 border-t bg-card p-3 text-[13px] text-muted-foreground">
          Could not load the recording.
        </p>
      ) : null}
    </>
  );
}
