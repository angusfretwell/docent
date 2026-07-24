import { useFindingWrite } from "@client/hooks/use-finding-write";
import type { FoldedFinding } from "@shared/lib/finding";
import type { SectionId, WalkthroughId } from "@shared/schemas/ids";
import { MessageCirclePlus } from "lucide-react";
import { useState } from "react";

import { Composer } from "../composer";
import { FindingThread } from "../findings/thread";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

/**
 * The threads anchored to one step of a tour, read beneath the prose they
 * discuss, plus the control that opens a new one.
 *
 * A section anchor names the step rather than anything inside it — no blob, no
 * line, no capture — so it has nothing to drift against and survives the tour
 * being re-authored against a later Change. What the thread discusses is the
 * step, not whatever the step happened to point at when it was written.
 */
export function SectionFindings({
  findings,
  sectionId,
  walkthroughId,
}: {
  findings: readonly FoldedFinding[];
  sectionId: SectionId;
  walkthroughId: WalkthroughId;
}) {
  const [composing, setComposing] = useState(false);
  const write = useFindingWrite();

  function submit(body: string) {
    write.mutate(
      {
        anchor: { kind: "walkthrough-section", sectionId, walkthroughId },
        body,
        op: "open",
      },
      { onSuccess: () => setComposing(false) }
    );
  }

  return (
    <div className="mt-6 grid gap-4 font-sans" data-not-typeset>
      {findings.map((finding) => (
        <Card
          className="p-4 font-sans rounded-lg before:rounded-[calc(var(--radius-lg)-1px)]"
          key={finding.id}
        >
          <FindingThread finding={finding} />
        </Card>
      ))}

      {composing ? (
        <Composer
          busy={write.isPending}
          cancelOnBlur={false}
          onCancel={() => setComposing(false)}
          onSubmit={submit}
        />
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={() => setComposing(true)}
            size="xs"
            variant="outline"
          >
            <MessageCirclePlus />
            Comment
          </Button>
        </div>
      )}
    </div>
  );
}
