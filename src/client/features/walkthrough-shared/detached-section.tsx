import { Badge } from "@client/ui/badge";

/**
 * The trailing "Detached findings" shell shared by both pillar tabs: a
 * Finding whose anchor target (a walkthrough section or a capture) no longer
 * exists on the shown, immutable walkthrough renders here instead of
 * vanishing (data-model.md §6.2, walkthroughs.md §8). Each pillar supplies its
 * own `explanation` and its own rendering of each detached note as `children`;
 * the caller decides whether there's anything to show (render nothing when
 * there are no detached notes) — this shell always renders its chrome.
 */
export function DetachedSection({
  explanation,
  children,
}: {
  explanation: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t py-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[1.05rem] font-semibold">Detached findings</h2>
        <Badge variant="signal">Outdated</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{explanation}</p>
      {children}
    </section>
  );
}
