import type { FindingCompose } from "@client/hooks/use-finding-compose";
import type { Annotation } from "@client/lib/diff-annotations";

import { Composer } from "../composer";
import { FindingThread } from "../findings/thread";
import { Surface } from "../surface";

export function DiffAnnotation({
  annotation,
  compose,
}: {
  annotation: { metadata: Annotation };
  compose: FindingCompose;
}) {
  if (annotation.metadata.kind === "finding") {
    return (
      <div className="my-4 mx-3 w-full max-w-xl">
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
