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

const CROSSFADE_MS = 200;

/**
 * Both captures stay mounted for one fade, keyed by their target. React only
 * relocates a keyed child that moves earlier in the list, and the outgoing
 * capture only ever moves later, so its replay iframe is never re-inserted
 * mid-fade — which would reload it.
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

  // Adjusted during render, not in an effect: an effect fires after the commit
  // that already dropped the outgoing capture from the tree, one frame too late
  // to keep it.
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
            // A fading capture is nobody's answer, so a refit belongs to the
            // one arriving.
            refitted={fading ? 0 : refitted}
            target={key}
            walkthroughId={walkthroughId}
          />
        </div>
      ))}
    </CaptureFrame>
  );
}
