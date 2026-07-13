/**
 * The inline body CodeView anchors at an annotation's `{ side, lineNumber }`
 * (architecture.md §4, the comment-rendering substrate): an existing Finding
 * renders as a thread; the composer marker renders the authoring form.
 */

import type { FindingWrite } from "@shared/schemas/finding-write";

import type { FindingCompose } from "../hooks/use-finding-compose";
import type { Annotation } from "../lib/diff-annotations";
import { Composer } from "./composer";
import { FindingThread } from "./finding-thread";

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
