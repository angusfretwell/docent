import { diffWorkerUrl } from "./basepath";

export const themes = {
  dark: "pierre-dark-soft",
  light: "pierre-light",
} as const;

// Tokenization must stay off the main thread, or scroll drops long frames.
export function workerFactory() {
  // Bun's bundler can't bundle a Web Worker via `new Worker(new URL(…, import.meta.url))` (oven-sh/bun#29478), so it's pre-bundled and served at this fixed route under the mount.
  return new Worker(diffWorkerUrl, {
    type: "module",
  });
}
