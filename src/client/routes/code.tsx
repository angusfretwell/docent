import { ErrorComponent } from "@client/components/error";
import { CodeWalkthroughView } from "@client/features/code-walkthrough/view";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/code")({
  component: CodeWalkthroughView,
  errorComponent: ErrorComponent,
});
