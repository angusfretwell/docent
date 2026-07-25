import { useCodeThemeColor } from "@client/hooks/use-theme";
import { patchStats } from "@client/lib/diff";
import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
import { useSuspenseQuery } from "@tanstack/react-query";
import { GitPullRequestArrow } from "lucide-react";
import { useMemo } from "react";

import { Button } from "./ui/button";

export function ReviewMeta() {
  const { data: change } = useSuspenseQuery(diffQueryOptions);
  const { data: snapshot } = useSuspenseQuery(reviewQueryOptions);
  const addedColor = useCodeThemeColor("gitDecoration.addedResourceForeground");
  const deletedColor = useCodeThemeColor(
    "gitDecoration.deletedResourceForeground"
  );

  const { additions, deletions } = useMemo(
    () => patchStats(change.patch),
    [change]
  );

  return (
    <div className="flex min-w-0 shrink items-center gap-1">
      {snapshot.review.title && (
        <span className="min-w-0 truncate text-[13px] max-sm:sr-only">
          {snapshot.review.title}
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
          <span className="max-sm:sr-only">{change.branch}</span>
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
          <span className="max-sm:sr-only">{change.branch}</span>
        </Button>
      )}

      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[13px] tabular-nums"
          style={{ color: deletedColor }}
        >
          -{deletions}
        </span>

        <span
          className="font-mono text-[13px] tabular-nums"
          style={{ color: addedColor }}
        >
          +{additions}
        </span>
      </div>
    </div>
  );
}
