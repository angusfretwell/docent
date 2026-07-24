import type { Callout } from "@client/features/walkthrough/callouts";
import type { LabelTarget } from "@client/features/walkthrough/chips";
import { sectionAnchorProps } from "@client/features/walkthrough/hooks/use-revealed-section";
import type { WalkthroughStep } from "@client/features/walkthrough/lib/walkthrough";
import {
  stepLayout,
  targetKey,
} from "@client/features/walkthrough/lib/walkthrough";
import type { FoldedComment } from "@shared/lib/comment";
import { targetChipIndex } from "@shared/lib/walkthrough-segments";
import type { SectionId, WalkthroughId } from "@shared/schemas/ids";
import type { ElementContent } from "hast";
import type { ComponentProps } from "react";
import { createContext, use } from "react";
import type { Components, ExtraProps } from "react-markdown";
import Markdown from "react-markdown";

import { WalkthroughCallouts } from "./callouts";
import { ChipRow, TargetChip } from "./chips";
import { WalkthroughComments } from "./comments";

export type CalloutsForTarget = (key: string) => readonly Callout[];

function noCallouts(): readonly Callout[] {
  return [];
}

/** A stable empty default, so a section with no threads doesn't remount them. */
const NO_COMMENTS: readonly FoldedComment[] = [];

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

/** `node` is react-markdown's hast handle, dropped rather than spread so it doesn't reach the DOM as an attribute. */
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

    return index === undefined ? chipIndices(node.children) : [index];
  });
}

/** Callouts follow the paragraph rather than sit at the chip: they are a block of their own and a `<p>` cannot hold one. */
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

export function StepProse({
  calloutsFor = noCallouts,
  comments = NO_COMMENTS,
  labelTarget,
  onSelect,
  step,
  walkthroughId,
}: {
  calloutsFor?: CalloutsForTarget;
  comments?: readonly FoldedComment[];
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

      <WalkthroughComments
        comments={comments}
        sectionId={step.section.id}
        walkthroughId={walkthroughId}
      />
    </ChipScopeContext>
  );
}
