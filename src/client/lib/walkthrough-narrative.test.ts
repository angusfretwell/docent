import { describe, expect, test } from "bun:test";

import type { FoldedFinding } from "@shared/lib/finding";

import { narrativeBySectionId } from "./walkthrough-narrative";

function finding(anchor: FoldedFinding["anchor"], body: string): FoldedFinding {
  return {
    anchor,
    body,
    id: `fnd_${body}`,
    participants: [],
    replies: [],
    resolved: false,
    whatsNext: "needs-action",
  };
}

describe("narrativeBySectionId", () => {
  test("groups walkthrough-section Findings on this walkthrough by section id", () => {
    const findings = [
      finding(
        {
          kind: "walkthrough-section",
          sectionId: "intro",
          walkthroughId: "wlk_a",
        },
        "first"
      ),
      finding(
        {
          kind: "walkthrough-section",
          sectionId: "intro",
          walkthroughId: "wlk_a",
        },
        "second"
      ),
      finding(
        {
          kind: "walkthrough-section",
          sectionId: "outro",
          walkthroughId: "wlk_a",
        },
        "third"
      ),
    ];

    const bySection = narrativeBySectionId(findings, "wlk_a");

    expect(bySection.get("intro")?.map((entry) => entry.body)).toEqual([
      "first",
      "second",
    ]);
    expect(bySection.get("outro")?.map((entry) => entry.body)).toEqual([
      "third",
    ]);
  });

  test("excludes Findings anchored to a different walkthrough", () => {
    const findings = [
      finding(
        {
          kind: "walkthrough-section",
          sectionId: "intro",
          walkthroughId: "wlk_b",
        },
        "other-walkthrough"
      ),
    ];

    const bySection = narrativeBySectionId(findings, "wlk_a");

    expect(bySection.size).toBe(0);
  });

  test("excludes Findings anchored to something other than a walkthrough section", () => {
    const findings = [
      finding({ kind: "change" }, "code-comment"),
      finding(undefined, "unanchored"),
    ];

    const bySection = narrativeBySectionId(findings, "wlk_a");

    expect(bySection.size).toBe(0);
  });
});
