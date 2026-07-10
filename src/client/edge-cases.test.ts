import { describe, expect, test } from "bun:test";
import {
  autoViewed,
  bodyReplaced,
  classifyFiles,
  isGeneratedPath,
  parsePatchBlocks,
} from "./edge-cases.ts";

const BINARY = `diff --git a/data.bin b/data.bin
index 8553878..4d72901 100644
Binary files a/data.bin and b/data.bin differ
`;

const IMAGE = `diff --git a/logo.png b/logo.png
index 0584e3b..97cd605 100644
Binary files a/logo.png and b/logo.png differ
`;

const MODE_ONLY = `diff --git a/perm.txt b/perm.txt
old mode 100644
new mode 100755
`;

const RENAME_PURE = `diff --git a/keep.txt b/renamed.txt
similarity index 100%
rename from keep.txt
rename to renamed.txt
`;

const RENAME_MODIFY = `diff --git a/old.txt b/new.txt
similarity index 80%
rename from old.txt
rename to new.txt
index de98044..a7bc997 100644
--- a/old.txt
+++ b/new.txt
@@ -1,2 +1,2 @@
 a
-b
+B
`;

const SUBMODULE = `diff --git a/sub b/sub
index abc1234..def5678 160000
--- a/sub
+++ b/sub
@@ -1 +1 @@
-Subproject commit abc1234000000000000000000000000000000000
+Subproject commit def5678000000000000000000000000000000000
`;

const NORMAL = `diff --git a/text.txt b/text.txt
index de98044..a7bc997 100644
--- a/text.txt
+++ b/text.txt
@@ -1,3 +1,4 @@
 a
-b
+B
 c
+d
`;

const MODE_AND_CONTENT = `diff --git a/exec.sh b/exec.sh
old mode 100644
new mode 100755
index de98044..a7bc997
--- a/exec.sh
+++ b/exec.sh
@@ -1,2 +1,2 @@
 a
-b
+B
`;

function classifyOne(block: string, generated: readonly string[] = []) {
  const map = classifyFiles(block, generated);
  const [only] = [...map.values()];
  if (only === undefined) {
    throw new Error("expected one classified file");
  }
  return only;
}

describe("parsePatchBlocks", () => {
  test("splits a multi-file patch into per-file blocks in order", () => {
    const blocks = parsePatchBlocks(BINARY + MODE_ONLY + NORMAL);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain("data.bin");
    expect(blocks[1]).toContain("perm.txt");
    expect(blocks[2]).toContain("text.txt");
  });

  test("does not split on a content line that begins with diff --git", () => {
    const patch = `diff --git a/a.txt b/a.txt
index 1..2 100644
--- a/a.txt
+++ b/a.txt
@@ -0,0 +1 @@
+diff --git a/x b/x
`;
    expect(parsePatchBlocks(patch)).toHaveLength(1);
  });

  test("empty patch yields no blocks", () => {
    expect(parsePatchBlocks("")).toHaveLength(0);
  });
});

describe("classifyFiles — per-case detection", () => {
  test("binary non-image", () => {
    const c = classifyOne(BINARY);
    expect(c.binary).toBe(true);
    expect(c.image).toBe(false);
    expect(c.submodule).toBe(false);
  });

  test("image is a binary subset flagged by extension", () => {
    const c = classifyOne(IMAGE);
    expect(c.binary).toBe(true);
    expect(c.image).toBe(true);
  });

  test("mode-only change with no content", () => {
    const c = classifyOne(MODE_ONLY);
    expect(c.modeOnly).toBe(true);
    expect(c.binary).toBe(false);
  });

  test("a mode change that also edits content is a normal diff, not mode-only", () => {
    const c = classifyOne(MODE_AND_CONTENT);
    expect(c.modeOnly).toBe(false);
  });

  test("pure rename", () => {
    const c = classifyOne(RENAME_PURE);
    expect(c.renamePure).toBe(true);
    expect(c.renameModify).toBe(false);
  });

  test("rename + modify", () => {
    const c = classifyOne(RENAME_MODIFY);
    expect(c.renameModify).toBe(true);
    expect(c.renamePure).toBe(false);
  });

  test("submodule gitlink is not misread as binary", () => {
    const c = classifyOne(SUBMODULE);
    expect(c.submodule).toBe(true);
    expect(c.binary).toBe(false);
  });

  test("ordinary text diff has no edge flags", () => {
    const c = classifyOne(NORMAL);
    expect(c.binary).toBe(false);
    expect(c.image).toBe(false);
    expect(c.modeOnly).toBe(false);
    expect(c.submodule).toBe(false);
    expect(c.renamePure).toBe(false);
    expect(c.renameModify).toBe(false);
    expect(c.large).toBe(false);
    expect(c.generated).toBe(false);
  });
});

describe("classifyFiles — large / minified", () => {
  test("a diff past the changed-line threshold is large", () => {
    const lines = Array.from({ length: 2100 }, (_, i) => `+line ${i}`).join("\n");
    const patch = `diff --git a/big.txt b/big.txt
index 1..2 100644
--- a/big.txt
+++ b/big.txt
@@ -0,0 +1,2100 @@
${lines}
`;
    expect(classifyOne(patch).large).toBe(true);
  });

  test("a minified megawide line is large even with few lines", () => {
    const wide = "x".repeat(9000);
    const patch = `diff --git a/app.js b/app.js
index 1..2 100644
--- a/app.js
+++ b/app.js
@@ -0,0 +1 @@
+${wide}
`;
    expect(classifyOne(patch).large).toBe(true);
  });

  test("a small text diff is not large", () => {
    expect(classifyOne(NORMAL).large).toBe(false);
  });
});

describe("isGeneratedPath — default glob set", () => {
  test.each([
    "bun.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "go.sum",
    "poetry.lock",
    "dist/bundle.js",
    "packages/x/dist/index.js",
    "vendor/lib.rb",
    "app.min.js",
    "styles.min.css",
    "bundle.js.map",
  ])("%s is generated by default glob", (path) => {
    expect(isGeneratedPath(path)).toBe(true);
  });

  test.each(["src/app.ts", "README.md", "package.json", "distinct.ts"])(
    "%s is not generated",
    (path) => {
      expect(isGeneratedPath(path)).toBe(false);
    },
  );
});

describe("classifyFiles — generated union", () => {
  test("a server-provided gitattributes path is generated", () => {
    const patch = `diff --git a/src/api.ts b/src/api.ts
index 1..2 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -0,0 +1 @@
+x
`;
    expect(classifyOne(patch, ["src/api.ts"]).generated).toBe(true);
    expect(classifyOne(patch, []).generated).toBe(false);
  });

  test("a default-glob lockfile is generated with no server hint", () => {
    const patch = `diff --git a/bun.lock b/bun.lock
index 1..2 100644
--- a/bun.lock
+++ b/bun.lock
@@ -0,0 +1 @@
+x
`;
    expect(classifyOne(patch).generated).toBe(true);
  });
});

describe("derived treatments", () => {
  test("pure rename and generated files auto-view", () => {
    expect(autoViewed({ generated: true } as never)).toBe(true);
    expect(autoViewed({ renamePure: true } as never)).toBe(true);
    expect(autoViewed({} as never)).toBe(false);
  });

  test("binary, image, mode-only and submodule replace their body", () => {
    expect(bodyReplaced({ binary: true } as never)).toBe(true);
    expect(bodyReplaced({ image: true } as never)).toBe(true);
    expect(bodyReplaced({ modeOnly: true } as never)).toBe(true);
    expect(bodyReplaced({ submodule: true } as never)).toBe(true);
    expect(bodyReplaced({ large: true } as never)).toBe(false);
  });
});

describe("classifyFiles — keying", () => {
  test("keys each class by the CodeView item id (name#index)", () => {
    const map = classifyFiles(BINARY + NORMAL, []);
    expect([...map.keys()]).toEqual(["data.bin#0", "text.txt#1"]);
  });
});
