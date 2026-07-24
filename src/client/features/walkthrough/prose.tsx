import { Badge } from "@client/components/ui/badge";
import type { Callout } from "@client/features/walkthrough/callouts";
import { targetAnchorProps } from "@client/features/walkthrough/hooks/use-active-target";
import { sectionAnchorProps } from "@client/features/walkthrough/lib/target";
import type { WalkthroughStep } from "@client/features/walkthrough/lib/walkthrough";
import {
  stepLayout,
  targetKey,
} from "@client/features/walkthrough/lib/walkthrough";
import type { FoldedFinding } from "@shared/lib/finding";
import { targetChipIndex } from "@shared/lib/walkthrough-segments";
import type { ElementContent } from "hast";
import type { ComponentProps, ReactNode } from "react";
import { createContext, use } from "react";
import type { Components, ExtraProps } from "react-markdown";
import Markdown from "react-markdown";

import { WalkthroughCallouts } from "./callouts";
import { WalkthroughFindings } from "./findings";

/** How a target reads on its chip: a short label, with the full reference behind it. */
export interface TargetLabel {
  detail?: string;
  /** The mark naming what kind of target this is — a file, a screenshot, a recording. */
  icon: ReactNode;
  text: string;
}

/** Resolves a target key to its chip label, or `undefined` if the tour can't reach it. */
export type LabelTarget = (key: string) => TargetLabel | undefined;

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
  sectionId: string;
}

// Read through context rather than a closure so `PROSE_COMPONENTS` can be a
// module constant: an override rebuilt each render is a new component type, and
// React would remount every chip in the section on any re-render.
const ChipScopeContext = createContext<ChipScope | undefined>(undefined);

/**
 * One target as a chip: the anchor the active-target reading keys off, and the
 * control that aims the panel at it deliberately.
 */
function TargetChip({
  anchorKey,
  scope,
}: {
  anchorKey: string;
  scope: ChipScope;
}) {
  const label = scope.labelTarget(anchorKey);

  // A target the walkthrough can't resolve gets no chip — there is nothing to
  // name it with — but it keeps its anchor, so the panel still shows its empty
  // state as the reader passes rather than holding the previous target.
  if (label === undefined) {
    return <span aria-hidden {...targetAnchorProps(anchorKey)} />;
  }

  return (
    <Badge
      data-not-typeset
      onClick={() => scope.onSelect(anchorKey)}
      render={<button aria-label={`Show ${label.text}`} type="button" />}
      title={label.detail}
      variant="outline"
      {...targetAnchorProps(anchorKey)}
    >
      {label.icon}
      {label.text}
    </Badge>
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
    <TargetChip anchorKey={targetKey(scope.sectionId, index)} scope={scope} />
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

/** Chips placed around the prose rather than inside it, kept off the typeset flow. */
function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-not-typeset>
      {children}
    </div>
  );
}

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
  walkthroughId: string;
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
              <TargetChip anchorKey={layout.heading} scope={scope} />
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
                <TargetChip anchorKey={key} key={key} scope={scope} />
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
