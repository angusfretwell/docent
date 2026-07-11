/**
 * The inline body CodeView anchors at an annotation's `{ side, lineNumber }`
 * (architecture.md §4, the comment-rendering substrate): an existing Finding
 * renders as a thread; the composer marker renders the authoring form.
 */

import type { FindingWrite } from "@shared/schemas/finding-write";
import { Composer } from "./composer";
import type { Annotation } from "../lib/diff-annotations";
import { FindingThread } from "./finding-thread";
import type { FindingCompose } from "../hooks/use-finding-compose";

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
      <div className="finding-annotation">
        <FindingThread
          drift={annotation.metadata.drift}
          finding={annotation.metadata.finding}
          onWrite={onWrite}
        />
      </div>
    );
  }
  return (
    <div className="finding-annotation">
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
