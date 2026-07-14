import { useFindingWrite } from "@client/hooks/use-finding-write";
import { MessageCirclePlus } from "lucide-react";
import { useState } from "react";

import { Composer } from "../composer";
import { Button } from "../ui/button";
import { FindingsFilter } from "./filter";

export function FindingsHeader() {
  const [commentOpen, setCommentOpen] = useState(false);
  const write = useFindingWrite();

  return (
    <>
      <div className="px-2 h-11 shrink-0 flex items-center border-b gap-1.5">
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
        <div className="p-2 border-b">
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
