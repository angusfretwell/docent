import { describe, expect, test } from "bun:test";

import { extentToRead, nudgeIntoRead, targetUnderRead } from "./reading";

const HEIGHT = 900;

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

describe("extentToRead", () => {
  test("reads from the widest run the viewport can hold whole", () => {
    const chosen = extentToRead(
      [extent(300, 320), extent(240, 420), extent(100, 700)],
      HEIGHT
    );

    expect(chosen).toEqual(extent(100, 700));
  });

  test("falls back to the paragraph when the section is too tall", () => {
    const chosen = extentToRead(
      [extent(300, 320), extent(240, 420), extent(-600, 1400)],
      HEIGHT
    );

    expect(chosen).toEqual(extent(240, 420));
  });

  test("reads from the anchor itself when nothing around it fits", () => {
    const chosen = extentToRead([extent(300, 320), extent(-800, 2000)], HEIGHT);

    expect(chosen).toEqual(extent(300, 320));
  });
});

describe("nudgeIntoRead", () => {
  test("leaves the prose where it is for a run already read from", () => {
    const nudge = nudgeIntoRead(extent(200, 500), HEIGHT);

    expect(nudge).toBe(0);
  });

  test("pulls a run starting below the read line up to it", () => {
    const nudge = nudgeIntoRead(extent(500, 700), HEIGHT);

    expect(nudge).toBe(200);
  });

  test("pushes a run scrolled off the top back down to the headroom", () => {
    const nudge = nudgeIntoRead(extent(-176, 200), HEIGHT);

    expect(nudge).toBe(-200);
  });

  test("brings a run's end into view rather than only its start", () => {
    const nudge = nudgeIntoRead(extent(250, 1000), HEIGHT);

    expect(nudge).toBe(124);
  });

  test("keeps a run too tall to hold whole starting at the headroom", () => {
    const nudge = nudgeIntoRead(extent(250, 2000), HEIGHT);

    expect(nudge).toBe(226);
  });
});
