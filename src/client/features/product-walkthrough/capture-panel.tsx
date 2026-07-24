import { Empty } from "@client/components/empty";
import { CaptureFrame } from "@client/features/capture/frame";
import { annotationsFor } from "@client/features/capture/lib/pins";
import { CaptureView } from "@client/features/capture/view";
import type { PlacedCapture } from "@client/features/walkthrough/lib/walkthrough";
import { captureLabel } from "@client/features/walkthrough/lib/walkthrough";
import { cn } from "@client/lib/utils";
import type { FoldedFinding } from "@shared/lib/finding";
import type { WalkthroughId } from "@shared/schemas/ids";
import { Image } from "lucide-react";
import { useEffect, useState } from "react";

/** How long the capture the reader has left takes to dissolve into the next. */
const CROSSFADE_MS = 200;

/**
 * The panel beside the prose: whichever capture the reader has reached, named by
 * its number and flanked by the steps to its neighbours.
 *
 * Stepping scrolls the prose to the neighbour rather than only swapping the
 * capture, so the two columns travel together rather than the panel running
 * ahead of what is being read. A chip or a callout does not: those ask to see a
 * capture from where the reader already is.
 *
 * Reaching a new capture dissolves into it rather than cutting, so a scroll that
 * crosses a target boundary reads as the panel following the prose rather than
 * as a flash. Only what is on the stage crossfades: the card, the caption, and
 * the field beneath are the panel's own and are held still through the fade, so
 * arriving at a capture doesn't rebuild the furniture around it.
 *
 * Both captures stay mounted for the length of one fade, keyed by their target
 * so the outgoing one keeps the instance — and so the replay keeps the frame —
 * it had while it was being read; rebuilding it would fade out a blank stage.
 * React only relocates a keyed child that moves *earlier* in the list, and the
 * outgoing capture only ever moves later, so neither replay's iframe is
 * re-inserted mid-fade — which would reload it.
 *
 * The outgoing capture is painted over the incoming one, since a fade under an
 * opaque capture is a fade nobody sees. It takes no pointer while it lasts, so
 * the transport and steps belong to the capture being arrived at throughout.
 */
export function ProductWalkthroughCapturePanel({
  activeKey,
  captures,
  findings,
  onSelect,
  refitted,
  walkthroughId,
}: {
  activeKey: string | undefined;
  captures: ReadonlyMap<string, PlacedCapture>;
  findings: readonly FoldedFinding[];
  onSelect: (key: string) => void;
  refitted: number;
  walkthroughId: WalkthroughId;
}) {
  const [shown, setShown] = useState<{
    key: string | undefined;
    outgoing: string | undefined;
  }>({ key: activeKey, outgoing: undefined });

  // Adjusted during render rather than in an effect: an effect fires after the
  // commit that already dropped the outgoing capture from the tree, which is
  // one frame too late to keep it.
  if (shown.key !== activeKey) {
    setShown({ key: activeKey, outgoing: shown.key });
  }

  const { outgoing } = shown;

  useEffect(() => {
    if (outgoing === undefined) {
      return;
    }

    const fade = setTimeout(
      () => setShown((state) => ({ ...state, outgoing: undefined })),
      CROSSFADE_MS
    );

    return () => clearTimeout(fade);
  }, [outgoing]);

  const active = activeKey === undefined ? undefined : captures.get(activeKey);
  const leaving = outgoing === undefined ? undefined : captures.get(outgoing);

  const layers = [];

  if (active !== undefined && activeKey !== undefined) {
    layers.push({ fading: false, key: activeKey, placed: active });
  }

  if (leaving !== undefined && outgoing !== undefined) {
    layers.push({ fading: true, key: outgoing, placed: leaving });
  }

  // The caption names the capture being arrived at; while the panel is emptying
  // it goes on naming the one still fading, so the frame doesn't lose its label
  // before it loses its contents.
  const captioned = active ?? leaving;

  if (captioned === undefined) {
    return (
      <Empty icon={<Image />}>No capture for this part of the tour.</Empty>
    );
  }

  const keys = [...captures.keys()];
  const index = activeKey === undefined ? -1 : keys.indexOf(activeKey);
  const previousKey = keys[index - 1];
  const nextKey = keys[index + 1];

  return (
    <CaptureFrame
      capture={captioned.capture}
      label={captureLabel(captioned)}
      onNext={nextKey === undefined ? undefined : () => onSelect(nextKey)}
      onPrevious={
        previousKey === undefined ? undefined : () => onSelect(previousKey)
      }
    >
      {layers.map(({ fading, key, placed }) => (
        <div
          className={cn(
            "absolute inset-0 flex flex-col transition-opacity duration-200 motion-reduce:transition-none",
            fading ? "z-10 pointer-events-none opacity-0" : "z-0 opacity-100"
          )}
          key={key}
        >
          <CaptureView
            annotations={annotationsFor(placed.section, placed.capture.id)}
            capture={placed.capture}
            findings={findings}
            // A capture on its way out is nobody's answer, so a refit asked for
            // while it fades belongs to the one arriving.
            refitted={fading ? 0 : refitted}
            target={key}
            walkthroughId={walkthroughId}
          />
        </div>
      ))}
    </CaptureFrame>
  );
}
