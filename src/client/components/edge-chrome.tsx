/**
 * The presentational chrome for the Diff tab's edge cases (diff-review.md §5).
 * `CodeView` renders ordinary diff bodies; these components render the
 * *surrounding* chrome in the sticky file header — an informational row (binary
 * size delta, mode `x→y`, submodule `sha→sha`, `old → new` rename) or the
 * side-by-side before/after image comparison — while the body itself is
 * collapsed by the caller. Classification lives in `edge-cases.ts`; this file is
 * only the rendering.
 */

import type { ChangeTypes, FileDiffMetadata } from "@pierre/diffs";
import { useEffect, useState } from "react";

import { blobUrl, fetchBlobSize, isRealObjectId } from "../lib/blobs";
import { formatBytes } from "../lib/edge-cases";
import type { FileClass } from "../lib/edge-cases";

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
  const { prevObjectId, newObjectId } = item;
  const [sizes, setSizes] = useState<
    { before: number; after: number } | undefined
  >();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchBlobSize(prevObjectId), fetchBlobSize(newObjectId)])
      .then(([before, after]) => {
        if (!cancelled) {
          setSizes({ after, before });
        }
      })
      .catch(() => {
        // Best-effort: leave the label without sizes on a failed fetch.
      });
    return () => {
      cancelled = true;
    };
  }, [prevObjectId, newObjectId]);

  const delta = sizes ? formatDelta(sizes.after - sizes.before) : "";
  return (
    <span className="edge-row">
      <span className="edge-chip">Binary</span>
      <span>{CHANGE_TYPE_LABEL[item.type]}</span>
      {sizes ? (
        <span className="edge-mono">
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
    <span className="edge-image-cell">
      <span>{label}</span>
      {isRealObjectId(sha) ? (
        <img alt={label} className="edge-image" src={blobUrl(sha)} />
      ) : (
        <span className="edge-mono" style={{ opacity: 0.6 }}>
          (none)
        </span>
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
    <span className="edge-image-compare">
      <ImageCell label="Before" sha={item.prevObjectId} />
      <ImageCell label="After" sha={item.newObjectId} />
    </span>
  );
}

/** A plain informational row: a chip label plus a monospace detail. */
function InfoRow({ label, detail }: { label: string; detail: string }) {
  return (
    <span className="edge-row">
      <span className="edge-chip">{label}</span>
      <span className="edge-mono">{detail}</span>
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
    <button className="expand-context" onClick={onToggle} type="button">
      {loaded ? "Collapse" : "Load diff"}
    </button>
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
      <span className="edge-row">
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
