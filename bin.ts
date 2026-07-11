#!/usr/bin/env bun

/**
 * The `docent` entry point and `bun build --compile` target
 * (docs/spec/architecture.md §5). Thin glue: it pulls in the generated
 * embedded-asset manifest — `bun build --compile` embeds every file the
 * manifest imports into the binary — and hands the assets to `runMain`, which
 * owns subcommand dispatch and the server boot.
 *
 * The manifest is generated from the Vite build by `scripts/embed-assets.ts`
 * (run via `bun run build`).
 */

import { manifest } from "./dist/embedded/manifest";
import { runMain } from "./src/server/main";
import { assetsFromManifest } from "./src/shared/lib/assets";

runMain(assetsFromManifest(manifest));
