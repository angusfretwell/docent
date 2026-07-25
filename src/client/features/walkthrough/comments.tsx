import { Surface } from "@client/components/surface";
import { Button } from "@client/components/ui/button";
import { Composer } from "@client/features/comments/composer";
import { useCommentWrite } from "@client/features/comments/hooks/use-comment-write";
import { CommentThread } from "@client/features/comments/thread";
import type { FoldedComment } from "@shared/lib/comment";
import type { SectionId, WalkthroughId } from "@shared/schemas/ids";
import { MessageCirclePlus } from "lucide-react";
import { useState } from "react";

export function WalkthroughComments({
  comments,
  sectionId,
  walkthroughId,
}: {
  comments: readonly FoldedComment[];
  sectionId: SectionId;
  walkthroughId: WalkthroughId;
}) {
  const [composing, setComposing] = useState(false);
  const write = useCommentWrite();

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
      {comments.map((comment) => (
        <Surface className="p-4 font-sans" key={comment.id} radius="lg">
          <CommentThread comment={comment} />
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
