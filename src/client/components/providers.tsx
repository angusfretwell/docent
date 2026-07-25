import { CodeViewWorkerPool } from "@client/features/code-view/worker-pool";
import { queryClient } from "@client/lib/query-client";
import { QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <CodeViewWorkerPool>{children}</CodeViewWorkerPool>
    </QueryClientProvider>
  );
}
