import { ErrorComponent } from "@client/components/error";
import { DiffView } from "@client/features/diff/view";
import { queryClient } from "@client/lib/query-client";
import { diffQueryOptions } from "@client/queries/diff";
import { pendingRanges } from "@shared/enums/pending-range";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";

const SEARCH_DEFAULTS = {
  range: "incremental",
  view: "change",
} as const;

const searchSchema = z.object({
  range: z
    .enum(pendingRanges)
    .default(SEARCH_DEFAULTS.range)
    .catch(SEARCH_DEFAULTS.range),
  view: z
    .enum(["change", "pending"])
    .default(SEARCH_DEFAULTS.view)
    .catch(SEARCH_DEFAULTS.view),
});

export const Route = createFileRoute("/")({
  component: DiffView,
  errorComponent: ErrorComponent,
  loader: () => queryClient.ensureQueryData(diffQueryOptions),
  search: {
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },
  validateSearch: searchSchema,
});
