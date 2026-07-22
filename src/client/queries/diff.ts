import { api } from "@client/api";
import { queryOptions } from "@tanstack/react-query";

export const diffQueryOptions = queryOptions({
  queryFn: ({ signal }) => api.diff.get(signal),
  queryKey: ["diff"],
});
