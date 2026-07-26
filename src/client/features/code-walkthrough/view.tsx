import { Empty } from "@client/components/empty";
import { useComments } from "@client/features/comments/hooks/use-comments";
import { useActiveTarget } from "@client/features/walkthrough/hooks/use-active-target";
import { useRevealedSection } from "@client/features/walkthrough/hooks/use-revealed-section";
import { WalkthroughLayout } from "@client/features/walkthrough/layout";
import type { WalkthroughPane } from "@client/features/walkthrough/layout";
import {
  codeSteps,
  rangesByKey,
  walkthroughPaths,
} from "@client/features/walkthrough/lib/walkthrough";
import { StepProse } from "@client/features/walkthrough/prose";
import { WalkthroughStaleness } from "@client/features/walkthrough/staleness";
import { useDrift } from "@client/hooks/use-drift";
import { commentsBySection, sectionKey } from "@client/lib/comment-sections";
import { parsePatchFiles } from "@client/lib/diff";
import { basename } from "@client/lib/utils";
import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
import { latestCodeWalkthrough } from "@shared/lib/identity-drift";
import { walkthroughStaleness } from "@shared/lib/walkthrough-callouts";
import type { WalkthroughId } from "@shared/schemas/ids";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Code2, FileCode, GitCompare } from "lucide-react";
import { useRef, useState } from "react";

import { CodeWalkthroughDiffPanel } from "./diff-panel";

export function CodeWalkthroughView() {
  const { data: change } = useSuspenseQuery(diffQueryOptions);
  const { data: review } = useSuspenseQuery(reviewQueryOptions);

  const { visible } = useComments();

  const walkthrough = latestCodeWalkthrough(review.walkthroughs);
  const sections = walkthrough?.sections ?? [];

  const bySection = commentsBySection(visible.map((entry) => entry.comment));

  const drift = useDrift({
    comments: review.comments,
    patch: change.patch,
    walkthroughs: review.walkthroughs,
  });

  const proseRef = useRef<HTMLDivElement>(null);
  const tourId = walkthrough?.id ?? ("" as WalkthroughId);
  const { activeKey, pinTarget, reachTarget } = useActiveTarget(
    proseRef,
    tourId
  );
  const [reasserted, setReasserted] = useState(0);
  const [pane, setPane] = useState<WalkthroughPane>("prose");

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

  // Re-clicking the active chip changes no active range, so the diff won't
  // re-aim on its own; bumping `reasserted` re-asserts the scroll for a reader
  // who scrolled the diff away.
  function selectTarget(key: string) {
    pinTarget(key);
    setReasserted((count) => count + 1);
    setPane("target");
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
    review.changes
  );

  return (
    <WalkthroughLayout
      id="code-walkthrough"
      onPaneChange={setPane}
      pane={pane}
      proseRef={proseRef}
      target={
        <CodeWalkthroughDiffPanel
          activeKey={activeKey}
          driftFor={(id) => drift.get(id)}
          files={files}
          onReach={reachTarget}
          ranges={ranges}
          reasserted={reasserted}
        />
      }
      targetIcon={<GitCompare />}
      targetLabel="Diff"
    >
      <h1 className="font-heading text-[2em] text-balance">
        {walkthrough.manifest?.title ?? "Code walkthrough"}
      </h1>

      <WalkthroughStaleness staleness={staleness} />

      {steps.map((step) => (
        <StepProse
          activeKey={activeKey}
          comments={bySection.get(sectionKey(walkthrough.id, step.section.id))}
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
