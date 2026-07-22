import type { Author } from "@shared/schemas/finding";
import { formatDistanceToNow } from "date-fns";
import { Bot } from "lucide-react";
import Markdown from "react-markdown";

export function Comment({
  author,
  body,
  createdAt,
}: {
  author?: Author;
  body: string;
  createdAt?: string;
}) {
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-1 text-[13px] leading-none">
        {author?.kind === "agent" && <Bot className="size-3.5" />}{" "}
        {author && <span className="font-medium">{author.display}</span>}{" "}
        {createdAt && (
          <span className="text-muted-foreground">
            {formatDistanceToNow(new Date(createdAt), {
              addSuffix: true,
            })}
          </span>
        )}
      </p>

      <div className="typeset typeset-comment">
        {body === "" ? null : <Markdown>{body}</Markdown>}
      </div>
    </div>
  );
}
