import { describe, expect, test } from "bun:test";

import { clampAxis, measure } from "./zoom-geometry";

describe("clampAxis", () => {
  test("centres the frame in the axis when it has slack to spare", () => {
    expect(clampAxis(999, 100)).toBe(50);
  });

  test("holds an overflowing frame to the near edge it is dragged past", () => {
    expect(clampAxis(-9000, -7000)).toBe(-7000);
  });

  test("leaves an in-bounds offset where it is", () => {
    expect(clampAxis(-30, -100)).toBe(-30);
  });

  test("never lets an overflowing frame drift past its far edge", () => {
    expect(clampAxis(500, -100)).toBe(0);
  });
});

describe("measure", () => {
  test("fits a capture larger than the stage and centres the slack axis", () => {
    const geometry = measure(
      [2000, 1000],
      { height: 1000, width: 1000 },
      {
        offset: { x: 0, y: 0 },
        scale: 0,
      }
    );

    expect(geometry.fitScale).toBe(0.5);
    expect(geometry.scale).toBe(0.5);
    expect(geometry.placed).toEqual({ x: 0, y: 250 });
  });

  test("never fits a capture smaller than the stage past its natural size", () => {
    const geometry = measure(
      [200, 100],
      { height: 1000, width: 1000 },
      {
        offset: { x: 0, y: 0 },
        scale: 0,
      }
    );

    expect(geometry.fitScale).toBe(1);
  });

  test("floors a step and the ceiling at cover so a zoom fills the stage", () => {
    const geometry = measure(
      [200, 100],
      { height: 1000, width: 1000 },
      {
        offset: { x: 0, y: 0 },
        scale: 0,
      }
    );

    expect(geometry.stepScale).toBe(10);
    expect(geometry.maxScale).toBe(10);
  });

  test("clamps a scale request to the ceiling", () => {
    const geometry = measure(
      [2000, 1000],
      { height: 1000, width: 1000 },
      {
        offset: { x: 0, y: 0 },
        scale: 99,
      }
    );

    expect(geometry.scale).toBe(4);
  });

  test("clamps a pushed offset to the edge once the frame overflows the stage", () => {
    const geometry = measure(
      [2000, 1000],
      { height: 1000, width: 1000 },
      {
        offset: { x: -9000, y: 0 },
        scale: 4,
      }
    );

    expect(geometry.slackX).toBe(-7000);
    expect(geometry.placed.x).toBe(-7000);
  });
});
