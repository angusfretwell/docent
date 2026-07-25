import { describe, expect, test } from "bun:test";

import type { Anchor } from "@shared/schemas/comment";

import {
  identityAnchorDrift,
  identityDrift,
  latestCodeWalkthrough,
  latestProductWalkthrough,
} from "./identity-drift";

describe("latestCodeWalkthrough", () => {
  test("picks the newest code walkthrough by id, ignoring product", () => {
    const entries = [
      { id: "wlk_01A", kind: "code" as const },
      { id: "wlk_01C", kind: "product" as const },
      { id: "wlk_01B", kind: "code" as const },
    ];
    expect(latestCodeWalkthrough(entries)?.id).toBe("wlk_01B");
  });

  test("no code walkthrough yields undefined", () => {
    expect(
      latestCodeWalkthrough([{ id: "wlk_01C", kind: "product" as const }])
    ).toBeUndefined();
  });
});

describe("latestProductWalkthrough", () => {
  test("picks the newest product walkthrough by id, ignoring code", () => {
    const entries = [
      { id: "wlk_01A", kind: "product" as const },
      { id: "wlk_01D", kind: "code" as const },
      { id: "wlk_01C", kind: "product" as const },
    ];
    expect(latestProductWalkthrough(entries)?.id).toBe("wlk_01C");
  });

  test("no product walkthrough yields undefined", () => {
    expect(
      latestProductWalkthrough([{ id: "wlk_01A", kind: "code" as const }])
    ).toBeUndefined();
  });
});

describe("identityDrift", () => {
  test("present in the shown walkthrough is live; absent is outdated (no shifted)", () => {
    expect(identityDrift(true)).toBe("live");
    expect(identityDrift(false)).toBe("outdated");
  });
});

function codeWalkthrough(
  id: string,
  sections: readonly { body: string; id: string }[]
) {
  return { id, kind: "code" as const, sections };
}

function productWalkthrough(
  id: string,
  sections: readonly {
    body: string;
    captures?: readonly string[];
    id: string;
  }[]
) {
  return { id, kind: "product" as const, sections };
}

describe("identityAnchorDrift", () => {
  test("a walkthrough-section on the latest walkthrough is live at its born prose", () => {
    const walkthroughs = [
      codeWalkthrough("wlk_01A", [{ body: "Intro prose.", id: "sec_1" }]),
    ];
    const anchor = {
      kind: "walkthrough-section" as const,
      sectionId: "sec_1",
      walkthroughId: "wlk_01A",
    };

    const drift = identityAnchorDrift(anchor as Anchor, walkthroughs);

    expect(drift).toEqual({ bornText: "Intro prose.", state: "live" });
  });

  test("a walkthrough-section on a superseded walkthrough detaches to its born prose", () => {
    const walkthroughs = [
      codeWalkthrough("wlk_01A", [{ body: "Old intro.", id: "sec_1" }]),
      codeWalkthrough("wlk_01B", [{ body: "New intro.", id: "sec_1" }]),
    ];
    const anchor = {
      kind: "walkthrough-section" as const,
      sectionId: "sec_1",
      walkthroughId: "wlk_01A",
    };

    const drift = identityAnchorDrift(anchor as Anchor, walkthroughs);

    expect(drift).toEqual({ bornText: "Old intro.", state: "outdated" });
  });

  test("a walkthrough-section whose walkthrough is gone is outdated with no born prose", () => {
    const anchor = {
      kind: "walkthrough-section" as const,
      sectionId: "sec_1",
      walkthroughId: "wlk_gone",
    };

    const drift = identityAnchorDrift(anchor as Anchor, [
      codeWalkthrough("wlk_01B", [{ body: "unrelated", id: "sec_1" }]),
    ]);

    expect(drift).toEqual({ state: "outdated" });
  });

  test("a product-pillar walkthrough-section rolls off the latest product walkthrough", () => {
    const walkthroughs = [
      productWalkthrough("wlk_02A", [{ body: "Tour step.", id: "sec_1" }]),
      productWalkthrough("wlk_02B", [{ body: "Newer step.", id: "sec_1" }]),
    ];
    const anchor = {
      kind: "walkthrough-section" as const,
      sectionId: "sec_1",
      walkthroughId: "wlk_02A",
    };

    expect(identityAnchorDrift(anchor as Anchor, walkthroughs)).toEqual({
      bornText: "Tour step.",
      state: "outdated",
    });
  });

  test("a capture arm is live while its capture is placed in the latest product walkthrough", () => {
    const walkthroughs = [
      productWalkthrough("wlk_01A", [
        { body: "See {{capture:0}}", captures: ["cap_a"], id: "sec_1" },
      ]),
    ];
    const anchor = { capture: "cap_a", kind: "screenshot-region" as const };

    expect(identityAnchorDrift(anchor as Anchor, walkthroughs)).toEqual({
      state: "live",
    });
  });

  test("a capture arm is outdated once a newer product walkthrough drops its capture", () => {
    const walkthroughs = [
      productWalkthrough("wlk_01A", [
        { body: "old", captures: ["cap_a"], id: "sec_1" },
      ]),
      productWalkthrough("wlk_01B", [
        { body: "new", captures: ["cap_b"], id: "sec_1" },
      ]),
    ];
    const anchor = {
      capture: "cap_a",
      fromMs: 100,
      kind: "recording-timestamp" as const,
    };

    expect(identityAnchorDrift(anchor as Anchor, walkthroughs)).toEqual({
      state: "outdated",
    });
  });

  test("a text-span is live while its section survives, detaching to its born quote", () => {
    const walkthroughs = [
      productWalkthrough("wlk_01A", [
        { body: "The Save button commits.", id: "sec_1" },
      ]),
    ];
    const anchor = {
      kind: "text-span" as const,
      quote: "Save button",
      section: "sec_1",
    };

    expect(identityAnchorDrift(anchor as Anchor, walkthroughs)).toEqual({
      bornText: "Save button",
      state: "live",
    });
  });

  test("a text-span whose section is gone is outdated at its born quote", () => {
    const walkthroughs = [
      productWalkthrough("wlk_01B", [{ body: "unrelated", id: "sec_9" }]),
    ];
    const anchor = {
      kind: "text-span" as const,
      quote: "Save button",
      section: "sec_1",
    };

    expect(identityAnchorDrift(anchor as Anchor, walkthroughs)).toEqual({
      bornText: "Save button",
      state: "outdated",
    });
  });

  test("a content-addressed anchor is not identity-classified", () => {
    const anchor = {
      blobSha: "X",
      file: "a.ts",
      kind: "line" as const,
      lines: [1, 2] as [number, number],
      side: "head" as const,
    };

    expect(identityAnchorDrift(anchor as Anchor, [])).toBeUndefined();
  });
});
