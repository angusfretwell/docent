import { describe, expect, test } from "bun:test";

import { rangeWindow } from "./walkthrough-context";

const BLOB = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join(
  "\n"
);

describe("rangeWindow", () => {
  test("with no context, the window is exactly the range's core lines", () => {
    const window = rangeWindow(BLOB, [4, 6], 0);

    expect(window.lines).toEqual([4, 6]);
    expect(window.text).toBe("line 4\nline 5\nline 6");
  });

  test("context widens the window symmetrically and reports both sides open", () => {
    const window = rangeWindow(BLOB, [4, 6], 2);

    expect(window.lines).toEqual([2, 8]);
    expect(window.canExpandUp).toBe(true);
    expect(window.canExpandDown).toBe(true);
  });

  test("the window clamps to the file's first line and closes the up affordance", () => {
    const window = rangeWindow(BLOB, [2, 3], 5);

    expect(window.lines).toEqual([1, 8]);
    expect(window.canExpandUp).toBe(false);
    expect(window.canExpandDown).toBe(true);
  });

  test("expanding past the file's end clamps and closes the down affordance", () => {
    const window = rangeWindow(BLOB, [7, 9], 5);

    expect(window.lines).toEqual([2, 10]);
    expect(window.canExpandUp).toBe(true);
    expect(window.canExpandDown).toBe(false);
  });
});
