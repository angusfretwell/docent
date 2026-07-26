import { describe, expect, test } from "bun:test";

import { extentToRead, nudgeIntoRead, targetUnderRead } from "./reading";

const VIEW = { height: 900, remaining: 5000 };

function anchor(key: string, top: number) {
  return { key, top };
}

function extent(top: number, bottom: number) {
  return { bottom, top };
}

describe("targetUnderRead", () => {
  test("answers with the last anchor the prose has been read past", () => {
    const reading = targetUnderRead(
      [anchor("a", 40), anchor("b", 280), anchor("c", 600)],
      VIEW
    );

    expect(reading).toBe("b");
  });

  test("answers with the first anchor while the reader is above them all", () => {
    const reading = targetUnderRead([anchor("a", 500), anchor("b", 800)], VIEW);

    expect(reading).toBe("a");
  });

  test("answers with the first of anchors sharing a line", () => {
    const reading = targetUnderRead(
      [anchor("a", -200), anchor("b", 120), anchor("c", 120)],
      VIEW
    );

    expect(reading).toBe("b");
  });

  test("holds the last anchor once every one has scrolled away", () => {
    const reading = targetUnderRead(
      [anchor("a", -900), anchor("b", -400)],
      VIEW
    );

    expect(reading).toBe("b");
  });

  test("answers with nothing when the prose has no anchors", () => {
    const reading = targetUnderRead([], VIEW);

    expect(reading).toBeUndefined();
  });

  test("reaches the closing anchors once the prose runs out of travel", () => {
    const closing = [anchor("a", 100), anchor("b", 700)];

    expect(targetUnderRead(closing, { height: 900, remaining: 600 })).toBe("a");
    expect(targetUnderRead(closing, { height: 900, remaining: 0 })).toBe("b");
  });
});

describe("extentToRead", () => {
  test("reads from the widest run the viewport can hold whole", () => {
    const chosen = extentToRead(
      [extent(300, 320), extent(240, 420), extent(100, 700)],
      VIEW
    );

    expect(chosen).toEqual(extent(100, 700));
  });

  test("falls back to the paragraph when the section is too tall", () => {
    const chosen = extentToRead(
      [extent(300, 320), extent(240, 420), extent(-600, 1400)],
      VIEW
    );

    expect(chosen).toEqual(extent(240, 420));
  });

  test("reads from the anchor itself when nothing around it fits", () => {
    const chosen = extentToRead([extent(300, 320), extent(-800, 2000)], VIEW);

    expect(chosen).toEqual(extent(300, 320));
  });
});

describe("nudgeIntoRead", () => {
  test("leaves the prose where it is for a run already read from", () => {
    const nudge = nudgeIntoRead(extent(200, 500), VIEW);

    expect(nudge).toBe(0);
  });

  test("pulls a run starting below the read line up to it", () => {
    const nudge = nudgeIntoRead(extent(500, 700), VIEW);

    expect(nudge).toBe(200);
  });

  test("pushes a run scrolled off the top back down to the headroom", () => {
    const nudge = nudgeIntoRead(extent(-176, 200), VIEW);

    expect(nudge).toBe(-200);
  });

  test("brings a run's end into view rather than only its start", () => {
    const nudge = nudgeIntoRead(extent(250, 1000), VIEW);

    expect(nudge).toBe(124);
  });

  test("keeps a run too tall to hold whole starting at the headroom", () => {
    const nudge = nudgeIntoRead(extent(250, 2000), VIEW);

    expect(nudge).toBe(226);
  });
});
