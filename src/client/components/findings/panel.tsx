import { useFindings } from "@client/hooks/use-findings";
import { cn } from "@client/lib/utils";
import { MessagesSquare } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "../ui/empty";
import { ScrollArea } from "../ui/scroll-area";
import { FindingsHeader } from "./header";
import { FindingsItem } from "./item";

export function FindingsPanel({ popover }: { popover?: boolean }) {
  const { visible } = useFindings();

  return (
    <>
      <FindingsHeader />

      {visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessagesSquare />
            </EmptyMedia>
            <EmptyDescription>No findings yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea
          className={cn(
            " *:data-[slot=scroll-area-viewport]:isolate ",
            popover &&
              "*:data-[slot=scroll-area-viewport]:max-h-[calc(var(--available-height)-(--spacing(11)))]"
          )}
        >
          {visible.map(({ finding, diffItemId, drift, location, section }) => (
            <FindingsItem
              key={finding.id}
              finding={finding}
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
