/**
 * The Diff tab's navigation chrome: a compact-folder tree beside the single
 * scroll, its substring filter, the layout/order toggles, the review-progress
 * read-out, and the viewed / has-findings quick filters. The tree is a position
 * indicator — the active file (driven by the scroll) highlights and auto-reveals
 * here, and each row carries the mark-as-viewed checkbox (diff-review.md §3).
 */

import { useEffect, useRef } from "react";
import type { FileEntry, FileOrder, TreeNode } from "./nav.ts";

/** Per-file viewed read-out for a tree row (folded upstream in DiffView). */
export interface RowState {
  viewed: boolean;
  /** The head blob changed since a prior content of this file was viewed. */
  changed: boolean;
  /** Generated/lockfile/vendored — de-emphasized in the tree (diff-review.md §5). */
  generated: boolean;
}

const BADGE_COLOR: Record<FileEntry["changeType"], string> = {
  A: "#3fb950",
  D: "#f85149",
  M: "#d29922",
  R: "#a371f7",
};

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function Badge({ type }: { type: FileEntry["changeType"] }) {
  return (
    <span style={{ color: BADGE_COLOR[type], fontWeight: 600, marginLeft: "0.5rem" }}>{type}</span>
  );
}

function Counts({ entry }: { entry: FileEntry }) {
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: "0.5rem" }}>
      {entry.additions > 0 && <span style={{ color: BADGE_COLOR.A }}>+{entry.additions}</span>}
      {entry.deletions > 0 && (
        <span style={{ color: BADGE_COLOR.D, marginLeft: "0.25rem" }}>−{entry.deletions}</span>
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
      className="tree-file-row-wrap"
      style={{
        background: active ? "rgba(56,139,253,0.15)" : "transparent",
        paddingLeft: `${0.5 + depth * 0.85}rem`,
      }}
    >
      <input
        aria-label={`Mark ${entry.path} viewed`}
        checked={state?.viewed ?? false}
        className="tree-viewed-check"
        onChange={() => onToggleViewed(entry.id)}
        type="checkbox"
      />
      <button
        className="tree-file-row"
        onClick={() => onSelect(entry.id)}
        ref={ref}
        style={{
          fontStyle: state?.generated ? "italic" : "normal",
          opacity: state?.viewed || state?.generated ? 0.55 : 1,
        }}
        type="button"
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {basename(entry.path)}
        </span>
        <Badge type={entry.changeType} />
        {state?.generated ? <span className="tree-generated">generated</span> : null}
        <span style={{ flex: 1 }} />
        {state?.changed ? (
          <span className="viewed-changed" style={{ marginLeft: "0.4rem" }}>
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
        className="tree-dir-row"
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
  activeId,
  filter,
  order,
  split,
  collapsed,
  rowStates,
  progress,
  unviewedOnly,
  findingsOnly,
  onFilterChange,
  onOrderChange,
  onSplitChange,
  onToggleDir,
  onSelect,
  onToggleViewed,
  onUnviewedOnlyChange,
  onFindingsOnlyChange,
  onJump,
}: {
  nodes: TreeNode[];
  activeId: string | undefined;
  filter: string;
  order: FileOrder;
  split: boolean;
  collapsed: ReadonlySet<string>;
  rowStates: ReadonlyMap<string, RowState>;
  progress: { viewed: number; total: number };
  unviewedOnly: boolean;
  findingsOnly: boolean;
  onFilterChange: (value: string) => void;
  onOrderChange: (order: FileOrder) => void;
  onSplitChange: (split: boolean) => void;
  onToggleDir: (path: string) => void;
  onSelect: (id: string) => void;
  onToggleViewed: (id: string) => void;
  onUnviewedOnlyChange: (value: boolean) => void;
  onFindingsOnlyChange: (value: boolean) => void;
  onJump: (kind: "file" | "change", direction: 1 | -1) => void;
}) {
  return (
    <aside
      style={{
        borderRight: "1px solid rgba(128,128,128,0.25)",
        display: "flex",
        flexDirection: "column",
        fontSize: "0.85rem",
        height: "100%",
        width: "22rem",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid rgba(128,128,128,0.25)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          padding: "0.5rem",
        }}
      >
        <Progress total={progress.total} viewed={progress.viewed} />
        <input
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Filter files…"
          style={{
            background: "transparent",
            border: "1px solid rgba(128,128,128,0.35)",
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
          <button onClick={() => onOrderChange(order === "size" ? "path" : "size")} type="button">
            {order === "size" ? "Sort: size" : "Sort: path"}
          </button>
          <button onClick={() => onSplitChange(!split)} type="button">
            {split ? "Split" : "Unified"}
          </button>
          <span style={{ flex: 1 }} />
          <button aria-label="Previous file" onClick={() => onJump("file", -1)} type="button">
            ↑file
          </button>
          <button aria-label="Next file" onClick={() => onJump("file", 1)} type="button">
            ↓file
          </button>
          <button aria-label="Previous change" onClick={() => onJump("change", -1)} type="button">
            ↑hunk
          </button>
          <button aria-label="Next change" onClick={() => onJump("change", 1)} type="button">
            ↓hunk
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0.25rem 0" }}>
        {nodes.length === 0 ? (
          <p style={{ opacity: 0.6, padding: "0.5rem" }}>No matching files.</p>
        ) : (
          nodes.map((node) => (
            <Row
              activeId={activeId}
              collapsed={collapsed}
              depth={0}
              key={node.kind === "dir" ? node.path : node.entry.id}
              node={node}
              onSelect={onSelect}
              onToggle={onToggleDir}
              onToggleViewed={onToggleViewed}
              rowStates={rowStates}
            />
          ))
        )}
      </div>
    </aside>
  );
}
