import { describe, expect, test } from "bun:test";

import { CliUsageError } from "./index";
import { parseInstallArgs, skillsAddArgs } from "./install";

describe("parseInstallArgs", () => {
  test("no flag means the prompt decides (undefined)", () => {
    expect(parseInstallArgs([])).toBeUndefined();
  });

  test("--project selects project scope", () => {
    expect(parseInstallArgs(["--project"])).toBe("project");
  });

  test("--global selects user scope", () => {
    expect(parseInstallArgs(["--global"])).toBe("global");
  });

  test("--project and --global together is a usage error", () => {
    expect(() => parseInstallArgs(["--project", "--global"])).toThrow(
      CliUsageError
    );
  });

  test("rejects an unknown flag", () => {
    expect(() => parseInstallArgs(["--user"])).toThrow(CliUsageError);
  });

  test("rejects a positional argument", () => {
    expect(() => parseInstallArgs(["./here"])).toThrow(CliUsageError);
  });
});

describe("skillsAddArgs", () => {
  test("project scope selects all skills non-interactively, no -g", () => {
    const args = skillsAddArgs("project");

    expect(args).toEqual(["skills", "add", "angusfretwell/docent", "-s", "*", "-y"]);
  });

  test("global scope appends -g for a machine-wide install", () => {
    expect(skillsAddArgs("global")).toContain("-g");
  });
});
