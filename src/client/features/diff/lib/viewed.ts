/**
 * A file's viewed state is the **parity** of its events for the current head
 * blob: an odd count for `(path, blobSha)` means viewed. The events carry no
 * viewed/unviewed flag, so marking appends one event and unmarking appends
 * another, flipping parity back.
 *
 * Blob-keying handles cross-Change behavior with no special case: an identical
 * head blob keeps viewed; a changed blob clears it and flags `changedSinceViewed`
 * if another blob for that path was viewed; a pure rebase yields the same git
 * blob SHA, so marks persist.
 *
 * @see data-model.md §8
 */

import type { DiffFile } from "@client/lib/diff";
import type { ViewedEvent } from "@shared/schemas/review";

export interface ViewedState {
  viewed: boolean;
  changedSinceViewed: boolean;
}

export interface ViewedModel {
  states: ReadonlyMap<string, ViewedState>;
  viewed: number;
  total: number;
}

const UNVIEWED: ViewedState = { changedSinceViewed: false, viewed: false };

function countByPath(
  events: readonly ViewedEvent[]
): Map<string, Map<string, number>> {
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
 * `autoViewed` files (generated, pure renames) start from a viewed baseline:
 * zero events reads as viewed, the first event un-views. The baseline re-applies
 * at each new head blob, so they never flag changed-since-viewed.
 */
function foldFile(
  counts: Map<string, number> | undefined,
  blobSha: string,
  autoViewed: boolean
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
 * `total` is the file count regardless of how many carry events, so progress
 * reflects the whole re-review owed.
 */
export function computeViewed(
  events: readonly ViewedEvent[],
  files: readonly DiffFile[],
  isAutoViewed?: (file: DiffFile) => boolean
): ViewedModel {
  const byPath = countByPath(events);
  const states = new Map<string, ViewedState>();
  let viewed = 0;

  for (const file of files) {
    const state = foldFile(
      byPath.get(file.path),
      file.blobSha,
      isAutoViewed?.(file) ?? false
    );
    states.set(file.id, state);
    if (state.viewed) {
      viewed += 1;
    }
  }

  return { states, total: files.length, viewed };
}

/** Defaults to unviewed for an unknown id. */
export function viewedStateFor(model: ViewedModel, id: string): ViewedState {
  return model.states.get(id) ?? UNVIEWED;
}
