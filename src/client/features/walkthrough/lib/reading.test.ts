import { describe, expect, test } from "bun:test";

import { nudgeIntoRead, targetUnderRead } from "./reading";

const HEIGHT = 900;

function anchor(key: string, top: number) {
  return { key, top };
}

describe("targetUnderRead", () => {
  test("answers with the last anchor the prose has been read past", () => {
    const reading = targetUnderRead(
      [anchor("a", 40), anchor("b", 280), anchor("c", 600)],
      HEIGHT
    );

    expect(reading).toBe("b");
  });

  test("answers with the first anchor while the reader is above them all", () => {
    const reading = targetUnderRead(
      [anchor("a", 500), anchor("b", 800)],
      HEIGHT
    );

    expect(reading).toBe("a");
  });

  test("answers with the first of anchors sharing a line", () => {
    const reading = targetUnderRead(
      [anchor("a", -200), anchor("b", 120), anchor("c", 120)],
      HEIGHT
    );

    expect(reading).toBe("b");
  });

  test("holds the last anchor once every one has scrolled away", () => {
    const reading = targetUnderRead(
      [anchor("a", -900), anchor("b", -400)],
      HEIGHT
    );

    expect(reading).toBe("b");
  });

  test("answers with nothing when the prose has no anchors", () => {
    const reading = targetUnderRead([], HEIGHT);

    expect(reading).toBeUndefined();
  });
});

describe("nudgeIntoRead", () => {
  test("leaves the prose where it is for an anchor already in the band", () => {
    const nudge = nudgeIntoRead(200, HEIGHT);

    expect(nudge).toBe(0);
  });

  test("pulls an anchor below the read line up to it", () => {
    const nudge = nudgeIntoRead(500, HEIGHT);

    expect(nudge).toBe(200);
  });

  test("pushes an anchor scrolled off the top back down to the headroom", () => {
    const nudge = nudgeIntoRead(-176, HEIGHT);

    expect(nudge).toBe(-200);
  });
});
