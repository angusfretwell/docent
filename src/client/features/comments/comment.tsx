import type { Author } from "@shared/schemas/comment";
import { differenceInMilliseconds } from "date-fns";
import { Bot } from "lucide-react";
import prettyMilliseconds from "pretty-ms";
import Markdown from "react-markdown";

function formatTimestamp(createdAt: string) {
  const difference = differenceInMilliseconds(new Date(), new Date(createdAt));

  if (difference < 1000) {
    return "just now";
  }

  return prettyMilliseconds(difference, {
    compact: true,
  });
}

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
      <p className="flex flex-wrap items-center gap-1 text-[13px] leading-none">
        {author?.kind === "agent" && <Bot className="size-3.5" />}{" "}
        {author && <span className="font-medium">{author.display}</span>}{" "}
        {createdAt && (
          <span className="text-muted-foreground">
            {formatTimestamp(createdAt)}
          </span>
        )}
      </p>

      <div className="typeset typeset-comment">
        {body === "" ? null : <Markdown>{body}</Markdown>}
      </div>
    </div>
  );
}
