import { describe, expect, test } from "bun:test";
import { assetsFromManifest, contentTypeFor, lookupAsset } from "./assets.ts";

describe("contentTypeFor", () => {
  test("maps known extensions and defaults to octet-stream", () => {
    expect(contentTypeFor("/index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("/assets/index-abc.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeFor("/assets/app.CSS")).toBe("text/css; charset=utf-8");
    expect(contentTypeFor("/assets/font.woff2")).toBe("font/woff2");
    expect(contentTypeFor("/assets/blob")).toBe("application/octet-stream");
  });
});

describe("assetsFromManifest + lookupAsset", () => {
  const assets = assetsFromManifest([
    { file: "/embed/index.html", path: "/index.html" },
    { file: "/embed/assets/app.js", path: "/assets/app.js" },
  ]);

  test("keys by request path and derives the content type", () => {
    expect(assets.get("/assets/app.js")).toEqual({
      contentType: "text/javascript; charset=utf-8",
      filePath: "/embed/assets/app.js",
    });
  });

  test("serves index.html at the root path", () => {
    expect(lookupAsset(assets, "/")?.filePath).toBe("/embed/index.html");
  });

  test("returns undefined for unmapped paths (the 404 / traversal guard)", () => {
    expect(lookupAsset(assets, "/nope.js")).toBeUndefined();
    expect(lookupAsset(assets, "/assets/%2e%2e/secret")).toBeUndefined();
  });
});
