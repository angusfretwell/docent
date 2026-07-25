import { Empty } from "@client/components/empty";
import { ScrollArea } from "@client/components/ui/scroll-area";
import { cn } from "@client/lib/utils";
import { MessagesSquare } from "lucide-react";

import { CommentsHeader } from "./header";
import { useComments } from "./hooks/use-comments";
import { CommentsItem } from "./item";

export function CommentsPanel({ popover }: { popover?: boolean }) {
  const { visible } = useComments();

  return (
    <>
      <CommentsHeader />

      {visible.length === 0 ? (
        <Empty icon={<MessagesSquare />}>No comments yet.</Empty>
      ) : (
        <ScrollArea
          className={cn(
            "*:data-[slot=scroll-area-viewport]:isolate",
            popover &&
              "*:data-[slot=scroll-area-viewport]:max-h-[calc(var(--available-height)-(--spacing(11)))]"
          )}
        >
          {visible.map(({ comment, diffItemId, drift, location, section }) => (
            <CommentsItem
              key={comment.id}
              comment={comment}
              diffItemId={diffItemId}
              drift={drift}
              location={location}
              section={section}
            />
          ))}
        </ScrollArea>
      )}
    </>
  );
}
