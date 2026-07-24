import { Empty } from "@client/components/empty";
import { ScrollArea } from "@client/components/ui/scroll-area";
import { cn } from "@client/lib/utils";
import { MessagesSquare } from "lucide-react";

import { FindingsHeader } from "./header";
import { useFindings } from "./hooks/use-findings";
import { FindingsItem } from "./item";

export function FindingsPanel({ popover }: { popover?: boolean }) {
  const { visible } = useFindings();

  return (
    <>
      <FindingsHeader />

      {visible.length === 0 ? (
        <Empty icon={<MessagesSquare />}>No findings yet.</Empty>
      ) : (
        <ScrollArea
          className={cn(
            "*:data-[slot=scroll-area-viewport]:isolate",
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
