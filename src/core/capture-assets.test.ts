import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { makeTestRuntime } from "@test/runtime";

import { inlineCaptureAssets } from "./capture-assets";

const runtime = makeTestRuntime();
const run = runtime.runPromise;

const FONT = new Uint8Array([119, 79, 70, 50, 1, 2, 3, 4]);
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let origin = "";
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    fetch(request) {
      const { pathname } = new URL(request.url);

      if (pathname.endsWith("font.woff2")) {
        return new Response(FONT, {
          headers: { "content-type": "font/woff2" },
        });
      }
      if (pathname === "/logo.png") {
        return new Response(PNG, { headers: { "content-type": "image/png" } });
      }
      if (pathname === "/styles/app.css") {
        return new Response(
          '@font-face{font-family:Inter;src:url("./font.woff2")}',
          { headers: { "content-type": "text/css" } }
        );
      }

      return new Response("no", { status: 404 });
    },
    port: 0,
  });
  origin = `http://localhost:${server.port}`;
});

afterAll(async () => {
  server.stop(true);
  await runtime.dispose();
});

const fontBase64 = Buffer.from(FONT).toString("base64");
const pngBase64 = Buffer.from(PNG).toString("base64");

function encode(events: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(events));
}

function stream(node: unknown): unknown[] {
  return [
    { data: { height: 800, href: `${origin}/signup`, width: 1280 }, type: 4 },
    { data: { initialOffset: { left: 0, top: 0 }, node }, type: 2 },
  ];
}

async function inline(events: unknown) {
  const result = await run(inlineCaptureAssets(encode(events)));

  return {
    events: JSON.parse(new TextDecoder().decode(result.media)) as unknown,
    report: result.report,
  };
}

function firstNode(events: unknown): Record<string, unknown> {
  const [, snapshot] = events as [unknown, { data: { node: unknown } }];

  return snapshot.data.node as Record<string, unknown>;
}

describe("inlineCaptureAssets", () => {
  test("inlines a font an inlined stylesheet points at", async () => {
    const events = stream({
      attributes: {
        _cssText: `@font-face{font-family:Inter;src:url("${origin}/font.woff2") format("woff2")}`,
      },
      childNodes: [],
      id: 5,
      tagName: "style",
      type: 2,
    });

    const result = await inline(events);

    expect(firstNode(result.events).attributes).toEqual({
      _cssText: `@font-face{font-family:Inter;src:url("data:font/woff2;base64,${fontBase64}") format("woff2")}`,
    });
    expect(result.report.inlined).toBe(1);
    expect(result.report.bytes).toBe(FONT.length);
  });

  test("inlines an element's src", async () => {
    const events = stream({
      attributes: { src: `${origin}/logo.png` },
      childNodes: [],
      id: 6,
      tagName: "img",
      type: 2,
    });

    const result = await inline(events);

    expect(firstNode(result.events).attributes).toEqual({
      src: `data:image/png;base64,${pngBase64}`,
    });
  });

  test("reads an unreadable cross-origin stylesheet into _cssText, with its own assets inlined", async () => {
    const events = stream({
      attributes: { href: `${origin}/styles/app.css`, rel: "stylesheet" },
      childNodes: [],
      id: 7,
      tagName: "link",
      type: 2,
    });

    const result = await inline(events);

    expect(firstNode(result.events).attributes).toEqual({
      _cssText: `@font-face{font-family:Inter;src:url("data:font/woff2;base64,${fontBase64}")}`,
    });
  });

  test("leaves a font preload with nothing to request", async () => {
    const events = stream({
      attributes: {
        as: "font",
        href: `${origin}/font.woff2`,
        rel: "preload",
      },
      childNodes: [],
      id: 8,
      tagName: "link",
      type: 2,
    });

    const result = await inline(events);

    expect(firstNode(result.events).attributes).toEqual({
      as: "font",
      rel: "preload",
    });
  });

  test("inlines assets that arrive mid-recording", async () => {
    const events = [
      ...stream({
        attributes: {},
        childNodes: [],
        id: 1,
        tagName: "body",
        type: 2,
      }),
      {
        data: {
          adds: [
            {
              node: {
                attributes: { src: `${origin}/logo.png` },
                childNodes: [],
                id: 9,
                tagName: "img",
                type: 2,
              },
              parentId: 1,
            },
          ],
          source: 0,
        },
        type: 3,
      },
    ];

    const result = await inline(events);
    const mutation = (
      result.events as {
        data: { adds: [{ node: { attributes: Record<string, string> } }] };
      }[]
    ).at(2);

    expect(mutation?.data.adds[0].node.attributes.src).toBe(
      `data:image/png;base64,${pngBase64}`
    );
  });

  test("fetches each asset once, however many places point at it", async () => {
    const events = stream({
      attributes: {},
      childNodes: [
        {
          attributes: { src: `${origin}/logo.png` },
          childNodes: [],
          id: 11,
          tagName: "img",
          type: 2,
        },
        {
          attributes: { src: `${origin}/logo.png` },
          childNodes: [],
          id: 12,
          tagName: "img",
          type: 2,
        },
      ],
      id: 10,
      tagName: "body",
      type: 2,
    });

    const result = await inline(events);

    expect(result.report.inlined).toBe(1);
  });

  test("reports an asset it could not read and leaves the url alone", async () => {
    const events = stream({
      attributes: { src: `${origin}/missing.png` },
      childNodes: [],
      id: 13,
      tagName: "img",
      type: 2,
    });

    const result = await inline(events);

    expect(firstNode(result.events).attributes).toEqual({
      src: `${origin}/missing.png`,
    });
    expect(result.report.inlined).toBe(0);
    expect(result.report.skipped).toEqual([
      { reason: "responded 404", url: `${origin}/missing.png` },
    ]);
  });

  test("hands back the same bytes when there is nothing to inline", async () => {
    const media = encode(
      stream({
        attributes: { src: "data:image/gif;base64,R0lGOD" },
        childNodes: [],
        id: 14,
        tagName: "img",
        type: 2,
      })
    );

    const result = await run(inlineCaptureAssets(media));

    expect(result.media).toBe(media);
  });
});
