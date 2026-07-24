import { Empty } from "@client/components/empty";
import { useFindings } from "@client/features/findings/hooks/use-findings";
import { useActiveTarget } from "@client/features/walkthrough/hooks/use-active-target";
import { useRevealedSection } from "@client/features/walkthrough/hooks/use-revealed-section";
import { WalkthroughLayout } from "@client/features/walkthrough/layout";
import {
  codeSteps,
  rangesByKey,
  walkthroughPaths,
} from "@client/features/walkthrough/lib/walkthrough";
import { StepProse } from "@client/features/walkthrough/prose";
import { WalkthroughStaleness } from "@client/features/walkthrough/staleness";
import { useDrift } from "@client/hooks/use-drift";
import { parsePatchFiles } from "@client/lib/diff";
import { findingsBySection, sectionKey } from "@client/lib/finding-sections";
import { basename } from "@client/lib/utils";
import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
import { latestCodeWalkthrough } from "@shared/lib/identity-drift";
import { walkthroughStaleness } from "@shared/lib/walkthrough-annotations";
import type { WalkthroughId } from "@shared/schemas/ids";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Code2, FileCode } from "lucide-react";
import { useRef, useState } from "react";

import { CodeWalkthroughDiffPanel } from "./diff-panel";

export function CodeWalkthroughView() {
  const { data: change } = useSuspenseQuery(diffQueryOptions);
  const { data: review } = useQuery(reviewQueryOptions);

  const { visible } = useFindings();

  const walkthrough = latestCodeWalkthrough(review?.walkthroughs ?? []);
  const sections = walkthrough?.sections ?? [];

  const bySection = findingsBySection(visible.map((entry) => entry.finding));

  // Drift is read against the branch patch, the same Change the anchors were
  // born into, so a thread authored in the tour pins where the Diff tab pins it.
  const drift = useDrift({
    findings: review?.findings ?? [],
    patch: change.patch,
    walkthroughs: review?.walkthroughs ?? [],
  });

  const proseRef = useRef<HTMLDivElement>(null);
  const tourId = walkthrough?.id ?? ("" as WalkthroughId);
  const { activeKey, pinTarget } = useActiveTarget(proseRef, tourId);
  const [reasserted, setReasserted] = useState(0);

  useRevealedSection(proseRef, tourId);

  const steps = codeSteps(sections);
  const ranges = rangesByKey(sections);
  const paths = walkthroughPaths(sections);

  function labelTarget(key: string) {
    const range = ranges.get(key);

    return range === undefined
      ? undefined
      : {
          detail: range.file,
          icon: <FileCode />,
          text: `${basename(range.file)}:${range.lines[0]}–${range.lines[1]}`,
        };
  }

  // A chip aims the diff and leaves the prose where the reader put it. The diff
  // re-aims off the active range, so clicking the chip already active says
  // nothing new — asserting the scroll outright is what gets a reader who
  // scrolled the diff away back to the range the chip names.
  function selectTarget(key: string) {
    pinTarget(key);
    setReasserted((count) => count + 1);
  }

  const referenceRank = new Map(
    [...paths].map((path, index) => [path, index] as const)
  );

  const files = parsePatchFiles(change.patch)
    .filter((file) => paths.has(file.path))
    .toSorted(
      (left, right) =>
        (referenceRank.get(left.path) ?? 0) -
        (referenceRank.get(right.path) ?? 0)
    );

  if (walkthrough === undefined) {
    return (
      <Empty icon={<Code2 />}>
        No code walkthrough has been authored for this branch yet.
      </Empty>
    );
  }

  const staleness = walkthroughStaleness(
    walkthrough.manifest?.bornChangeId ?? "",
    review?.changes ?? []
  );

  return (
    <WalkthroughLayout
      id="code-walkthrough"
      proseRef={proseRef}
      target={
        <CodeWalkthroughDiffPanel
          activeRange={
            activeKey === undefined ? undefined : ranges.get(activeKey)
          }
          driftFor={(id) => drift.get(id)}
          files={files}
          reasserted={reasserted}
        />
      }
    >
      <h1 className="text-balance">
        {walkthrough.manifest?.title ?? "Code walkthrough"}
      </h1>

      <WalkthroughStaleness staleness={staleness} />

      {steps.map((step) => (
        <StepProse
          findings={bySection.get(sectionKey(walkthrough.id, step.section.id))}
          key={step.section.id}
          labelTarget={labelTarget}
          onSelect={selectTarget}
          step={step}
          walkthroughId={walkthrough.id}
        />
      ))}
    </WalkthroughLayout>
  );
}
