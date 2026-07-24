import { KbdHint } from "@client/components/kbd-hint";
import { Pane } from "@client/components/pane";
import { Button } from "@client/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@client/components/ui/menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@client/components/ui/resizable";
import { Separator } from "@client/components/ui/separator";
import {
  diffFiltersAtom,
  matchesFilters,
} from "@client/features/file-tree/lib/filters";
import { useKeyPressed } from "@client/hooks/use-key-pressed";
import { parsePatchFiles, statusForChange } from "@client/lib/diff";
import { useDrift } from "@client/lib/drift";
import { diffLayoutAtom, diffTreeOpenAtom } from "@client/lib/preferences";
import { diffQueryOptions } from "@client/queries/diff";
import { pendingQueryOptions } from "@client/queries/pending";
import { reviewQueryOptions } from "@client/queries/review";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai/react";
import { ListTree, Settings } from "lucide-react";
import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDefaultLayout } from "react-resizable-panels";

import { ChangeRangePicker } from "./change-picker";
import { DiffCodeView } from "./code-view";
import { useViewedState } from "./hooks/use-viewed";
import { isGeneratedPath } from "./lib/generated";
import { computeViewed } from "./lib/viewed";
import { DiffTree } from "./tree";

export function DiffView() {
  const { data: change } = useSuspenseQuery(diffQueryOptions);
  const { range, view } = useSearch({ from: "/" });
  const { data: pending } = useQuery(pendingQueryOptions(range));
  const { data: review } = useQuery(reviewQueryOptions);

  const [diffLayout, setDiffLayout] = useAtom(diffLayoutAtom);

  const [diffTreeOpen, setDiffTreeOpen] = useAtom(diffTreeOpenAtom);

  const isAltPressed = useKeyPressed("Alt");
  useHotkeys("Alt + BracketLeft", () => setDiffTreeOpen(!diffTreeOpen));

  // Pending is only renderable while the working tree is dirty; a stale
  // `view=pending` URL silently renders the branch diff instead.
  const showPending = view === "pending" && pending?.dirty;

  const patch = showPending ? pending.patch : change.patch;

  // Drift is defined against the current Change (data-model.md §6), so it is
  // always read off the branch patch; the Pending preview instead falls back to
  // the sync blob-match placement inside the annotation model.
  const drift = useDrift({
    findings: review?.findings ?? [],
    patch: change.patch,
    walkthroughs: review?.walkthroughs ?? [],
  });

  const files = useMemo(() => parsePatchFiles(patch), [patch]);
  const fileById = useMemo(
    () => new Map(files.map((file) => [file.id, file])),
    [files]
  );

  const generatedPaths = useMemo(
    () => new Set(change.generated),
    [change.generated]
  );
  const viewedModel = useMemo(
    () =>
      computeViewed(
        review?.viewed ?? [],
        files,
        (file) =>
          file.file.type === "rename-pure" ||
          generatedPaths.has(file.path) ||
          isGeneratedPath(file.path)
      ),
    [files, generatedPaths, review]
  );
  const viewed = useViewedState(fileById, viewedModel);

  const filters = useAtomValue(diffFiltersAtom);
  const findingPaths = useMemo(
    () =>
      new Set(
        (review?.findings ?? []).flatMap((finding) =>
          finding.anchorFile === undefined ? [] : [finding.anchorFile]
        )
      ),
    [review]
  );

  const visibleFiles = files.filter((file) =>
    matchesFilters(filters, {
      hasFinding: findingPaths.has(file.path),
      status: statusForChange(file.file.type),
      viewed: viewed.isViewed(file.id),
    })
  );

  const viewedCount = files.filter((file) => viewed.isViewed(file.id)).length;

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "diff",
    storage: localStorage,
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="overflow-visible! h-[calc(100svh-(--spacing(12.5)))]!"
    >
      {diffTreeOpen && (
        <>
          <ResizablePanel
            defaultSize={250}
            minSize={200}
            id="tree"
            groupResizeBehavior="preserve-pixel-size"
            className="overflow-visible!"
          >
            <Pane>
              <DiffTree files={visibleFiles} />
            </Pane>
          </ResizablePanel>
          <ResizableHandle className="w-1.5" withHandle />
        </>
      )}

      <ResizablePanel minSize={300} id="content" className="overflow-visible!">
        <Pane>
          <div className="px-2 shrink-0 h-11 flex items-center border-b gap-1.5">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Toggle file tree"
              onClick={() => setDiffTreeOpen(!diffTreeOpen)}
            >
              <KbdHint active={isAltPressed} shortcut="[">
                <ListTree />
              </KbdHint>
            </Button>
            <Separator orientation="vertical" className="h-4" />
            <ChangeRangePicker />
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[13px] text-muted-foreground truncate tabular-nums">
                {viewedCount} / {files.length} viewed
              </span>
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Diff settings"
                    />
                  }
                >
                  <Settings />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuGroup>
                    <MenuGroupLabel>Layout</MenuGroupLabel>
                    <MenuRadioGroup
                      value={diffLayout}
                      onValueChange={setDiffLayout}
                    >
                      <MenuRadioItem value="unified">Unified</MenuRadioItem>
                      <MenuRadioItem value="split">Split</MenuRadioItem>
                    </MenuRadioGroup>
                  </MenuGroup>
                </MenuPopup>
              </Menu>
            </div>
          </div>

          <DiffCodeView
            canAuthor={!showPending}
            driftFor={showPending ? undefined : (id) => drift.get(id)}
            files={visibleFiles}
            viewed={viewed}
          />
        </Pane>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
