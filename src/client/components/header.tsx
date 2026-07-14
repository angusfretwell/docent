import { FindingsToggle } from "./findings/toggle";
import { Navigation } from "./navigation";
import { ReviewMeta } from "./review-meta";
import { Separator } from "./ui/separator";

export function Header() {
  return (
    <div className="shrink-0 px-1.5 flex items-center gap-1.5 h-11">
      <span className="shrink-0 size-7 bg-yellow-400 rounded-md font-heading font-bold flex items-center justify-center text-black">
        D.
      </span>
      <Navigation />
      <ReviewMeta />
      <Separator orientation="vertical" className="h-4" />
      <FindingsToggle />
    </div>
  );
}
