import { useCodeThemeColor } from "@client/hooks/use-code-theme";
import { patchStats } from "@client/lib/diff";
import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
import { useQuery } from "@tanstack/react-query";
import { GitPullRequestArrow } from "lucide-react";
import { useMemo } from "react";

import { Button } from "./ui/button";

export function ReviewMeta() {
  const { data: change } = useQuery(diffQueryOptions);
  const { data: snapshot } = useQuery(reviewQueryOptions);
  const addedColor = useCodeThemeColor("gitDecoration.addedResourceForeground");
  const deletedColor = useCodeThemeColor(
    "gitDecoration.deletedResourceForeground"
  );

  const { additions, deletions } = useMemo(
    () => patchStats(change?.patch ?? ""),
    [change]
  );

  if (!change) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 ml-auto pr-1.5">
      {snapshot?.review.title && (
        <span className="text-[13px] truncate min-w-0">
          {snapshot?.review.title}
        </span>
      )}

      {change.remoteUrl === null ? (
        <Button
          variant="ghost"
          size="sm"
          render={<span />}
          className="pointer-events-none text-[13px]!"
        >
          <GitPullRequestArrow />
          {change.branch}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-[13px]!"
          render={
            <a
              aria-label={`Open the pull request for ${change.branch}`}
              href={`${change.remoteUrl}/pull/${change.branch}`}
              rel="noreferrer"
              target="_blank"
            />
          }
        >
          <GitPullRequestArrow />
          {change.branch}
        </Button>
      )}

      <div className="flex items-center gap-2">
        <span
          className="text-[13px] font-mono tabular-nums"
          style={{ color: deletedColor }}
        >
          -{deletions}
        </span>

        <span
          className="text-[13px] font-mono tabular-nums"
          style={{ color: addedColor }}
        >
          +{additions}
        </span>
      </div>
    </div>
  );
}
