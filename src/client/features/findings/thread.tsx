import type { FoldedFinding } from "@shared/lib/finding";
import { Fragment } from "react";

import { FindingActions } from "./actions";
import { Comment } from "./comment";

export function FindingThread({ finding }: { finding: FoldedFinding }) {
  return (
    <div className="grid gap-4">
      <Comment
        author={finding.openedBy}
        body={finding.body}
        createdAt={finding.openedAt}
      />

      {finding.replies.length > 0 && (
        <div className="grid gap-4 ml-1 pl-3 border-l">
          {finding.replies.map((reply) => (
            <Fragment key={`${reply.createdAt}:${reply.author.id}`}>
              <Comment
                author={reply.author}
                body={reply.body}
                createdAt={reply.createdAt}
              />
            </Fragment>
          ))}
        </div>
      )}

      <FindingActions finding={finding} />
    </div>
  );
}
