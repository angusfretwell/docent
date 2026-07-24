import { describe, expect, test } from "bun:test";

import { createStore } from "jotai";

import { createRevealTarget, nextReveal } from "./reveal-target";

describe("nextReveal", () => {
  test("carries the target's identity on the named field", () => {
    const request = nextReveal("id", "file.ts", null);

    expect(request).toEqual({ id: "file.ts", token: 1 });
  });

  test("bumps the token so a repeat request is distinct from the last", () => {
    const first = nextReveal("key", "sec_1", null);
    const second = nextReveal("key", "sec_1", first);

    expect(second).toEqual({ key: "sec_1", token: 2 });
  });
});

describe("createRevealTarget", () => {
  test("re-revealing the same target yields a fresh request each time", () => {
    const { targetAtom } = createRevealTarget("id");
    const store = createStore();

    store.set(targetAtom, nextReveal("id", "file.ts", store.get(targetAtom)));
    const first = store.get(targetAtom);
    store.set(targetAtom, nextReveal("id", "file.ts", store.get(targetAtom)));
    const second = store.get(targetAtom);

    expect(first).toEqual({ id: "file.ts", token: 1 });
    expect(second).toEqual({ id: "file.ts", token: 2 });
  });

  test("each channel keeps its own request", () => {
    const diff = createRevealTarget("id");
    const section = createRevealTarget("key");
    const store = createStore();

    store.set(diff.targetAtom, nextReveal("id", "file.ts", null));

    expect(store.get(diff.targetAtom)).toEqual({ id: "file.ts", token: 1 });
    expect(store.get(section.targetAtom)).toBeNull();
  });
});
