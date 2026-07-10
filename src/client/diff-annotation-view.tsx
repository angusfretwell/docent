/**
 * The inline body CodeView anchors at an annotation's `{ side, lineNumber }`
 * (architecture.md §4, the comment-rendering substrate): an existing Finding
 * renders as a thread; the composer marker renders the authoring form.
 */

import type { FindingWrite } from "../shared/finding-write.ts";
import { Composer } from "./composer.tsx";
import type { Annotation } from "./diff-annotations.ts";
import { FindingThread } from "./finding-thread.tsx";
import type { FindingCompose } from "./use-finding-compose.tsx";

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
