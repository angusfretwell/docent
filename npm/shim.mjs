#!/usr/bin/env node
/**
 * The `docent` npm shim (docs/spec/architecture.md §5). The compiled binary is
 * ~100 MB, too large for the npm tarball, so this ~KB package downloads the
 * matching per-platform binary from GitHub Releases on first run, caches it,
 * and execs it — passing through argv, stdio, and exit code. `npx docent`
 * therefore boots the server and opens the browser with nothing preinstalled.
 */

import { spawn } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { get } from "node:https";
import { homedir } from "node:os";
import path from "node:path";

import { assetNameFor, downloadUrl } from "./lib.mjs";

const here = import.meta.dirname;

async function version() {
  const pkg = await readFile(path.join(here, "package.json"), "utf-8");
  return JSON.parse(pkg).version;
}

/** Where the downloaded binary for `version` is cached, per platform. */
function cachePath(v, assetName) {
  const base =
    process.env.DOCENT_CACHE_DIR ??
    path.join(homedir(), ".cache", "docent", "bin");
  return path.join(base, `${v}-${assetName}`);
}

/**
 * Stream `url` to a temp file next to `dest`, following GitHub's redirect to
 * the asset CDN. Resolves with the temp path (caller renames it into place).
 */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.${process.pid}.tmp`;
    mkdirSync(path.dirname(dest), { recursive: true });
    function onClosed() {
      resolve(tmp);
    }
    function onResponse(res) {
      const { statusCode = 0, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume();
        download(headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (statusCode !== 200) {
        res.resume();
        reject(new Error(`download failed (${statusCode}): ${url}`));
        return;
      }
      const file = createWriteStream(tmp);
      res.pipe(file);
      file.on("finish", () => file.close(onClosed));
      file.on("error", reject);
    }
    get(url, onResponse).on("error", reject);
  });
}

async function resolveBinary() {
  const assetName = assetNameFor(process.platform, process.arch);
  const v = await version();
  const bin = cachePath(v, assetName);
  if (existsSync(bin)) {
    return bin;
  }
  const url = downloadUrl(v, assetName);
  process.stderr.write(`docent: downloading ${assetName} v${v}…\n`);
  const tmp = await download(url, bin);
  chmodSync(tmp, 0o755);
  // Atomic publish so concurrent `npx docent` runs never see a partial file.
  renameSync(tmp, bin);
  return bin;
}

resolveBinary()
  .then((bin) => {
    const child = spawn(bin, process.argv.slice(2), { stdio: "inherit" });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code ?? 0);
      }
    });
    child.on("error", (error) => {
      process.stderr.write(`docent: ${error.message}\n`);
      process.exit(1);
    });
  })
  .catch((error) => {
    process.stderr.write(`docent: ${error.message}\n`);
    process.exit(1);
  });
