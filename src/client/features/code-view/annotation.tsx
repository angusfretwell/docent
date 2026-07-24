import { Surface } from "@client/components/surface";
import { Composer } from "@client/features/findings/composer";
import type { FindingCompose } from "@client/features/findings/hooks/use-finding-compose";
import { FindingThread } from "@client/features/findings/thread";
import type { Annotation } from "@client/lib/diff-annotations";

export function CodeViewAnnotation({
  annotation,
  compose,
}: {
  annotation: { metadata: Annotation };
  compose: FindingCompose;
}) {
  if (annotation.metadata.kind === "finding") {
    return (
      <div className="my-4 mx-3 max-w-xl">
        <Surface className="p-4 font-sans" radius="lg">
          <FindingThread finding={annotation.metadata.finding} />
        </Surface>
      </div>
    );
  }

  return (
    <div className="mx-3 my-4 font-sans max-w-xl">
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
