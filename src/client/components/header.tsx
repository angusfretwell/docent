import { Skeleton } from "@client/components/ui/skeleton";
import { CommentsToggle } from "@client/features/comments/toggle";
import { Suspense } from "react";

import { Logo } from "./logo";
import { Navigation } from "./navigation";
import { ReviewMeta } from "./review-meta";
import { Separator } from "./ui/separator";

export function Header() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 px-1.5">
      <Logo />
      <Navigation />
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <Suspense fallback={<Skeleton className="h-5 w-60" />}>
          <ReviewMeta />
        </Suspense>
        <Separator orientation="vertical" className="ml-1.5 h-4" />
        <CommentsToggle />
      </div>
    </div>
  );
}
