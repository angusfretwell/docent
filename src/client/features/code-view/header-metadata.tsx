import { Button } from "@client/components/ui/button";
import { Checkbox } from "@client/components/ui/checkbox";
import { MessageCircleCode } from "lucide-react";

export function CodeViewHeaderMetadata({
  onComment,
  onToggleViewed,
  viewed = false,
}: {
  onComment?: () => void;
  onToggleViewed?: () => void;
  viewed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {onComment && (
        <Button
          size="icon-xs"
          variant="outline"
          onClick={onComment}
          aria-label="Comment on file"
        >
          <MessageCircleCode />
        </Button>
      )}

      {onToggleViewed && (
        <Button size="xs" variant="outline" onClick={onToggleViewed}>
          <Checkbox checked={viewed} className="size-3.5! [&_svg]:size-3!" />
          Viewed
        </Button>
      )}
    </div>
  );
}
