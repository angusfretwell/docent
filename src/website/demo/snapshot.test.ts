import { describe, expect, test } from "bun:test";

import { requestFromKey, requestKey } from "./snapshot";

describe("requestKey", () => {
  test("an absolute url keys on its path, so a recording is origin-independent", () => {
    expect(
      requestKey({ method: "GET", url: "http://localhost:4801/api/review" })
    ).toBe("GET /api/review");
  });

  test("the method is upper-cased, so a recording and a replay agree", () => {
    expect(requestKey({ method: "post", url: "/api/comments" })).toBe(
      "POST /api/comments"
    );
  });

  test("search params are sorted, so query order does not fork the key", () => {
    expect(requestKey({ method: "GET", url: "/api/pending?b=2&a=1" })).toBe(
      requestKey({ method: "GET", url: "/api/pending?a=1&b=2" })
    );
  });

  test("the basepath is stripped, so a demo under a prefix hits the recording", () => {
    expect(
      requestKey({
        basepath: "/demo",
        method: "GET",
        url: "http://docent.website/demo/api/review",
      })
    ).toBe("GET /api/review");
  });

  test("a request for the basepath itself keys as the root", () => {
    expect(requestKey({ basepath: "/demo", method: "GET", url: "/demo" })).toBe(
      "GET /"
    );
  });
});

describe("requestFromKey", () => {
  test("a key round-trips back to the request that produced it", () => {
    const key = requestKey({ method: "GET", url: "/api/pending?range=nested" });

    const request = requestFromKey(key);

    expect(requestKey({ method: request.method, url: request.url })).toBe(key);
  });
});
