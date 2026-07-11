import { describe, expect, test } from "bun:test";
import { assetNameFor, downloadUrl } from "./lib.mjs";

describe("assetNameFor", () => {
  test("maps supported platform/arch pairs to release asset names", () => {
    expect(assetNameFor("linux", "x64")).toBe("docent-linux-x64");
    expect(assetNameFor("linux", "arm64")).toBe("docent-linux-arm64");
    expect(assetNameFor("darwin", "x64")).toBe("docent-darwin-x64");
    expect(assetNameFor("darwin", "arm64")).toBe("docent-darwin-arm64");
    expect(assetNameFor("win32", "x64")).toBe("docent-windows-x64.exe");
  });

  test("throws on unsupported platforms", () => {
    expect(() => assetNameFor("win32", "arm64")).toThrow("unsupported");
    expect(() => assetNameFor("freebsd", "x64")).toThrow("unsupported");
    expect(() => assetNameFor("linux", "ia32")).toThrow("unsupported");
  });
});

describe("downloadUrl", () => {
  test("builds a tagged GitHub Release asset URL", () => {
    expect(downloadUrl("1.2.3", "docent-linux-x64")).toBe(
      "https://github.com/angusfretwell/docent/releases/download/v1.2.3/docent-linux-x64",
    );
  });
});
