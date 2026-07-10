/**
 * Pure helpers for the `docent` npm shim — the platform→asset mapping and the
 * GitHub Release download URL. Kept side-effect-free (no fs, no network) so
 * they are unit-testable; `shim.mjs` wires them to the real download+exec.
 *
 * Plain Node ESM: this package ships without a runtime, so `npx docent` runs
 * it on the user's Node before any docent binary exists.
 */

/** GitHub `owner/repo` the release assets are published under. */
export const REPO = "angusfretwell/docent";

/**
 * The Release asset name for a platform, matching the names the release
 * workflow uploads (`docent-<os>-<arch>[.exe]`). Throws on an unsupported
 * platform so the shim can print a clear message instead of 404ing.
 */
export function assetNameFor(platform, arch) {
  const os = { darwin: "darwin", linux: "linux", win32: "windows" }[platform];
  const cpu = { arm64: "arm64", x64: "x64" }[arch];
  if (os === undefined || cpu === undefined) {
    throw new Error(`unsupported platform: ${platform}/${arch}`);
  }
  // Bun has no Windows arm64 --compile target yet.
  if (os === "windows" && cpu === "arm64") {
    throw new Error("unsupported platform: win32/arm64");
  }
  const ext = os === "windows" ? ".exe" : "";
  return `docent-${os}-${cpu}${ext}`;
}

/** The GitHub Release download URL for `assetName` at package `version`. */
export function downloadUrl(version, assetName, repo = REPO) {
  return `https://github.com/${repo}/releases/download/v${version}/${assetName}`;
}
