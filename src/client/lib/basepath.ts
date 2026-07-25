import { trim } from "radashi";

/**
 * The path the client is mounted at, read from the host document so that every
 * bundling mode — the dev server, the compiled binary, and the static site —
 * configures it the same way, with no build-script coordination. Accepts
 * `/demo`, `/demo/`, and `demo` alike; absent means the root mount.
 */
function mountedAt(): string {
  const meta = document.querySelector('meta[name="docent-basepath"]');
  const path = trim(meta?.getAttribute("content") ?? "", "/");

  return path === "" ? "" : `/${path}`;
}

export const basepath = mountedAt();

export const apiBaseUrl = `${basepath}/api/`;

export const eventsUrl = `${basepath}/api/events`;

export const diffWorkerUrl = `${basepath}/diff-worker.js`;

/** TanStack Router treats `"/"` as unset, so a root mount stays byte-identical. */
export const routerBasepath = basepath === "" ? "/" : basepath;
