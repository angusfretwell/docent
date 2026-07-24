import { ErrorComponent } from "@client/components/error";
import { CodeWalkthroughView } from "@client/features/code-walkthrough/view";
import { queryClient } from "@client/lib/query-client";
import { diffQueryOptions } from "@client/queries/diff";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/code")({
  component: CodeWalkthroughView,
  errorComponent: ErrorComponent,
  loader: () => queryClient.ensureQueryData(diffQueryOptions),
});
