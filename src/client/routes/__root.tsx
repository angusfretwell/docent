import { ErrorComponent } from "@client/components/error";
import { Layout } from "@client/components/layout";
import { useDocumentTitle } from "@client/hooks/use-document-title";
import { useReviewStream } from "@client/hooks/use-review-stream";
import { useWarmCache } from "@client/hooks/use-warm-cache";
import { Outlet, createRootRoute } from "@tanstack/react-router";

function RootComponent() {
  useReviewStream();
  useWarmCache();
  useDocumentTitle();

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: ErrorComponent,
});
