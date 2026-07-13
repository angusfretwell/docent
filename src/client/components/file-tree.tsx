/**
 * The Diff tab's navigation chrome: a compact-folder tree beside the single
 * scroll, its substring filter, the layout/order toggles, the review-progress
 * read-out, and the viewed / has-findings quick filters. The tree is a position
 * indicator — the active file (driven by the scroll) highlights and auto-reveals
 * here, and each row carries the mark-as-viewed checkbox (diff-review.md §3).
 */

import { useEffect, useRef } from "react";

import type { FileEntry, FileOrder, TreeNode } from "../lib/nav";
import { cn } from "../lib/utils";

/** Per-file viewed read-out for a tree row (folded upstream in DiffView). */
export interface RowState {
  viewed: boolean;
  /** The head blob changed since a prior content of this file was viewed. */
  changed: boolean;
  /** Generated/lockfile/vendored — de-emphasized in the tree (diff-review.md §5). */
  generated: boolean;
}

/** Per-file viewed rows and the toggle handler both DiffScroll and FileTree render/drive. */
export interface ViewedRows {
  rowStates: ReadonlyMap<string, RowState>;
  onToggleViewed: (id: string) => void;
}

/** The tree's position/jump surface: the active-file highlight, select, and keyboard jump. */
export interface FileTreeNav {
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onJump: (kind: "file" | "change", direction: 1 | -1) => void;
}

const BADGE_CLASS: Record<FileEntry["changeType"], string> = {
  A: "text-success-foreground",
  D: "text-destructive-foreground",
  M: "text-warning-foreground",
  R: "text-purple-600 dark:text-purple-400",
};

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/** The A/M/D/R change-type letter beside a file name. */
function ChangeTypeBadge({ type }: { type: FileEntry["changeType"] }) {
  return (
    <span className={cn("ml-2 font-mono font-semibold", BADGE_CLASS[type])}>
      {type}
    </span>
  );
}

function Counts({ entry }: { entry: FileEntry }) {
  return (
    <span className="ml-2 tabular-nums">
      {entry.additions > 0 && (
        <span className="text-success-foreground">+{entry.additions}</span>
      )}
      {entry.deletions > 0 && (
        <span className="ml-1 text-destructive-foreground">
          −{entry.deletions}
        </span>
      )}
    </span>
  );
}

function FileRow({
  entry,
  depth,
  active,
  state,
  onSelect,
  onToggleViewed,
}: {
  entry: FileEntry;
  depth: number;
  active: boolean;
  state: RowState | undefined;
  onSelect: (id: string) => void;
  onToggleViewed: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Auto-reveal: when the scroll makes this the active file, bring its row
  // into view without stealing focus.
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);
  return (
    <div
      className={cn("flex items-center gap-[0.35rem]", active && "bg-accent")}
      style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}
    >
      <input
        aria-label={`Mark ${entry.path} viewed`}
        checked={state?.viewed ?? false}
        className="tree-viewed-check"
        onChange={() => onToggleViewed(entry.id)}
        type="checkbox"
      />
      <button
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center px-2 py-[0.15rem] text-left hover:bg-accent",
          (state?.viewed || state?.generated) && "opacity-55",
          state?.generated && "italic"
        )}
        onClick={() => onSelect(entry.id)}
        ref={ref}
        type="button"
      >
        <span className="truncate">{basename(entry.path)}</span>
        <ChangeTypeBadge type={entry.changeType} />
        {state?.generated ? (
          <span className="ml-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            generated
          </span>
        ) : null}
        <span className="flex-1" />
        {state?.changed ? (
          <span className="ml-1.5 text-[0.7rem] uppercase tracking-wide text-warning-foreground">
            changed
          </span>
        ) : null}
        <Counts entry={entry} />
      </button>
    </div>
  );
}

function Row({
  node,
  depth,
  collapsed,
  activeId,
  rowStates,
  onToggle,
  onSelect,
  onToggleViewed,
}: {
  node: TreeNode;
  depth: number;
  collapsed: ReadonlySet<string>;
  activeId: string | undefined;
  rowStates: ReadonlyMap<string, RowState>;
  onToggle: (path: string) => void;
  onSelect: (id: string) => void;
  onToggleViewed: (id: string) => void;
}) {
  if (node.kind === "file") {
    return (
      <FileRow
        active={node.entry.id === activeId}
        depth={depth}
        entry={node.entry}
        onSelect={onSelect}
        onToggleViewed={onToggleViewed}
        state={rowStates.get(node.entry.id)}
      />
    );
  }
  const isCollapsed = collapsed.has(node.path);
  return (
    <>
      <button
        className="block w-full cursor-pointer px-2 py-[0.15rem] text-left text-muted-foreground hover:bg-accent"
        onClick={() => onToggle(node.path)}
        style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}
        type="button"
      >
        {isCollapsed ? "▸" : "▾"} {node.name}
      </button>
      {!isCollapsed &&
        node.children.map((child) => (
          <Row
            activeId={activeId}
            collapsed={collapsed}
            depth={depth + 1}
            key={child.kind === "dir" ? child.path : child.entry.id}
            node={child}
            onSelect={onSelect}
            onToggle={onToggle}
            onToggleViewed={onToggleViewed}
            rowStates={rowStates}
          />
        ))}
    </>
  );
}

/** A toggle button for one tree quick filter (unviewed-only, has-findings). */
function QuickFilter({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={active ? "quick-filter is-active" : "quick-filter"}
      onClick={onToggle}
      type="button"
    >
      {label}
    </button>
  );
}

/** The review-progress read-out: viewed / total files plus a thin bar. */
function Progress({ viewed, total }: { viewed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((viewed / total) * 100);
  return (
    <div className="viewed-progress">
      <div
        style={{
          display: "flex",
          fontVariantNumeric: "tabular-nums",
          justifyContent: "space-between",
        }}
      >
        <span>Review progress</span>
        <span>
          {viewed} / {total} viewed
        </span>
      </div>
      <div className="viewed-bar">
        <div className="viewed-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FileTree({
  nodes,
  nav,
  filter,
  order,
  explicitOrder,
  split,
  collapsed,
  viewed,
  progress,
  unviewedOnly,
  findingsOnly,
  onFilterChange,
  onOrderChange,
  onSplitChange,
  onToggleDir,
  onUnviewedOnlyChange,
  onFindingsOnlyChange,
}: {
  nodes: TreeNode[];
  nav: FileTreeNav;
  filter: string;
  order: FileOrder;
  /** A walkthrough-order override is active, overriding the path/size toggle. */
  explicitOrder: boolean;
  split: boolean;
  collapsed: ReadonlySet<string>;
  viewed: ViewedRows;
  progress: { viewed: number; total: number };
  unviewedOnly: boolean;
  findingsOnly: boolean;
  onFilterChange: (value: string) => void;
  onOrderChange: (order: FileOrder) => void;
  onSplitChange: (split: boolean) => void;
  onToggleDir: (path: string) => void;
  onUnviewedOnlyChange: (value: boolean) => void;
  onFindingsOnlyChange: (value: boolean) => void;
}) {
  const { onSelect } = nav;
  const { onToggleViewed } = viewed;

  // The sort control doubles as the walkthrough-order exit: while an explicit
  // order is active it reads "Sort: walkthrough" and returns to the persisted
  // path/size sort; otherwise it toggles between path and size.
  let orderLabel = order === "size" ? "Sort: size" : "Sort: path";
  let nextOrder: FileOrder = order === "size" ? "path" : "size";
  if (explicitOrder) {
    orderLabel = "Sort: walkthrough";
    nextOrder = order;
  }

  return (
    <aside className="flex h-full w-[22rem] flex-col border-r text-[0.85rem]">
      <div className="flex flex-col gap-2 border-b p-2">
        <Progress total={progress.total} viewed={progress.viewed} />
        <input
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Filter files…"
          style={{
            background: "transparent",
            border: "1px solid var(--color-input)",
            borderRadius: "0.25rem",
            color: "inherit",
            font: "inherit",
            padding: "0.25rem 0.5rem",
          }}
          type="search"
          value={filter}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          <QuickFilter
            active={unviewedOnly}
            label="Unviewed"
            onToggle={() => onUnviewedOnlyChange(!unviewedOnly)}
          />
          <QuickFilter
            active={findingsOnly}
            label="Has findings"
            onToggle={() => onFindingsOnlyChange(!findingsOnly)}
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          <button onClick={() => onOrderChange(nextOrder)} type="button">
            {orderLabel}
          </button>
          <button onClick={() => onSplitChange(!split)} type="button">
            {split ? "Split" : "Unified"}
          </button>
          <span style={{ flex: 1 }} />
          <button
            aria-label="Previous file"
            onClick={() => nav.onJump("file", -1)}
            type="button"
          >
            ↑file
          </button>
          <button
            aria-label="Next file"
            onClick={() => nav.onJump("file", 1)}
            type="button"
          >
            ↓file
          </button>
          <button
            aria-label="Previous change"
            onClick={() => nav.onJump("change", -1)}
            type="button"
          >
            ↑hunk
          </button>
          <button
            aria-label="Next change"
            onClick={() => nav.onJump("change", 1)}
            type="button"
          >
            ↓hunk
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {nodes.length === 0 ? (
          <p className="p-2 text-muted-foreground">No matching files.</p>
        ) : (
          nodes.map((node) => (
            <Row
              activeId={nav.activeId}
              collapsed={collapsed}
              depth={0}
              key={node.kind === "dir" ? node.path : node.entry.id}
              node={node}
              onSelect={onSelect}
              onToggle={onToggleDir}
              onToggleViewed={onToggleViewed}
              rowStates={viewed.rowStates}
            />
          ))
        )}
      </div>
    </aside>
  );
}
