import { Surface } from "@client/components/surface";
import { Composer } from "@client/features/comments/composer";
import type { CommentCompose } from "@client/features/comments/hooks/use-comment-compose";
import { CommentThread } from "@client/features/comments/thread";
import type { Annotation } from "@client/lib/diff-annotations";

export function CodeViewAnnotation({
  annotation,
  compose,
}: {
  annotation: { metadata: Annotation };
  compose: CommentCompose;
}) {
  if (annotation.metadata.kind === "comment") {
    return (
      <div className="mx-3 my-4 max-w-xl">
        <Surface className="p-4 font-sans" radius="lg">
          <CommentThread comment={annotation.metadata.comment} />
        </Surface>
      </div>
    );
  }

  return (
    <div className="mx-3 my-4 max-w-xl font-sans">
      <Composer
        busy={compose.busy}
        cancelOnBlur={false}
        label="Comment"
        onCancel={() => compose.cancel()}
        onSubmit={(body) => compose.submit(body)}
      />
    </div>
  );
}
