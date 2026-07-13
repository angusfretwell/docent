/**
 * Surface components and pure helpers shared between the diff, code
 * walkthrough, and product walkthrough surfaces. Kept as its own feature so
 * the surfaces never import each other directly.
 */

export { CodeViewWorkerPool } from "./code-view-worker-pool";
export { Composer } from "./composer";
export { DetachedSection } from "./detached-section";
export { DriftPill } from "./drift-badge";
export { FindingThread } from "./finding-thread";
export { StalenessBadge } from "./staleness-badge";
export { narrativeBySectionId } from "./walkthrough-narrative";
