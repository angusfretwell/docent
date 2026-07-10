/**
 * The Diff tab's navigation chrome: a compact-folder tree beside the single
 * scroll, its substring filter, and the layout/order toggles. The tree is a
 * position indicator — the active file (driven by the scroll) highlights and
 * auto-reveals here, and clicking a row jumps the stream.
 */

import { useEffect, useRef } from "react";
import type { FileEntry, FileOrder, TreeNode } from "./nav.ts";

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
  onSelect,
}: {
  entry: FileEntry;
  depth: number;
  active: boolean;
  onSelect: (id: string) => void;
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
    <button
      className="tree-file-row"
      onClick={() => onSelect(entry.id)}
      ref={ref}
      style={{
        background: active ? "rgba(56,139,253,0.15)" : "transparent",
        paddingLeft: `${0.5 + depth * 0.85}rem`,
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
      <span style={{ flex: 1 }} />
      <Counts entry={entry} />
    </button>
  );
}

function Row({
  node,
  depth,
  collapsed,
  activeId,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  collapsed: ReadonlySet<string>;
  activeId: string | undefined;
  onToggle: (path: string) => void;
  onSelect: (id: string) => void;
}) {
  if (node.kind === "file") {
    return (
      <FileRow
        active={node.entry.id === activeId}
        depth={depth}
        entry={node.entry}
        onSelect={onSelect}
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
          />
        ))}
    </>
  );
}

export function FileTree({
  nodes,
  activeId,
  filter,
  order,
  split,
  collapsed,
  onFilterChange,
  onOrderChange,
  onSplitChange,
  onToggleDir,
  onSelect,
  onJump,
}: {
  nodes: TreeNode[];
  activeId: string | undefined;
  filter: string;
  order: FileOrder;
  split: boolean;
  collapsed: ReadonlySet<string>;
  onFilterChange: (value: string) => void;
  onOrderChange: (order: FileOrder) => void;
  onSplitChange: (split: boolean) => void;
  onToggleDir: (path: string) => void;
  onSelect: (id: string) => void;
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
            />
          ))
        )}
      </div>
    </aside>
  );
}
