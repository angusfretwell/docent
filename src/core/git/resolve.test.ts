import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { makeTestRuntime } from "@test-support/runtime";

import {
  cleanupScratchDirs,
  git,
  scratchDir,
  scratchRepo,
} from "../test-fixtures";
import {
  resolveAuthor,
  resolveBlob,
  resolveBlobSize,
  resolveChange,
  resolveChangeRefs,
} from "./resolve";

const runtime = makeTestRuntime();

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function resolve(cwd: string) {
  return runtime.runPromise(resolveChange(cwd));
}

function repoWithOneCommit() {
  return scratchRepo("docent-git-test-");
}

describe("resolveChange", () => {
  test("renders the merge-base..head diff of a feature branch", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "feature.txt"), "new file\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "add feature file");

    const change = await resolve(repo);

    expect(change.branch).toBe("feature");
    expect(change.defaultBranch).toBe("main");
    expect(change.headSha).toBe(git(repo, "rev-parse", "HEAD"));
    expect(change.baseSha).toBe(git(repo, "rev-parse", "main"));
    expect(change.patch).toContain("feature.txt");
    expect(change.patch).toContain("+new file");
  });

  test("uses the merge-base, not the default branch tip (three-dot semantics)", async () => {
    const repo = repoWithOneCommit();
    const branchPoint = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "feature.txt"), "on feature\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "feature work");
    // main moves on after the branch point — its changes must NOT show up.
    git(repo, "checkout", "main");
    writeFileSync(path.join(repo, "main-only.txt"), "on main\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "main work");
    git(repo, "checkout", "feature");

    const change = await resolve(repo);

    expect(change.baseSha).toBe(branchPoint);
    expect(change.patch).toContain("feature.txt");
    expect(change.patch).not.toContain("main-only.txt");
  });

  test("resolves the repo root from a subdirectory", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "change.txt"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "change");
    const sub = path.join(repo, "nested", "deep");
    mkdirSync(sub, { recursive: true });

    const change = await resolve(sub);

    // macOS tmpdir is a symlink (/tmp → /private/tmp); compare resolved paths.
    expect(git(change.root, "rev-parse", "--show-toplevel")).toBe(
      git(repo, "rev-parse", "--show-toplevel")
    );
    expect(change.patch).toContain("change.txt");
  });

  test("prefers origin/HEAD's branch as the default branch", async () => {
    const upstream = repoWithOneCommit();
    git(upstream, "branch", "-m", "main", "trunk");
    const dir = scratchDir("docent-git-test-");
    git(dir, "clone", upstream, "clone");
    const repo = path.join(dir, "clone");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "feature.txt"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "feature work");

    const change = await resolve(repo);

    expect(change.defaultBranch).toBe("trunk");
    expect(change.baseSha).toBe(git(repo, "rev-parse", "origin/trunk"));
  });

  test("falls back to master when there is no origin and no main", async () => {
    const repo = scratchDir("docent-git-test-");
    git(repo, "init", "-b", "master");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    writeFileSync(path.join(repo, "hello.txt"), "hello\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "initial");
    git(repo, "checkout", "-b", "feature");

    const change = await resolve(repo);

    expect(change.defaultBranch).toBe("master");
  });

  test("returns an empty patch when checked out on the default branch", async () => {
    const repo = repoWithOneCommit();

    const change = await resolve(repo);

    expect(change.branch).toBe("main");
    expect(change.baseSha).toBe(change.headSha);
    expect(change.patch).toBe("");
  });

  test("rejects a directory that is not a git repo", async () => {
    const dir = scratchDir("docent-git-test-");

    await expect(resolve(dir)).rejects.toThrow(/not a git repository/i);
  });

  test("reports .gitattributes linguist-generated / -vendored changed paths as generated", async () => {
    const repo = repoWithOneCommit();
    writeFileSync(
      path.join(repo, ".gitattributes"),
      "api.gen.ts linguist-generated=true\nvendor/** linguist-vendored\n"
    );
    git(repo, "add", ".");
    git(repo, "commit", "-m", "attributes");
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "api.gen.ts"), "export const x = 1;\n");
    mkdirSync(path.join(repo, "vendor"), { recursive: true });
    writeFileSync(
      path.join(repo, "vendor", "lib.js"),
      "module.exports = {};\n"
    );
    writeFileSync(path.join(repo, "src.ts"), "export const y = 2;\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "generated + real work");

    const change = await resolve(repo);

    expect([...change.generated].toSorted()).toEqual([
      "api.gen.ts",
      "vendor/lib.js",
    ]);
  });

  test("normalizes an scp-like origin remote to a browsable https URL", async () => {
    const repo = repoWithOneCommit();
    git(repo, "remote", "add", "origin", "git@github.com:acme/widgets.git");

    const change = await resolve(repo);

    expect(change.remoteUrl).toBe("https://github.com/acme/widgets");
  });

  test("normalizes an ssh:// origin remote, dropping user and port", async () => {
    const repo = repoWithOneCommit();
    git(
      repo,
      "remote",
      "add",
      "origin",
      "ssh://git@github.com:2222/acme/widgets.git"
    );

    const change = await resolve(repo);

    expect(change.remoteUrl).toBe("https://github.com/acme/widgets");
  });

  test("strips .git from an https origin remote", async () => {
    const repo = repoWithOneCommit();
    git(repo, "remote", "add", "origin", "https://github.com/acme/widgets.git");

    const change = await resolve(repo);

    expect(change.remoteUrl).toBe("https://github.com/acme/widgets");
  });

  test("remoteUrl is null when the repo has no origin remote", async () => {
    const repo = repoWithOneCommit();

    const change = await resolve(repo);

    expect(change.remoteUrl).toBeNull();
  });

  test("generated is empty when the working tree has no attributes", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "plain.ts"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "plain");

    const change = await resolve(repo);

    expect(change.generated).toEqual([]);
  });
});

describe("resolveChangeRefs", () => {
  test("resolves the (baseSha, headSha) identity without a diff", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "feature.txt"), "new file\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "add feature file");

    const refs = await runtime.runPromise(resolveChangeRefs(repo));

    expect(refs.branch).toBe("feature");
    expect(refs.defaultBranch.name).toBe("main");
    expect(refs.headSha).toBe(git(repo, "rev-parse", "HEAD"));
    expect(refs.baseSha).toBe(git(repo, "rev-parse", "main"));
  });
});

describe("resolveAuthor", () => {
  test("reads the human author from git config", async () => {
    const repo = repoWithOneCommit();
    git(repo, "config", "user.email", "angus@example.com");
    git(repo, "config", "user.name", "Angus");

    const author = await runtime.runPromise(resolveAuthor(repo));

    expect(author).toEqual({
      display: "Angus",
      id: "angus@example.com",
      kind: "human",
    });
  });

  test("degrades to a placeholder when git identity is unset", async () => {
    const repo = scratchDir("docent-git-test-");
    git(repo, "init", "-b", "main");
    // Empty local values shadow any global config so the placeholder path runs
    // deterministically regardless of the machine's git identity.
    git(repo, "config", "user.email", "");
    git(repo, "config", "user.name", "");

    const author = await runtime.runPromise(resolveAuthor(repo));

    expect(author.kind).toBe("human");
    expect(author.id).toBe("unknown");
    expect(author.display).toBe("You");
  });
});

describe("resolveBlob", () => {
  function blob(cwd: string, sha: string) {
    return runtime.runPromise(resolveBlob(cwd, sha));
  }

  test("returns the raw bytes of a blob addressed by its object id", async () => {
    const repo = repoWithOneCommit();
    const sha = git(repo, "rev-parse", "HEAD:hello.txt");

    const bytes = await blob(repo, sha);

    expect(new TextDecoder().decode(bytes)).toBe("hello\n");
  });

  test("resolves an abbreviated object id", async () => {
    const repo = repoWithOneCommit();
    const sha = git(repo, "rev-parse", "HEAD:hello.txt").slice(0, 8);

    const bytes = await blob(repo, sha);

    expect(new TextDecoder().decode(bytes)).toBe("hello\n");
  });

  test("preserves binary bytes verbatim (no text decode, no newline trim)", async () => {
    const repo = repoWithOneCommit();
    const raw = new Uint8Array([0x00, 0xff, 0x0a, 0x42, 0x0a]);
    writeFileSync(path.join(repo, "blob.bin"), raw);
    git(repo, "add", ".");
    git(repo, "commit", "-m", "add binary");
    const sha = git(repo, "rev-parse", "HEAD:blob.bin");

    const bytes = await blob(repo, sha);

    expect([...bytes]).toEqual([...raw]);
  });

  test("rejects a sha that is not a valid git object", async () => {
    const repo = repoWithOneCommit();

    await expect(
      blob(repo, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
    ).rejects.toThrow();
  });

  test("rejects a malformed (non-hex) object id", async () => {
    const repo = repoWithOneCommit();

    await expect(blob(repo, "../../etc/passwd")).rejects.toThrow(/object id/i);
  });
});

describe("resolveBlobSize", () => {
  function size(cwd: string, sha: string) {
    return runtime.runPromise(resolveBlobSize(cwd, sha));
  }

  test("returns the byte size of a blob without streaming its content", async () => {
    const repo = repoWithOneCommit();
    const raw = new Uint8Array([0x00, 0xff, 0x0a, 0x42, 0x0a, 0x01]);
    writeFileSync(path.join(repo, "blob.bin"), raw);
    git(repo, "add", ".");
    git(repo, "commit", "-m", "add binary");
    const sha = git(repo, "rev-parse", "HEAD:blob.bin");

    expect(await size(repo, sha)).toBe(raw.length);
  });

  test("rejects a malformed object id before running git", async () => {
    const repo = repoWithOneCommit();

    await expect(size(repo, "../../etc/passwd")).rejects.toThrow(/object id/i);
  });
});
