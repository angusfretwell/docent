/**
 * The drift data shapes — a Finding anchor's standing against the newest Change
 * (data-model.md §6). Runtime-neutral type declarations only: no Bun or DOM
 * globals. The pure folds that compute drift (`reanchorRange`, `planDrift`,
 * `driftBadge`, `changeHistory`) live beside this in `lib/drift.ts`.
 */

/** A content-addressed anchor's standing against the newest Change (§6.1). */
export type DriftState = "live" | "shifted" | "outdated";

/** A re-anchored line range plus the state that placed it there. */
export interface Reanchor {
  /** Born range for live/outdated; the moved range for shifted. */
  lines: [number, number];
  state: DriftState;
}

/** The current-Change facts a code anchor is judged against — all synchronous from the patch. */
export interface AnchorContext {
  /** The blob sha on the anchor's own side in the current Change; absent ⇒ file unchanged base..head. */
  currentSideSha?: string;
  /** The file is deleted in the current Change. */
  deleted?: boolean;
  /** The file is renamed away from the anchor's born path. */
  renamed?: boolean;
}

/**
 * A drift decision: either a state settled by a §6.1 fast path, or a request to
 * fetch the born and current blobs and run `reanchorRange`.
 */
export type DriftPlan =
  | { kind: "resolved"; state: DriftState }
  | { bornSha: string; currentSha: string; kind: "reanchor"; range: [number, number] };

/** A drift badge — an informational note, a re-check signal, or a settled marker. */
export interface DriftBadge {
  label: string;
  tone: "info" | "signal" | "muted";
}

/** What a milestone record did to the Finding. */
export type ChangeVerb = "opened" | "replied" | "resolved" | "reopened";

/** One cross-Change milestone: what happened and the Change it was authored on. */
export interface ChangeEvent {
  changeId: string;
  verb: ChangeVerb;
}
