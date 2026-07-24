import { Button } from "@client/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  MenuPopup,
  MenuGroup,
  MenuGroupLabel,
} from "@client/components/ui/menu";
import type { FoldedComment } from "@shared/lib/comment";
import { Reply } from "lucide-react";
import { useState } from "react";

import { Composer } from "./composer";
import { useCommentWrite } from "./hooks/use-comment-write";

export function CommentActions({ comment }: { comment: FoldedComment }) {
  const [replying, setReplying] = useState(false);
  const write = useCommentWrite();

  if (replying) {
    return (
      <Composer
        busy={write.isPending}
        label="Reply"
        onCancel={() => setReplying(false)}
        onSubmit={(body) =>
          write.mutate(
            { body, commentId: comment.id, op: "reply" },
            { onSuccess: () => setReplying(false) }
          )
        }
        placeholder="Reply…"
      />
    );
  }

  if (comment.status === "resolved") {
    return (
      <Button
        className="w-fit"
        loading={write.isPending}
        onClick={() => write.mutate({ commentId: comment.id, op: "reopen" })}
        size="xs"
        variant="outline"
      >
        Reopen
      </Button>
    );
  }

  return (
    <div className="flex gap-1">
      <Button variant="outline" size="xs" onClick={() => setReplying(true)}>
        <Reply />
        Reply
      </Button>

      {comment.status === "open" ? (
        <Menu>
          <MenuTrigger
            render={
              <Button loading={write.isPending} size="xs" variant="ghost" />
            }
          >
            Mark as&hellip;
          </MenuTrigger>
          <MenuPopup align="start">
            <MenuGroup>
              <MenuGroupLabel>Status</MenuGroupLabel>
              <MenuItem
                onClick={() =>
                  write.mutate({ commentId: comment.id, op: "action" })
                }
              >
                Actioned
              </MenuItem>
              <MenuItem
                onClick={() =>
                  write.mutate({ commentId: comment.id, op: "resolve" })
                }
              >
                Resolved
              </MenuItem>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      ) : (
        <Button
          loading={write.isPending}
          onClick={() => write.mutate({ commentId: comment.id, op: "resolve" })}
          size="xs"
          variant="ghost"
        >
          Mark as resolved
        </Button>
      )}
    </div>
  );
}
