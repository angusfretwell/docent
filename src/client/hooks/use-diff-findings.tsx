/**
 * The diff's Finding layer, factored out of `diff-view.tsx`: it folds the
 * Review's Findings, drives the inline-compose lifecycle, and produces the
 * annotated `CodeViewItem` list plus the `renderAnnotation` the renderer calls.
 * Keeping it here lets DiffView stay about the diff model and navigation.
 */

import type {
  DiffLineAnnotation,
  FileDiffMetadata,
  LineAnnotation,
} from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { foldFinding } from "@shared/lib/finding";
import type { FindingWrite } from "@shared/schemas/finding-write";
import type { FindingEntry } from "@shared/schemas/review";

import { DiffAnnotationView } from "../components/diff-annotation-view";
import type { Annotation } from "../lib/diff-annotations";
import { buildDiffItems } from "../lib/diff-annotations";
import type { DriftResult } from "../lib/drift";
import type { FileEntry } from "../lib/nav";
import { useFindingCompose } from "./use-finding-compose";

// Pending is a read-only preview (no authoring), so DiffView passes no writer;
// this stands in so the compose hook always has a target. It never runs —
// selection and the composer stay off when authoring is disabled.
async function noWrite() {
  // Intentionally empty.
}

export function useDiffFindings(params: {
  patch: string;
  entries: readonly FileEntry[];
  findings: readonly FindingEntry[];
  expanded: ReadonlyMap<string, FileDiffMetadata>;
  isViewed: (id: string) => boolean;
  /** Collapse an edge-case body (binary/image/mode/submodule, unloaded large). */
  isEdgeCollapsed: (id: string) => boolean;
  codeRef: React.RefObject<CodeViewHandle<Annotation> | null>;
  onWrite?: (write: FindingWrite) => Promise<void>;
  /** Per-Finding drift; absent on Pending, where the sync fast path stands in. */
  drift?: ReadonlyMap<string, DriftResult>;
}) {
  const byName = new Map(
    processPatch(params.patch).files.map((f, i) => [`${f.name}#${i}`, f])
  );
  function fileDiffFor(id: string) {
    return params.expanded.get(id) ?? byName.get(id);
  }

  const compose = useFindingCompose({
    codeRef: params.codeRef,
    fileDiffById: fileDiffFor,
    onWrite: params.onWrite ?? noWrite,
  });
  const folded = params.findings.map((finding) =>
    foldFinding(finding.id, finding.records)
  );
  const { drift } = params;
  const items = buildDiffItems({
    composing: compose.composing,
    ...(drift === undefined ? {} : { driftFor: (id: string) => drift.get(id) }),
    entries: params.entries,
    fileDiffFor,
    findings: folded,
    isEdgeCollapsed: params.isEdgeCollapsed,
    isExpanded: (id) => params.expanded.has(id),
    isViewed: params.isViewed,
  });

  // The comment-rendering substrate (architecture.md §4): an existing Finding
  // renders as a thread; the composer marker renders the authoring form.
  function renderAnnotation(
    annotation: DiffLineAnnotation<Annotation> | LineAnnotation<Annotation>
  ) {
    return (
      <DiffAnnotationView
        annotation={annotation}
        compose={compose}
        onWrite={params.onWrite ?? noWrite}
      />
    );
  }

  return {
    canAuthor: params.onWrite !== undefined,
    compose,
    items,
    renderAnnotation,
  };
}
