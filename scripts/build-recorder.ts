#!/usr/bin/env bun

/**
 * Bundle the rrweb recorder into one browser IIFE at
 * `dist/recorder/rrweb-recorder.js`, which `docent rrweb` prints for the capture
 * driver to eval into the app under review.
 *
 * Bundling it here rather than shipping rrweb's UMD file is what pins the
 * recorder to the same rrweb version the client's Replayer renders with: the
 * capture executor no longer resolves rrweb out of whatever repo it happens to
 * be standing in.
 *
 * Run directly (`build:recorder`) it always rebuilds; the dev and build flows
 * import `ensureRecorder` so a bundle already on disk is reused.
 */

import path from "node:path";

const root = path.join(import.meta.dir, "..");
const outdir = path.join(root, "dist", "recorder");

export const recorderBundle = path.join(outdir, "rrweb-recorder.js");

/** Rejects if the bundle fails, so a caller never proceeds against a missing recorder. */
export async function bundleRecorder(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [path.join(import.meta.dir, "recorder-entry.ts")],
    format: "iife",
    minify: true,
    naming: "rrweb-recorder.[ext]",
    outdir,
    target: "browser",
  });

  if (result.logs.length > 0) {
    console.warn("Bundled rrweb recorder with warnings:");
    for (const message of result.logs) {
      console.warn(message);
    }
  }
}

export async function ensureRecorder(): Promise<void> {
  if (await Bun.file(recorderBundle).exists()) {
    return;
  }

  await bundleRecorder();
}

if (import.meta.main) {
  try {
    await bundleRecorder();
  } catch (error) {
    console.error("Failed to bundle rrweb recorder:");
    console.error(error);
    process.exit(1);
  }
}
