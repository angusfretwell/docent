import { describe, expect, test } from "bun:test";

import { Effect } from "effect";

import {
  recordFile,
  recordType,
  serializeFrontmatter,
  splitEnvelope,
} from "./records";

describe("serializeFrontmatter + recordFile + splitEnvelope", () => {
  test("round-trips an ordered field list with a flow-style nested value", async () => {
    const frontmatter = serializeFrontmatter([
      ["schema", "docent/finding"],
      ["changeId", "chg_001"],
      ["anchor", { file: "src/x.ts", kind: "line", lines: [42, 47] }],
      ["disposition", undefined],
    ]);
    const file = recordFile(frontmatter, "  the flush races the mark  \n");

    const { body, meta } = await Effect.runPromise(splitEnvelope(file));

    expect(meta).toEqual({
      anchor: { file: "src/x.ts", kind: "line", lines: [42, 47] },
      changeId: "chg_001",
      schema: "docent/finding",
    });
    expect(body).toBe("the flush races the mark");
  });

  test("recordFile omits the body block entirely for an empty body", () => {
    const file = recordFile("schema: docent/finding", "   \n");

    expect(file).toBe("---\nschema: docent/finding\n---\n");
  });
});

describe("splitEnvelope", () => {
  test("tolerates CRLF line endings around the fences", async () => {
    const file = "---\r\nschema: docent/finding\r\n---\r\nbody text\r\n";

    const { body, meta } = await Effect.runPromise(splitEnvelope(file));

    expect(meta).toEqual({ schema: "docent/finding" });
    expect(body).toBe("body text");
  });

  test("a file without --- fences yields empty meta and an empty body", async () => {
    const { body, meta } = await Effect.runPromise(
      splitEnvelope("no frontmatter here\n")
    );

    expect(meta).toEqual({});
    expect(body).toBe("");
  });

  test("fails with a typed error on malformed YAML frontmatter", async () => {
    const exit = await Effect.runPromiseExit(
      splitEnvelope("---\n[unterminated flow map: {\n---\nbody\n")
    );

    expect(exit._tag).toBe("Failure");
  });
});

describe("recordType", () => {
  test("lifts the type suffix from a NNN-<type>.md record name", () => {
    expect(recordType("002-reply.md")).toBe("reply");
    expect(recordType("001-open.md")).toBe("open");
  });

  test("a name outside the NNN-<type>.md shape yields undefined", () => {
    expect(recordType("manifest.json")).toBeUndefined();
    expect(recordType("002-bogus.md")).toBeUndefined();
  });
});
