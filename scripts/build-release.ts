#!/usr/bin/env bun

/**
 * Cross-compile the per-platform release binaries into `dist/release/`, named
 * exactly as the npm shim requests them (`assetNameFor`), so a GitHub Release
 * that uploads this directory serves every asset `npx @angusfretwell/docent`
 * downloads on first run. Run by the release workflow after `build:worker`.
 */

import path from "node:path";

import { assetNameFor } from "../npm/lib.mjs";
import { compileDocent } from "./build-docent.ts";

const root = path.join(import.meta.dir, "..");
const outdir = path.join(root, "dist", "release");

/** Bun compile targets paired with the Node platform/arch the shim maps from. */
const targets = [
  { arch: "x64", platform: "darwin", target: "bun-darwin-x64" },
  { arch: "arm64", platform: "darwin", target: "bun-darwin-arm64" },
  { arch: "x64", platform: "linux", target: "bun-linux-x64" },
  { arch: "arm64", platform: "linux", target: "bun-linux-arm64" },
  { arch: "x64", platform: "win32", target: "bun-windows-x64" },
] as const;

for (const { platform, arch, target } of targets) {
  const asset = assetNameFor(platform, arch);
  // Bun appends `.exe` for windows targets, so strip it from the outfile to
  // land on the exact asset name rather than `…​.exe.exe`.
  const outfile = path.join(outdir, asset.replace(/\.exe$/, ""));

  console.log(`Compiling ${asset}…`);

  try {
    await compileDocent({ outfile, target });
  } catch (error) {
    console.error(`Failed to compile ${asset}:`);
    console.error(error);
    process.exit(1);
  }
}
