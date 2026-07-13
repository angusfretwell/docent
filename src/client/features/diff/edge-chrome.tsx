/**
 * The presentational chrome for the Diff tab's edge cases (diff-review.md §5).
 * `CodeView` renders ordinary diff bodies; these components render the
 * *surrounding* chrome in the sticky file header — an informational row (binary
 * size delta, mode `x→y`, submodule `sha→sha`, `old → new` rename) or the
 * side-by-side before/after image comparison — while the body itself is
 * collapsed by the caller. Classification lives in `edge-cases.ts`; this file is
 * only the rendering.
 */

import { blobSizeQuery } from "@client/data/blobs";
import { blobUrl } from "@client/lib/blobs";
import type { FileClass } from "@client/lib/edge-cases";
import { Badge } from "@client/ui/badge";
import { Button } from "@client/ui/button";
import type { ChangeTypes, FileDiffMetadata } from "@pierre/diffs";
import { formatBytes, isRealObjectId } from "@shared/lib/drift";
import { useQuery } from "@tanstack/react-query";

const edgeRowClass =
  "inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground";
const edgeMonoClass = "font-mono text-xs";

/** The uppercase chip labelling an edge-case row (`Binary`, `Renamed`, …). */
function EdgeChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge className="uppercase tracking-wide" size="sm" variant="outline">
      {children}
    </Badge>
  );
}

// Human-readable change type for the binary row (diff-review.md §5:
// "change type + size delta").
const CHANGE_TYPE_LABEL: Record<ChangeTypes, string> = {
  change: "Modified",
  deleted: "Deleted",
  new: "Added",
  "rename-changed": "Renamed",
  "rename-pure": "Renamed",
};

/** A signed byte-delta, e.g. `+2.2 KB` / `−1.0 KB`, or empty when unchanged. */
function formatDelta(delta: number): string {
  if (delta === 0) {
    return "";
  }
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatBytes(Math.abs(delta))}`;
}

function abbreviate(sha: string): string {
  return sha.slice(0, 7);
}

function shortMode(mode: string | undefined): string {
  // Git modes are 6-octal-digit; the last three are the meaningful permission
  // bits (100644 → 644), which is what a reviewer reads.
  return mode === undefined ? "?" : mode.slice(-3);
}

/**
 * The binary size-delta row: `Binary · 1.2 KB → 3.4 KB (+2.2 KB)`. Sizes come
 * from `/api/blob/:sha/size` (header-only, never the bytes); a missing side of
 * an add/delete resolves to 0. Best-effort — a failed size fetch just omits the
 * numbers, keeping the `Binary` label.
 */
function BinarySizeRow({ item }: { item: FileDiffMetadata }) {
  // Best-effort: either side erroring leaves `sizes` undefined, so the label
  // renders without numbers rather than half a delta.
  const before = useQuery(blobSizeQuery(item.prevObjectId));
  const after = useQuery(blobSizeQuery(item.newObjectId));
  const sizes =
    before.data !== undefined && after.data !== undefined
      ? { after: after.data, before: before.data }
      : undefined;

  const delta = sizes ? formatDelta(sizes.after - sizes.before) : "";
  return (
    <span className={edgeRowClass}>
      <EdgeChip>Binary</EdgeChip>
      <span>{CHANGE_TYPE_LABEL[item.type]}</span>
      {sizes ? (
        <span className={edgeMonoClass}>
          {formatBytes(sizes.before)} → {formatBytes(sizes.after)}
          {delta === "" ? null : ` (${delta})`}
        </span>
      ) : null}
    </span>
  );
}

/** One before/after image cell, or a placeholder when that side has no blob. */
function ImageCell({ label, sha }: { label: string; sha: string | undefined }) {
  return (
    <span className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      {isRealObjectId(sha) ? (
        <img
          alt={label}
          className="max-h-[200px] max-w-[240px] rounded-sm border object-contain [background:repeating-conic-gradient(var(--color-border)_0%_25%,transparent_0%_50%)_50%/16px_16px]"
          src={blobUrl(sha)}
        />
      ) : (
        <span className={edgeMonoClass}>(none)</span>
      )}
    </span>
  );
}

/**
 * Side-by-side before/after image comparison (diff-review.md §5). Both blobs
 * load from `/api/blob/:sha`; `<img>` sniffs the bytes, so the octet-stream
 * content type is fine. Onion-skin/swipe is deferred behind this.
 */
function ImageCompare({ item }: { item: FileDiffMetadata }) {
  return (
    <span className="flex flex-wrap gap-3 py-2">
      <ImageCell label="Before" sha={item.prevObjectId} />
      <ImageCell label="After" sha={item.newObjectId} />
    </span>
  );
}

/** A plain informational row: a chip label plus a monospace detail. */
function InfoRow({ label, detail }: { label: string; detail: string }) {
  return (
    <span className={edgeRowClass}>
      <EdgeChip>{label}</EdgeChip>
      <span className={edgeMonoClass}>{detail}</span>
    </span>
  );
}

/** The `old → new` rename header (diff-review.md §5). */
function RenameHeader({ item }: { item: FileDiffMetadata }) {
  return (
    <InfoRow
      detail={`${item.prevName ?? "?"} → ${item.name}`}
      label="Renamed"
    />
  );
}

/** The `Load diff` / `Collapse` toggle for an oversized or minified file. */
function LargeToggle({
  loaded,
  onToggle,
}: {
  loaded: boolean;
  onToggle: () => void;
}) {
  return (
    <Button onClick={onToggle} size="xs" variant="outline">
      {loaded ? "Collapse" : "Load diff"}
    </Button>
  );
}

/**
 * Dispatch a file's edge-case chrome for the sticky header. Renders nothing for
 * an ordinary file; the caller pairs this with the collapsed body. Image wins
 * over the generic binary row; rename/mode/submodule are informational.
 */
export function EdgeChrome({
  item,
  file,
  largeLoaded,
  onToggleLarge,
}: {
  item: FileDiffMetadata;
  file: FileClass;
  largeLoaded: boolean;
  onToggleLarge: () => void;
}) {
  if (file.image) {
    return <ImageCompare item={item} />;
  }
  if (file.binary) {
    return <BinarySizeRow item={item} />;
  }
  if (file.submodule) {
    return (
      <InfoRow
        detail={`${abbreviate(item.prevObjectId ?? "?")} → ${abbreviate(item.newObjectId ?? "?")}`}
        label="Submodule"
      />
    );
  }
  if (file.modeOnly) {
    return (
      <InfoRow
        detail={`${shortMode(item.prevMode)} → ${shortMode(item.mode)}`}
        label="Mode"
      />
    );
  }
  if (file.renamePure || file.renameModify) {
    return (
      <span className={edgeRowClass}>
        <RenameHeader item={item} />
        {file.large ? (
          <LargeToggle loaded={largeLoaded} onToggle={onToggleLarge} />
        ) : null}
      </span>
    );
  }
  if (file.large) {
    return <LargeToggle loaded={largeLoaded} onToggle={onToggleLarge} />;
  }
  return null;
}
