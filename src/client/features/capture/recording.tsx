import { useRecordingPeek } from "./hooks/use-recording-peek";
import { useRefit } from "./hooks/use-refit";
import { useRrwebReplayer } from "./hooks/use-rrweb-replayer";
import { useZoom } from "./hooks/use-zoom";
import { recordingPins } from "./lib/pins";
import { RecordingControls } from "./recording-controls";
import { CaptureStage } from "./stage";
import type { CaptureProps } from "./view";

/**
 * One recording: a self-contained rrweb replay of the captured session
 * (walkthroughs.md §6). The event stream is fetched from the content-addressed
 * `captures/<sha>.rrweb.json` blob and handed to rrweb's `Replayer`, which
 * reconstructs the DOM with no further network.
 *
 * Recording-timestamp pins carry no mark of their own: a moment in a recording
 * has nowhere on the frame to sit, and a tick on the scrubber says only that
 * something is there. They are read from the prose instead, which has the room
 * to say what the moment is — and dwelling on one plays it.
 *
 * rrweb reconstructs the DOM at the recorded viewport size and never scales it
 * (scale-to-fit is an rrweb-player feature), so the mount is sized and scaled
 * here — by the same `useZoom` the screenshot arm uses, which makes a
 * replay shrunk to fit its panel readable at the size it was recorded at.
 */
export function RecordingCapture({
  annotations,
  capture,
  findings,
  refitted,
  target,
  walkthroughId,
}: CaptureProps) {
  const replay = useRrwebReplayer(walkthroughId, capture.media);
  const { rootRef } = replay;
  const pins = recordingPins(annotations, findings, capture);

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
          // canvas, so a page that sets no background of its own replays
          // transparent and lets the stage show through.
          className="absolute overflow-hidden bg-white ring ring-border"
          style={frameStyle}
        >
          <div
            // The replay is played, not used, so nothing inside it needs the
            // pointer — and the reconstructed page is an iframe, which would
            // otherwise swallow every drag and wheel before the stage saw it.
            //
            // `--replay-scale` is what the cursor counter-scales by, so it
            // stays legible on a stage the replay had to shrink to fit.
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
