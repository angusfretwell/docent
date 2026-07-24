import { describe, expect, test } from "bun:test";

import { flagScope, refusePositionals, skillsAddArgs } from "./install";
import { CliUsageError } from "./usage";

describe("flagScope", () => {
  test("no flag means the prompt decides (undefined)", () => {
    expect(flagScope({ global: false, project: false })).toBeUndefined();
  });

  test("--project selects project scope", () => {
    expect(flagScope({ global: false, project: true })).toBe("project");
  });

  test("--global selects user scope", () => {
    expect(flagScope({ global: true, project: false })).toBe("global");
  });

  test("--project and --global together is a usage error", () => {
    expect(() => flagScope({ global: true, project: true })).toThrow(
      CliUsageError
    );
  });
});

describe("refusePositionals", () => {
  test("no positional passes", () => {
    expect(() => refusePositionals([])).not.toThrow();
  });

  test("a positional is a usage error, so no install starts", () => {
    expect(() => refusePositionals(["./here"])).toThrow(CliUsageError);
  });
});

describe("skillsAddArgs", () => {
  test("project scope selects all skills non-interactively, no -g", () => {
    const args = skillsAddArgs("project");

    expect(args).toEqual([
      "skills",
      "add",
      "angusfretwell/docent",
      "-s",
      "*",
      "-y",
    ]);
  });

  test("global scope appends -g for a machine-wide install", () => {
    expect(skillsAddArgs("global")).toContain("-g");
  });
});
