import { trim } from "radashi";

/** Accepts `/demo`, `/demo/`, and `demo` alike; empty content means the root mount. */
export function resolveBasepath(content: string | null): string {
  const path = trim(content ?? "", "/");

  return path === "" ? "" : `/${path}`;
}

/**
 * The path the client is mounted at, read from the host document so that every
 * bundling mode — the dev server, the compiled binary, and the static website —
 * configures it the same way, with no build-script coordination.
 */
function mountedAt(): string {
  if (typeof document === "undefined") {
    return "";
  }

  const meta = document.querySelector('meta[name="docent-basepath"]');

  return resolveBasepath(meta?.getAttribute("content") ?? null);
}

export const basepath = mountedAt();

export const apiBaseUrl = `${basepath}/api/`;

export const eventsUrl = `${basepath}/api/events`;

export const diffWorkerUrl = `${basepath}/diff-worker.js`;

/** TanStack Router treats `"/"` as unset, so a root mount stays byte-identical. */
export const routerBasepath = basepath === "" ? "/" : basepath;
