import { api } from "@client/api";
import { queryOptions } from "@tanstack/react-query";

export const reviewQueryOptions = queryOptions({
  queryFn: ({ signal }) => api.review.get(signal),
  queryKey: ["review"],
});
