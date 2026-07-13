/**
 * The inline body CodeView anchors at an annotation's `{ side, lineNumber }`
 * (architecture.md §4, the comment-rendering substrate): an existing Finding
 * renders as a thread; the composer marker renders the authoring form.
 */

import { Composer, FindingThread } from "@client/features/walkthrough-shared";
import type { FindingWrite } from "@shared/schemas/finding-write";

import type { Annotation } from "./diff-annotations";
import type { FindingCompose } from "./use-finding-compose";

export function DiffAnnotationView({
  annotation,
  compose,
  onWrite,
}: {
  annotation: { metadata: Annotation };
  compose: FindingCompose;
  onWrite: (write: FindingWrite) => Promise<void>;
}) {
  if (annotation.metadata.kind === "finding") {
    return (
      <div className="mx-3 my-1 max-w-[40rem] rounded-md border bg-muted font-sans">
        <FindingThread
          drift={annotation.metadata.drift}
          finding={annotation.metadata.finding}
          onWrite={onWrite}
        />
      </div>
    );
  }
  return (
    <div className="mx-3 my-1 max-w-[40rem] rounded-md border bg-muted font-sans">
      <Composer
        autoFocus
        busy={compose.busy}
        onCancel={() => compose.cancel()}
        onSubmit={(body) => compose.submit(body)}
        placeholder="Leave a finding on these lines…"
        submitLabel="Comment"
      />
    </div>
  );
}
