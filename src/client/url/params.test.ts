import { describe, expect, test } from "bun:test";

import type { DiffSearch, RootSearch } from "./params";
import * as params from "./params";

// The URL can carry arbitrary junk regardless of the validators' declared
// (navigation-facing) input types, so exercise them with unknown records.
const validateRootSearch = params.validateRootSearch as (
  search: Record<string, unknown>
) => RootSearch;
const validateDiffSearch = params.validateDiffSearch as (
  search: Record<string, unknown>
) => DiffSearch;

describe("validateRootSearch", () => {
  test("defaults an empty search", () => {
    const search = validateRootSearch({});

    expect(search).toEqual({ resolved: false });
  });

  test("passes through valid params", () => {
    const search = validateRootSearch({ finding: "fnd_001", resolved: true });

    expect(search).toEqual({ finding: "fnd_001", resolved: true });
  });

  test("drops malformed values back to defaults", () => {
    const search = validateRootSearch({ finding: 42, resolved: "yes" });

    expect(search).toEqual({ resolved: false });
  });
});

describe("validateDiffSearch", () => {
  test("defaults an empty search", () => {
    const search = validateDiffSearch({});

    expect(search).toEqual({
      range: "incremental",
      side: "head",
      view: "change",
    });
  });

  test("passes through a full deep link", () => {
    const search = validateDiffSearch({
      file: "src/a.ts",
      line: 12,
      range: "cumulative",
      side: "base",
      view: "pending",
    });

    expect(search).toEqual({
      file: "src/a.ts",
      line: 12,
      range: "cumulative",
      side: "base",
      view: "pending",
    });
  });

  test("drops malformed values back to defaults", () => {
    const search = validateDiffSearch({
      file: 7,
      line: "12",
      range: "sometimes",
      side: "left",
      view: "bogus",
    });

    expect(search).toEqual({
      range: "incremental",
      side: "head",
      view: "change",
    });
  });
});
