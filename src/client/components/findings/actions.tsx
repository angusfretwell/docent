import { useFindingWrite } from "@client/hooks/use-finding-write";
import type { FoldedFinding } from "@shared/lib/finding";
import { Reply } from "lucide-react";
import { useState } from "react";

import { Composer } from "../composer";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  MenuPopup,
  MenuGroup,
  MenuGroupLabel,
} from "../ui/menu";

/**
 * The next-record actions on a Finding thread. Each action appends one
 * append-only record through the shared write path; the SSE refresh re-folds the
 * snapshot, so the thread re-renders from the server's truth rather than from
 * local state.
 */
export function FindingActions({ finding }: { finding: FoldedFinding }) {
  const [replying, setReplying] = useState(false);
  const write = useFindingWrite();

  if (replying) {
    return (
      <Composer
        busy={write.isPending}
        label="Reply"
        onCancel={() => setReplying(false)}
        onSubmit={(body) =>
          write.mutate(
            { body, findingId: finding.id, op: "reply" },
            { onSuccess: () => setReplying(false) }
          )
        }
        placeholder="Reply…"
      />
    );
  }

  if (finding.status === "resolved") {
    return (
      <Button
        className="w-fit"
        loading={write.isPending}
        onClick={() => write.mutate({ findingId: finding.id, op: "reopen" })}
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

      {finding.status === "open" ? (
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
                  write.mutate({ findingId: finding.id, op: "action" })
                }
              >
                Actioned
              </MenuItem>
              <MenuItem
                onClick={() =>
                  write.mutate({ findingId: finding.id, op: "resolve" })
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
          onClick={() => write.mutate({ findingId: finding.id, op: "resolve" })}
          size="xs"
          variant="ghost"
        >
          Mark as resolved
        </Button>
      )}
    </div>
  );
}
