import { Empty } from "@client/components/empty";
import { PinHoverProvider } from "@client/features/capture/hooks/use-pin-hover";
import {
  annotationsFor,
  captureCallouts,
} from "@client/features/capture/lib/pins";
import { useFindings } from "@client/features/findings/hooks/use-findings";
import { useActiveTarget } from "@client/features/walkthrough/hooks/use-active-target";
import { useRevealedSection } from "@client/features/walkthrough/hooks/use-revealed-section";
import {
  captureLabel,
  capturesByKey,
  productSteps,
} from "@client/features/walkthrough/lib/walkthrough";
import { findingsBySection, sectionKey } from "@client/lib/finding-sections";
import { reviewQueryOptions } from "@client/queries/review";
import { latestProductWalkthrough } from "@shared/lib/identity-drift";
import { walkthroughStaleness } from "@shared/lib/walkthrough-annotations";
import type { WalkthroughId } from "@shared/schemas/ids";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Camera, MonitorSmartphone, Pointer, Video } from "lucide-react";
import { useRef, useState } from "react";

import { WalkthroughLayout } from "../walkthrough/layout";
import type { WalkthroughPane } from "../walkthrough/layout";
import { StepProse } from "../walkthrough/prose";
import { WalkthroughStaleness } from "../walkthrough/staleness";
import { ProductWalkthroughCapturePanel } from "./capture-panel";

export function ProductWalkthroughView() {
  const { data: review } = useSuspenseQuery(reviewQueryOptions);
  const { visible } = useFindings();

  const walkthrough = latestProductWalkthrough(review.walkthroughs);
  const sections = walkthrough?.sections ?? [];

  const proseRef = useRef<HTMLDivElement>(null);
  const tourId = walkthrough?.id ?? ("" as WalkthroughId);
  const { activeKey, jumpToTarget, pinTarget } = useActiveTarget(
    proseRef,
    tourId
  );
  const [refitted, setRefitted] = useState(0);
  const [pane, setPane] = useState<WalkthroughPane>("prose");

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

  // Clicking the active capture's chip has nothing to switch to, so it refits
  // the frame — undoing a zoom a callout or the reader left it under.
  function selectTarget(key: string) {
    setPane("target");

    if (key === activeKey) {
      setRefitted((count) => count + 1);
      return;
    }

    pinTarget(key);
  }

  function focusTarget(key: string) {
    setPane("target");
    pinTarget(key);
  }

  if (walkthrough === undefined) {
    return (
      <Empty icon={<Pointer />}>
        No product walkthrough has been authored for this branch yet.
      </Empty>
    );
  }

  const staleness = walkthroughStaleness(
    walkthrough.manifest?.bornChangeId ?? "",
    review.changes
  );

  return (
    <PinHoverProvider onFocus={focusTarget}>
      <WalkthroughLayout
        id="product-walkthrough"
        onPaneChange={setPane}
        pane={pane}
        proseRef={proseRef}
        target={
          <ProductWalkthroughCapturePanel
            activeKey={activeKey}
            captures={captures}
            findings={findings}
            onSelect={jumpToTarget}
            refitted={refitted}
            walkthroughId={walkthrough.id}
          />
        }
        targetIcon={<MonitorSmartphone />}
        targetLabel="Preview"
      >
        <h1 className="text-balance">
          {walkthrough.manifest?.title ?? "Product walkthrough"}
        </h1>

        <WalkthroughStaleness staleness={staleness} />

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
