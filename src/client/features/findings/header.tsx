import { Button } from "@client/components/ui/button";
import { MessageCirclePlus } from "lucide-react";
import { useState } from "react";

import { Composer } from "./composer";
import { FindingsFilter } from "./filter";
import { useFindingWrite } from "./hooks/use-finding-write";

export function FindingsHeader() {
  const [commentOpen, setCommentOpen] = useState(false);
  const write = useFindingWrite();

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b px-2">
        <FindingsFilter />

        <Button
          variant="outline"
          size="xs"
          className="ml-auto"
          onClick={() => setCommentOpen(true)}
        >
          <MessageCirclePlus /> Add
        </Button>
      </div>

      {commentOpen && (
        <div className="border-b p-2">
          <Composer
            busy={write.isPending}
            cancelOnBlur={false}
            onCancel={() => setCommentOpen(false)}
            onSubmit={(body) =>
              write.mutate(
                { anchor: { kind: "change" }, body, op: "open" },
                { onSuccess: () => setCommentOpen(false) }
              )
            }
          />
        </div>
      )}
    </>
  );
}
