import type { Callout } from "@client/features/walkthrough/callouts";
import type { LabelTarget } from "@client/features/walkthrough/chips";
import { sectionAnchorProps } from "@client/features/walkthrough/hooks/use-revealed-section";
import type { WalkthroughStep } from "@client/features/walkthrough/lib/walkthrough";
import {
  stepLayout,
  targetKey,
} from "@client/features/walkthrough/lib/walkthrough";
import type { FoldedFinding } from "@shared/lib/finding";
import { targetChipIndex } from "@shared/lib/walkthrough-segments";
import type { SectionId, WalkthroughId } from "@shared/schemas/ids";
import type { ElementContent } from "hast";
import type { ComponentProps } from "react";
import { createContext, use } from "react";
import type { Components, ExtraProps } from "react-markdown";
import Markdown from "react-markdown";

import { WalkthroughCallouts } from "./callouts";
import { ChipRow, TargetChip } from "./chips";
import { WalkthroughFindings } from "./findings";

/** Resolves a target key to the callouts read beneath it, if the pillar has any. */
export type CalloutsForTarget = (key: string) => readonly Callout[];

/** A pillar with no callouts of its own — the code walkthrough's targets. */
function noCallouts(): readonly Callout[] {
  return [];
}

/** A stable empty default, so a section with no threads doesn't remount them. */
const NO_FINDINGS: readonly FoldedFinding[] = [];

interface ChipScope {
  calloutsFor: CalloutsForTarget;
  labelTarget: LabelTarget;
  onSelect: (key: string) => void;
  sectionId: SectionId;
}

// Read through context rather than a closure so `PROSE_COMPONENTS` can be a
// module constant: an override rebuilt each render is a new component type, and
// React would remount every chip in the section on any re-render.
const ChipScopeContext = createContext<ChipScope | undefined>(undefined);

/** A chip for one target, resolved against the section it was placed in. */
function ScopedTargetChip({
  anchorKey,
  scope,
}: {
  anchorKey: string;
  scope: ChipScope;
}) {
  const { labelTarget, onSelect: selectTarget } = scope;

  return (
    <TargetChip
      anchorKey={anchorKey}
      label={labelTarget(anchorKey)}
      onSelect={selectTarget}
    />
  );
}

/**
 * The chip links the fold planted in the prose; every other link renders as
 * itself. `node` is react-markdown's own hast handle, dropped rather than spread
 * so it doesn't reach the DOM as an attribute.
 */
function ProseLink({
  children,
  href,
  node: _node,
  ...props
}: ComponentProps<"a"> & ExtraProps) {
  const scope = use(ChipScopeContext);
  const index = href === undefined ? undefined : targetChipIndex(href);

  if (scope === undefined || index === undefined) {
    return (
      <a href={href} rel="noreferrer" {...props}>
        {children}
      </a>
    );
  }

  return (
    <ScopedTargetChip
      anchorKey={targetKey(scope.sectionId, index)}
      scope={scope}
    />
  );
}

/** The target indices of every chip link within a block, in document order. */
function chipIndices(nodes: readonly ElementContent[] | undefined): number[] {
  if (nodes === undefined) {
    return [];
  }

  return nodes.flatMap((node) => {
    if (node.type !== "element") {
      return [];
    }

    const { href } = node.properties;
    const index =
      node.tagName === "a" && typeof href === "string"
        ? targetChipIndex(href)
        : undefined;

    // A chip is a leaf, so only a node that isn't one is worth descending into.
    return index === undefined ? chipIndices(node.children) : [index];
  });
}

/**
 * A paragraph, followed by the callouts of whichever captures its chips placed.
 *
 * The callouts land after the paragraph rather than at the chip itself because
 * they are a block of their own — a list of marks — and a `<p>` cannot hold one.
 * Following the paragraph that reaches the capture is close enough that the
 * reader meets the callouts as the panel beside them swaps to what they describe.
 */
function ProseParagraph({
  children,
  node,
  ...props
}: ComponentProps<"p"> & ExtraProps) {
  const scope = use(ChipScopeContext);

  if (scope === undefined) {
    return <p {...props}>{children}</p>;
  }

  const keys = chipIndices(node?.children).map((index) =>
    targetKey(scope.sectionId, index)
  );

  return (
    <>
      <p {...props}>{children}</p>

      {keys.map((key) => (
        <WalkthroughCallouts
          callouts={scope.calloutsFor(key)}
          key={key}
          target={key}
        />
      ))}
    </>
  );
}

const PROSE_COMPONENTS: Components = { a: ProseLink, p: ProseParagraph };

/**
 * One section of prose. A target marker renders as a chip naming what the panel
 * beside it will show, which doubles as the anchor keeping the two panels in
 * step. `stepLayout` decides where the chips a marker didn't place land.
 */
export function StepProse({
  calloutsFor = noCallouts,
  findings = NO_FINDINGS,
  labelTarget,
  onSelect,
  step,
  walkthroughId,
}: {
  calloutsFor?: CalloutsForTarget;
  /** The threads anchored to this section, read beneath its prose. */
  findings?: readonly FoldedFinding[];
  labelTarget: LabelTarget;
  onSelect: (key: string) => void;
  step: WalkthroughStep;
  walkthroughId: WalkthroughId;
}) {
  const layout = stepLayout(step);
  const scope = {
    calloutsFor,
    labelTarget,
    onSelect,
    sectionId: step.section.id,
  };

  return (
    <ChipScopeContext value={scope}>
      <section {...sectionAnchorProps(walkthroughId, step.section.id)}>
        <h2>{step.section.title}</h2>

        {layout.heading !== undefined && (
          <>
            <ChipRow>
              <ScopedTargetChip anchorKey={layout.heading} scope={scope} />
            </ChipRow>

            <WalkthroughCallouts
              callouts={calloutsFor(layout.heading)}
              target={layout.heading}
            />
          </>
        )}

        <Markdown components={PROSE_COMPONENTS}>{layout.prose}</Markdown>

        {layout.trailing.length > 0 && (
          <>
            <ChipRow>
              {layout.trailing.map((key) => (
                <ScopedTargetChip anchorKey={key} key={key} scope={scope} />
              ))}
            </ChipRow>

            {layout.trailing.map((key) => (
              <WalkthroughCallouts
                callouts={calloutsFor(key)}
                key={key}
                target={key}
              />
            ))}
          </>
        )}
      </section>

      <WalkthroughFindings
        findings={findings}
        sectionId={step.section.id}
        walkthroughId={walkthroughId}
      />
    </ChipScopeContext>
  );
}
