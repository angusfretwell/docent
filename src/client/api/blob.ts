import { client } from "./client";

export function text(sha: string, signal?: AbortSignal): Promise<string> {
  return client.get(`blob/${sha}`, { signal }).text();
}
