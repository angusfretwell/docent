/**
 * The mark-as-viewed read-model: a pure fold of the Dossier's append-only
 * viewed events against the current Change's files. Nothing here is persisted —
 * viewed state, the "changed since viewed" flag, and review progress are all
 * derived on every render, so a new Change recomputes them automatically
 * (diff-review.md §3, data-model.md §8). No DOM or React here.
 *
 * ## Keying and toggle semantics
 *
 * Each event is `{ path, blobSha, ts }` (data-model.md §8) — there is no
 * viewed/unviewed flag in the pinned shape, so a file's viewed state is the
 * **parity** of its events for the current head blob: an odd number of events
 * for `(path, headBlobSha)` means viewed. Marking appends one event; unmarking
 * appends another (flipping parity back). This honors the append-only,
 * lock-free store literally while still letting the checkbox toggle. The writer
 * only appends when the intended state actually flips, so parity stays honest.
 *
 * ## Cross-Change behavior (all three fall out of blob-keying)
 *
 * - Head blob byte-identical across Changes → the same `blobSha` still matches →
 *   viewed persists.
 * - Head blob changed → no matching event for the new `blobSha` → viewed clears,
 *   and if some other blob for that path was viewed the file flags
 *   `changedSinceViewed`.
 * - A pure rebase leaving content identical yields the same git blob SHA
 *   (content-addressed), so the marks are kept — no special case needed.
 */

import type { ViewedEvent } from "@shared/schemas/dossier.ts";
import type { FileEntry } from "./nav.ts";

export interface ViewedState {
  /** The file's current head content has been asserted seen. */
  viewed: boolean;
  /** A prior content of this file was viewed, but the head blob has since changed. */
  changedSinceViewed: boolean;
}

export interface ViewedModel {
  /** Per-file state, keyed by `FileEntry.id`. */
  states: ReadonlyMap<string, ViewedState>;
  /** Viewed file count — the numerator of the progress read-model. */
  viewed: number;
  /** Total file count in the Change — the denominator. */
  total: number;
}

const UNVIEWED: ViewedState = { changedSinceViewed: false, viewed: false };

/** Group events by path into a `blobSha → event count` map (parity source). */
function countByPath(events: readonly ViewedEvent[]): Map<string, Map<string, number>> {
  const byPath = new Map<string, Map<string, number>>();
  for (const event of events) {
    let counts = byPath.get(event.path);
    if (counts === undefined) {
      counts = new Map();
      byPath.set(event.path, counts);
    }
    counts.set(event.blobSha, (counts.get(event.blobSha) ?? 0) + 1);
  }
  return byPath;
}

function isOdd(count: number | undefined): boolean {
  return count !== undefined && count % 2 === 1;
}

/**
 * Fold one file's viewed state from its per-blob event counts. `autoViewed`
 * files (generated, pure renames) start from a viewed baseline: zero events
 * reads as viewed, and the first appended event un-views (parity flipped). The
 * default re-applies at each new head blob, so they never flag changed-since-
 * viewed — they carry nothing to re-review.
 */
function foldFile(
  counts: Map<string, number> | undefined,
  blobSha: string,
  autoViewed: boolean,
): ViewedState {
  if (autoViewed) {
    return { changedSinceViewed: false, viewed: !isOdd(counts?.get(blobSha)) };
  }
  const viewed = isOdd(counts?.get(blobSha));
  if (viewed || counts === undefined) {
    return { changedSinceViewed: false, viewed };
  }
  let changedSinceViewed = false;
  for (const [sha, count] of counts) {
    if (sha !== blobSha && sha !== "" && isOdd(count)) {
      changedSinceViewed = true;
      break;
    }
  }
  return { changedSinceViewed, viewed: false };
}

/**
 * Fold the viewed events against the Change's files into per-file state plus the
 * `viewed / total` progress count. `total` is the file count regardless of how
 * many carry events, so progress reflects the whole re-review owed.
 */
export function computeViewed(
  events: readonly ViewedEvent[],
  entries: readonly FileEntry[],
  isAutoViewed?: (entry: FileEntry) => boolean,
): ViewedModel {
  const byPath = countByPath(events);
  const states = new Map<string, ViewedState>();
  let viewed = 0;
  for (const entry of entries) {
    const state = foldFile(byPath.get(entry.path), entry.blobSha, isAutoViewed?.(entry) ?? false);
    states.set(entry.id, state);
    if (state.viewed) {
      viewed += 1;
    }
  }
  return { states, total: entries.length, viewed };
}

/** Look up a file's state, defaulting to unviewed for an unknown id. */
export function viewedStateFor(model: ViewedModel, id: string): ViewedState {
  return model.states.get(id) ?? UNVIEWED;
}
