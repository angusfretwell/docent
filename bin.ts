#!/usr/bin/env bun

/**
 * The `docent` entry point and `bun build --compile` target
 * (docs/spec/architecture.md §5). Thin glue: it pulls in the generated
 * embedded-asset manifest — `bun build --compile` embeds every file the
 * manifest imports into the binary — and hands the assets to `runMain`, which
 * owns subcommand dispatch and the server boot.
 *
 * The manifest is generated from the Vite build by `scripts/embed-assets.ts`
 * (run via `bun run build`); it is not typechecked, so all real logic lives in
 * the typechecked `src/server/main.ts`.
 */

import { manifest } from "./dist/embedded/manifest.ts";
import { assetsFromManifest } from "./src/client/assets.ts";
import { runMain } from "./src/server/main.ts";

runMain(assetsFromManifest(manifest));
