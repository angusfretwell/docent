import { Change, DiffError } from "@shared/schemas/change";
import { queryOptions } from "@tanstack/react-query";
import { Schema } from "effect";

const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);

function failureMessage(body: unknown, status: number): string {
  try {
    return decodeDiffError(body).error;
  } catch {
    return `HTTP ${status}`;
  }
}

export const diffQueryOptions = queryOptions({
  queryFn: async ({ signal }) => {
    const res = await fetch("/api/diff", { signal });
    const body: unknown = await res.json();

    if (!res.ok) {
      throw new Error(failureMessage(body, res.status));
    }

    return decodeChange(body);
  },
  queryKey: ["diff"],
});
