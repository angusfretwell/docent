import { useActiveTarget } from "@client/hooks/use-active-target";
import { useFindings } from "@client/hooks/use-findings";
import { findingsBySection, sectionKey } from "@client/lib/section-findings";
import { cn } from "@client/lib/utils";
import type { PlacedCapture } from "@client/lib/walkthrough";
import {
  captureLabel,
  capturesByKey,
  productSteps,
} from "@client/lib/walkthrough";
import { annotationsFor, captureCallouts } from "@client/lib/walkthrough-pins";
import { useRevealedSection } from "@client/lib/walkthrough-target";
import { reviewQueryOptions } from "@client/queries/review";
import type { FoldedFinding } from "@shared/lib/finding";
import { latestProductWalkthrough } from "@shared/lib/identity-drift";
import { walkthroughStaleness } from "@shared/lib/walkthrough-annotations";
import type { WalkthroughId } from "@shared/schemas/ids";
import { useQuery } from "@tanstack/react-query";
import { Camera, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PinHoverProvider } from "../walkthrough/callouts";
import { WalkthroughEmpty } from "../walkthrough/empty";
import { WalkthroughLayout } from "../walkthrough/layout";
import { StepProse } from "../walkthrough/prose";
import { StalenessBadge } from "../walkthrough/staleness";
import { CaptureFrame, CaptureView } from "./capture";
import { ProductEmpty } from "./empty";

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
function CapturePanel({
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
    return <ProductEmpty />;
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

export function ProductWalkthroughView() {
  const { data: review } = useQuery(reviewQueryOptions);
  const { visible } = useFindings();

  const walkthrough = latestProductWalkthrough(review?.walkthroughs ?? []);
  const sections = walkthrough?.sections ?? [];

  const proseRef = useRef<HTMLDivElement>(null);
  const tourId = walkthrough?.id ?? ("" as WalkthroughId);
  const { activeKey, jumpToTarget, pinTarget } = useActiveTarget(
    proseRef,
    tourId
  );
  const [refitted, setRefitted] = useState(0);

  useRevealedSection(proseRef, tourId);

  const steps = productSteps(sections);
  const captures = capturesByKey(
    sections,
    walkthrough?.manifest?.captures ?? []
  );

  const findings = visible.map((entry) => entry.finding);
  const bySection = findingsBySection(findings);

  function labelTarget(key: string) {
    const placed = captures.get(key);

    if (placed === undefined) {
      return;
    }

    return {
      detail: placed.capture.route,
      icon: placed.capture.kind === "recording" ? <Video /> : <Camera />,
      text: captureLabel(placed),
    };
  }

  // The bodies of a capture's pins read in the prose, beside the capture the
  // labels mark up — so the panel carries the marks and the column carries what
  // they say.
  function calloutsForTarget(key: string) {
    const placed = captures.get(key);

    return placed === undefined
      ? []
      : captureCallouts(
          annotationsFor(placed.section, placed.capture.id),
          findings,
          placed.capture
        );
  }

  // Clicking the chip of the capture already on the panel asks for the capture
  // itself, since there is nothing to switch to: it gives back the whole frame,
  // undoing a zoom the reader — or a callout — had left it under.
  function selectTarget(key: string) {
    if (key === activeKey) {
      setRefitted((count) => count + 1);
      return;
    }

    pinTarget(key);
  }

  if (walkthrough === undefined) {
    return <WalkthroughEmpty pillar="product" />;
  }

  const staleness = walkthroughStaleness(
    walkthrough.manifest?.bornChangeId ?? "",
    review?.changes ?? []
  );

  return (
    <PinHoverProvider onFocus={pinTarget}>
      <WalkthroughLayout
        id="product-walkthrough"
        proseRef={proseRef}
        target={
          <CapturePanel
            activeKey={activeKey}
            captures={captures}
            findings={findings}
            onSelect={jumpToTarget}
            refitted={refitted}
            walkthroughId={walkthrough.id}
          />
        }
      >
        <h1 className="text-balance">
          {walkthrough.manifest?.title ?? "Product walkthrough"}
        </h1>

        <StalenessBadge staleness={staleness} />

        {steps.map((step) => (
          <StepProse
            calloutsFor={calloutsForTarget}
            findings={bySection.get(
              sectionKey(walkthrough.id, step.section.id)
            )}
            key={step.section.id}
            labelTarget={labelTarget}
            onSelect={selectTarget}
            step={step}
            walkthroughId={walkthrough.id}
          />
        ))}
      </WalkthroughLayout>
    </PinHoverProvider>
  );
}
