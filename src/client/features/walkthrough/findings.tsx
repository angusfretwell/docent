import { Surface } from "@client/components/surface";
import { Button } from "@client/components/ui/button";
import { Composer } from "@client/features/findings/composer";
import { useFindingWrite } from "@client/features/findings/hooks/use-finding-write";
import { FindingThread } from "@client/features/findings/thread";
import type { FoldedFinding } from "@shared/lib/finding";
import type { SectionId, WalkthroughId } from "@shared/schemas/ids";
import { MessageCirclePlus } from "lucide-react";
import { useState } from "react";

/**
 * The threads anchored to one step of a tour, read beneath the prose they
 * discuss, plus the control that opens a new one.
 *
 * A section anchor names the step rather than anything inside it — no blob, no
 * line, no capture — so it has nothing to drift against and survives the tour
 * being re-authored against a later Change. What the thread discusses is the
 * step, not whatever the step happened to point at when it was written.
 */
export function WalkthroughFindings({
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
        <Surface className="p-4 font-sans" key={finding.id} radius="lg">
          <FindingThread finding={finding} />
        </Surface>
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
