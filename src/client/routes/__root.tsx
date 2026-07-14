import { Layout } from "@client/components/layout";
import { useReviewStream } from "@client/hooks/use-review-stream";
import { Outlet, createRootRoute } from "@tanstack/react-router";

function RootComponent() {
  useReviewStream();

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
