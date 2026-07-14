import { ErrorComponent } from "@client/components/error";
import { ProductWalkthroughView } from "@client/components/product-walkthrough/view";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/product")({
  component: ProductWalkthroughView,
  errorComponent: ErrorComponent,
});
